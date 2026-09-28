/**
 * Image pipeline.
 *
 * Requirement: product images must be WebP, lazy-loaded and served at
 * responsive sizes, and original high-resolution supplier photos must never be
 * shipped to the browser.
 *
 * Design decision - zero mandatory dependencies:
 *   `sharp` is loaded dynamically. If it is installed we produce a real
 *   WebP + JPEG responsive set (400/800/1200px) plus a tiny blurred preview.
 *   If it is NOT installed the app still works: uploads are stored as-is, we
 *   just skip the derivatives and warn in the admin UI. That keeps
 *   `node_modules` empty for the common case, which matters because this
 *   project targets low-storage machines.
 *
 *   To enable full optimisation:  npm install sharp
 */
import { mkdirSync, writeFileSync, existsSync, unlinkSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { paths } from '../db/index.js';

/* -------------------------------------------------------------------------- */
/* Optional sharp                                                              */
/* -------------------------------------------------------------------------- */

let sharpPromise;
let sharpAvailable = null;

async function loadSharp() {
  if (sharpAvailable !== null) return sharpAvailable;
  sharpPromise ??= import('sharp').then(
    (m) => {
      sharpAvailable = m.default ?? m;
      return sharpAvailable;
    },
    () => {
      sharpAvailable = false;
      return false;
    }
  );
  return sharpPromise;
}

export const isOptimisationAvailable = async () => Boolean(await loadSharp());

/** True when a file on disk is newer than the given timestamp. */
function isFresh(file, since) {
  try {
    return statSync(file).mtimeMs >= since;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Derived image sets                                                          */
/* -------------------------------------------------------------------------- */

/** Widths generated for product photos, plus a blur preview. */
const WIDTHS = [400, 800, 1200];
const BLUR_WIDTH = 24;

/**
 * Ensure every derivative exists for an already-uploaded image.
 * Idempotent: skips any file that is newer than `since`.
 *
 * @param {string} relPath  path under data/uploads, e.g. 'products/aw-1/main.jpg'
 * @param {number} since    only regenerate files older than this timestamp
 * @returns {Promise<{ width:number, height:number, dominant:string, blur?:string, srcset?:string }>}
 */
export async function ensureDerivatives(relPath, since = 0) {
  const abs = join(paths.uploads, relPath);
  if (!existsSync(abs)) return { width: 1200, height: 1200, dominant: '#eef2f7' };

  const sharp = await loadSharp();
  if (!sharp) return { width: 1200, height: 1200, dominant: '#eef2f7' };

  const relDir = dirNameOf(relPath);
  const dir = join(paths.uploads, relDir);
  const stem = basename(relPath, extname(relPath));
  mkdirSync(dir, { recursive: true });

  const meta = await sharp(abs).metadata();
  const out = { width: meta.width ?? 1200, height: meta.height ?? 1200, dominant: '#eef2f7', srcset: '' };

  // Dominant colour for the offline image-search provider + placeholder tint.
  try {
    const { dominant } = await sharp(abs).stats();
    out.dominant = rgbToHex(dominant.r, dominant.g, dominant.b);
  } catch {
    /* stats() is best-effort */
  }

  // Blurred preview, inlined as a data URI so cards never flash white.
  // sharp's resize() needs the options object as the sole argument.
  const blurFile = join(dir, `${stem}-blur.webp`);
  try {
    if (!isFresh(blurFile, since)) {
      const buf = await sharp(abs)
        .resize({ width: BLUR_WIDTH, withoutEnlargement: true })
        .blur(1.4)
        .webp({ quality: 30 })
        .toBuffer();
      writeFileSync(blurFile, buf);
    }
    out.blur = `data:image/webp;base64,${readFileSync(blurFile).toString('base64')}`;
  } catch {
    // A missing blur preview is cosmetic; never fail an upload over it.
    out.blur = null;
  }

  // Responsive WebP + JPEG set.
  const sources = [];
  for (const w of WIDTHS) {
    const webpFile = join(dir, `${stem}-${w}.webp`);
    const jpgFile = join(dir, `${stem}-${w}.jpg`);

    if (!isFresh(webpFile, since)) {
      await sharp(abs)
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 78, effort: 4 })
        .toFile(webpFile);
    }
    if (!isFresh(jpgFile, since)) {
      await sharp(abs)
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 80, progressive: true, mozjpeg: true })
        .toFile(jpgFile);
    }
    sources.push({ w, webp: `${relDir}/${stem}-${w}.webp`, jpg: `${relDir}/${stem}-${w}.jpg` });
  }
  out.srcset = sources;

  return out;
}

const dirNameOf = (p) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};

