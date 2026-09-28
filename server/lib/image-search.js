/**
 * Image search.
 *
 * Requirement 4 asks for the UI and architecture to be in place now, with the
 * option to plug into an external AI/visual-search API later, and explicitly
 * says not to make local computer vision mandatory.
 *
 * So this module defines a small provider interface with two implementations:
 *
 *   1. externalApi  - POSTs the image to IMAGE_SEARCH_API_URL and expects
 *                     { results: [{ slug?, title?, keyword? }] }. Activated by
 *                     setting IMAGE_SEARCH_API_URL. This is the extension point
 *                     for Google Lens, a custom vision model, or a reseller.
 *   2. colourMatch  - the built-in, zero-dependency default. Extracts the
 *                     dominant colour of the uploaded photo and returns
 *                     products whose own dominant colour is close to it. It is
 *                     genuinely useful for fashion and accessories, and it runs
 *                     entirely offline.
 *
 * Adding a provider means adding one object to PROVIDERS below; nothing else in
 * the codebase needs to change.
 */
import { config } from '../config.js';
import { searchByImageOffline, parseColor, searchProducts } from './catalogue.js';
import { hexToRgb } from './images.js';

/* -------------------------------------------------------------------------- */
/* Providers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} ImageSearchProvider
 * @property {string} id
 * @property {string} label
 * @property {(input: {imagePath:string, buffer?:Buffer, colorHex:string, text:string}) => Promise<{items:object[], total:number, mode:string, note?:string}>} search
 */

/** Offline default: match on dominant colour (and text, if provided). */
const colourMatch = {
  id: 'colour',
  label: 'Built-in colour match',
  async search({ colorHex, text }) {
    const result = searchByImageOffline({ colorHex, text });
    return {
      ...result,
      mode: text ? 'text' : 'colour',
      note: text
        ? 'Results came from your description. Add a photo for visual matching.'
        : 'Results are matched by the dominant colour of your photo. Add a description to refine them.',
    };
  },
};

/**
 * External provider. Enabled only when IMAGE_SEARCH_API_URL is configured, so
 * the app has no external dependency by default.
 */
const externalApi = {
  id: 'external',
  label: 'External visual search API',
  async search({ imagePath, colorHex, text }) {
    const endpoint = config.imageSearch.apiUrl;
    if (!endpoint) throw new Error('IMAGE_SEARCH_API_URL is not configured');

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.imageSearch.apiKey) headers.Authorization = `Bearer ${config.imageSearch.apiKey}`;

    // Many providers expect a public URL; send both forms so either works.
    const payload = {
      image_url: `${config.siteUrl}/uploads/${imagePath}`,
      image_path: imagePath,
      text: text || undefined,
      color: colorHex,
      limit: 24,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Image search provider returned ${response.status}`);
    }

    const data = await response.json();
    return normaliseExternalResult(data, text);
  },
};

/**
 * Accept a few plausible provider shapes and turn them into product rows.
 * Expected: { results: [{ slug }] } or { results: [{ title }] } or
 * { items: [{ id }] }.
 */
function normaliseExternalResult(data, text) {
  const raw = data?.results || data?.items || data?.products || data?.matches || [];
  if (!Array.isArray(raw)) return { items: [], total: 0, mode: 'external' };

  // Map provider hits onto our catalogue by slug, then product code, then title.
  const items = [];
  for (const hit of raw.slice(0, 24)) {
    if (hit?.slug) {
      const found = searchProducts({ q: hit.slug, perPage: 1, sort: 'relevance' }).items[0];
      if (found) {
        items.push(found);
        continue;
      }
    }
    if (hit?.id) {
      const found = searchProducts({ perPage: 1 }).items.find((p) => p.id === Number(hit.id));
      if (found) {
        items.push(found);
        continue;
      }
    }
    if (hit?.title || hit?.keyword) {
      const found = searchProducts({ q: hit.title || hit.keyword, perPage: 1, sort: 'relevance' }).items[0];
      if (found) items.push(found);
    }
  }

  return { items, total: items.length, mode: 'external' };
}

const PROVIDERS = { colour: colourMatch, external: externalApi };

/** Pick the active provider: external if configured, otherwise the offline one. */
export function activeProvider() {
  return config.imageSearch.apiUrl ? PROVIDERS.external : PROVIDERS.colour;
}

export function imageSearchProviderInfo() {
  const provider = activeProvider();
  const base = {
    id: provider.id,
    label: provider.label,
    note: provider.id === 'external'
      ? 'Connected to an external image search service.'
      : 'Matching runs locally on colour, with no AI service required. To enable a visual AI search, set IMAGE_SEARCH_API_URL in your .env file.',
  };
  return base;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run an image search.
 *
 * Always falls back to the offline provider if the external one fails, so the
 * feature degrades gracefully rather than showing an error.
 *
 * @param {{ imagePath: string, colorHex?: string, text?: string }} input
 */
export async function searchByImage({ imagePath, colorHex, text = '' }) {
  const provider = activeProvider();
  const color = colorHex || '#8a94a6';

  if (provider.id === 'external') {
    try {
      return await provider.search({ imagePath, colorHex: color, text });
    } catch (err) {
      // Fall back rather than fail the request.
      const fallback = await colourMatch.search({ colorHex: color, text });
      return {
        ...fallback,
        mode: 'colour',
        note: `The external image search is unavailable (${err.message}). Showing colour-matched results instead.`,
      };
    }
  }

  return provider.search({ imagePath, colorHex: color, text });
}

/**
 * Cheap similarity used for "customers may also like" fallbacks and for the
 * offline provider's ranking hint.
 */
export function colourDistance(a, b) {
  const ca = parseColor(a) || hexToRgb(a);
  const cb = parseColor(b) || hexToRgb(b);
  if (!ca || !cb) return Infinity;
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

export { colourMatch, externalApi };