/* -------------------------------------------------------------------------- */
/* Uploads                                                                     */
/* -------------------------------------------------------------------------- */

const SAFE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

/**
 * Validate a multipart file and move it into place.
 *
 * @param {{ filename: string, type: string, data: Buffer }} file
 * @param {string} folder e.g. 'products/aw-12'
 * @returns {{ ok: true, relPath: string, bytes: number } | { ok: false, error: string }}
 */
export function storeUpload(file, folder) {
  if (!file || !file.data?.length) return { ok: false, error: 'No file received' };
  if (file.data.length > config.maxUploadBytes) {
    const mb = (config.maxUploadBytes / 1024 / 1024).toFixed(1);
    return { ok: false, error: `Image is too large (max ${mb} MB)` };
  }

  const ext = extname(file.filename || '').toLowerCase();
  if (!SAFE_EXT.has(ext)) {
    return { ok: false, error: 'Unsupported file type. Use JPG, PNG, WebP or AVIF.' };
  }

  // Verify the bytes really are an image (magic numbers), not a renamed file.
  if (!looksLikeImage(file.data)) {
    return { ok: false, error: 'That file is not a valid image' };
  }

  const dir = join(paths.uploads, folder);
  mkdirSync(dir, { recursive: true });

  const hash = createHash('sha1').update(file.data).digest('hex').slice(0, 10);
  const name = `${Date.now().toString(36)}-${hash}${ext === '.jpeg' ? '.jpg' : ext}`;
  const relPath = `${folder}/${name}`;
  writeFileSync(join(paths.uploads, relPath), file.data);

  return { ok: true, relPath, bytes: file.data.length };
}

function looksLikeImage(buf) {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 12).toString('hex');
  // JPEG, PNG, GIF, WEBP, AVIF/HEIF
  return (
    hex.startsWith('ffd8ff') ||
    hex.startsWith('89504e47') ||
    hex.startsWith('47494638') ||
    hex.slice(0, 8) === '52494646' || // RIFF (webp)
    hex.slice(4, 12) === '667479704' || // ftyp (avif/heic)
    hex.slice(8, 12) === '66747970'
  );
}

/* -------------------------------------------------------------------------- */
/* Colour helpers                                                              */
/* -------------------------------------------------------------------------- */

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/* -------------------------------------------------------------------------- */
/* Placeholder art                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Generate a lightweight SVG product placeholder.
 *
 * Used when a product has no photo yet, and as the category card art. Because
 * it is a few hundred bytes of vector it costs nothing to serve, which lets
 * the storefront look finished on day one.
 */
export function placeholderSvg({ label = 'AWAJ', tone = 'slate', seed = 0 } = {}) {
  const palettes = {
    slate: ['#e8edf5', '#c9d4e4', '#8b9bb4'],
    indigo: ['#e7e9fb', '#c2c6f4', '#7a80d6'],
    teal: ['#e0f2f0', '#b8e0da', '#5fa89c'],
    amber: ['#fdf0dd', '#f6dcae', '#d0a04a'],
    rose: ['#fde8ec', '#f6c8d2', '#c97f95'],
    violet: ['#f0e7fb', '#dccbf3', '#9d7cc9'],
  };
  const [bg, mid, fg] = palettes[tone] || palettes.slate;

  // Deterministic abstract shapes so every product looks slightly different.
  const rnd = (n) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const shapes = Array.from({ length: 4 }, (_, i) => {
    const cx = 20 + rnd(i * 3 + 1) * 160;
    const cy = 20 + rnd(i * 3 + 2) * 160;
    const r = 18 + rnd(i * 3 + 3) * 46;
    const op = (0.12 + rnd(i * 7) * 0.2).toFixed(2);
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${mid}" opacity="${op}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${escapeXml(label)}">
<rect width="200" height="200" fill="${bg}"/>
${shapes}
<text x="100" y="106" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="26" font-weight="700" fill="${fg}" letter-spacing="1">${escapeXml(String(label).slice(0, 8).toUpperCase())}</text>
</svg>`;
}

const escapeXml = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                 */
/* -------------------------------------------------------------------------- */

/** Remove derivative files whose source image no longer exists. */
export function sweepOrphanDerivatives() {
  let removed = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const m = /^(.+)-(\d+)\.(webp|jpg)$/.exec(entry.name) || /^(.+)-blur\.webp$/.exec(entry.name);
      if (!m) continue;
      const stem = m[1];
      const source = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].find((ext) =>
        existsSync(join(dir, `${stem}.${ext}`))
      );
      if (!source) {
        try {
          unlinkSync(full);
          removed += 1;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(paths.uploads);
  return removed;
}
