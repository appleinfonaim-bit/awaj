/**
 * Shared UI primitives.
 *
 * Everything here returns a plain string of HTML. The `html` tagged template
 * from lib/utils.js escapes by default, so any interpolation is safe unless it
 * is explicitly wrapped in raw().
 */
import { html, raw, esc, taka, cx } from '../../lib/utils.js';

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Inline SVG icon set.
 *
 * Icons are inlined rather than sprited or fetched, so they cost no extra
 * request and inherit `currentColor`. Shared presentation attributes live in
 * CSS (see `.icon` in app.css) because every one of them is also a CSS
 * property, which keeps each icon down to a single `path`.
 */
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.6 12 20 12 20Z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  box: '<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  whatsapp:
    '<path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Z"/><path d="M8.5 8.2c.3-.6.6-.6.9-.6h.7c.2 0 .5 0 .7.6l.8 1.9c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.4 0 .6a7 7 0 0 0 3 2.6c.3.1.5 0 .6-.1l.5-.6c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.3.4.5a2 2 0 0 1-1.6 2c-.6.1-1.5 0-2.7-.6a9.4 9.4 0 0 1-3.7-3.3c-.9-1.3-1.2-2.5-1-3.3Z"/>',
  facebook:
    '<path d="M14 9V7.2c0-.8.2-1.2 1.4-1.2H17V3h-2.6C11.6 3 10.6 4.5 10.6 6.8V9H8.6v3h2v9h3.4v-9h2.4l.4-3Z"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r="1"/>',
  tiktok:
    '<path d="M15 3v10.5a3 3 0 1 1-3-3c.3 0 .6 0 .8.1"/><path d="M15 3c.4 2.4 2 4 4.5 4.2"/>',
  phone:
    '<path d="M6.5 3h3l1.5 4-2 1.4a12 12 0 0 0 6.6 6.6l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  shield: '<path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M11 8v6M8 11h6"/><path d="m16 16 4 4"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  package: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.5 20h19Z"/><path d="M12 10v4M12 17h.01"/>',
  home: '<path d="m4 11 8-7 8 7"/><path d="M6 10v10h12V10"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  chart: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 17 5-5 4 4 3-2 4 3"/>',
  taka: '<path d="M9 4v16M9 10h3.5a3 3 0 0 1 0 6H9"/><path d="M15 8.5c1.4-1 3.5-.6 3.5 1 0 1.9-2 3.2-3.5 4.5-1.5-1.3-3.5-2.6-3.5-4.5 0-1.6 2.1-2 3.5-1Z"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9"/>',
};

/**
 * @param {keyof PATHS} name
 * @param {{ size?: number, class?: string }} [opts]
 */
export function icon(name, { size = 20, class: klass = '' } = {}) {
  const d = PATHS[name];
  if (!d) return raw('');
  return raw(
    `<svg class="icon ${klass}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`
  );
}

/** Filled variant, used for active wishlist hearts. */
export function iconFilled(name, { size = 20, class: klass = '' } = {}) {
  const d = PATHS[name];
  if (!d) return raw('');
  return raw(
    `<svg class="icon icon--fill ${klass}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Stock-type badge. The two visual treatments (green ready stock, violet
 * pre-order) are the core of the AWAJ brand and must stay consistent
 * everywhere a product appears.
 */
export function stockBadge(product, { size = '' } = {}) {
  const pre = product.is_preorder;
  return html`<span class="badge ${pre ? 'badge--preorder' : 'badge--ready'} ${size}"
    >${pre ? 'Pre-Order' : 'Ready Stock'}</span
  >`;
}

export const newBadge = () => html`<span class="badge badge--new">New</span>`;

export const discountBadge = (percent) =>
  percent > 0 ? html`<span class="badge badge--discount">-${percent}%</span>` : '';

/** Deal countdown chip, driven by deal_ends_at rather than a fake timer. */
export function dealBadge(endsAt) {
  if (!endsAt) return '';
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (remaining <= 0) return '';
  const days = Math.floor(remaining / 864e5);
  const hours = Math.floor((remaining % 864e5) / 36e5);
  const label = days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  return html`<span class="badge badge--deal" data-countdown="${esc(endsAt)}"
    >${icon('truck', { size: 13 })} ${label}</span
  >`;
}

/* -------------------------------------------------------------------------- */
/* Ratings                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Star rating.
 *
 * Rendered with CSS rather than five inline SVGs: a single element with a
 * `--fill` custom property plus one text run of stars. That matters because
 * ratings appear on every product card, and five SVGs per card added ~1.4 KB
 * to every page.
 */
export function ratingStars(value, { count = null, size = 13 } = {}) {
  const rating = Number(value) || 0;
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const label =
    count != null
      ? `Rated ${rating.toFixed(1)} out of 5 from ${count} reviews`
      : `Rated ${rating.toFixed(1)} out of 5`;

  return raw(
    `<span class="rating" role="img" aria-label="${esc(label)}">` +
      `<span class="rating__stars" style="--fill:${pct.toFixed(1)}%;--star:${size}px">★★★★★</span>` +
      (count != null ? `<span class="rating__count">(${esc(count)})</span>` : '') +
      `</span>`
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

export function sectionHead({ eyebrow = '', title, subtitle = '', href = '', linkText = 'View All' }) {
  if (!title) return '';
  return html`
    <div class="section__head">
      <div>
        ${eyebrow ? raw(`<p class="section__eyebrow">${esc(eyebrow)}</p>`) : ''}
        <h2 class="section__title">${title}</h2>
        ${subtitle ? raw(`<p class="section__subtitle">${esc(subtitle)}</p>`) : ''}
      </div>
      ${href
        ? raw(
            `<a class="section__link" href="${esc(href)}">${esc(linkText)} ${icon('arrowRight', { size: 16 })}</a>`
          )
        : ''}
    </div>
  `;
}

export function breadcrumbs(trail) {
  const items = trail
    .map((item, i) => {
      const last = i === trail.length - 1;
      if (last || !item.href) {
        return `<li><span aria-current="page">${esc(item.name)}</span></li>`;
      }
      return `<li><a href="${esc(item.href)}">${esc(item.name)}</a></li>`;
    })
    .join('');
  return raw(`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`);
}

export function emptyState({ title, message = '', action = null, icon: iconName = 'package' }) {
  return html`
    <div class="empty">
      <div class="empty__icon">${icon(iconName, { size: 30 })}</div>
      <h3 class="empty__title">${title}</h3>
      ${message ? raw(`<p class="empty__msg">${esc(message)}</p>`) : ''}
      ${action ? raw(action) : ''}
    </div>
  `;
}

export const alert = (message, kind = 'info') =>
  html`<div class="alert alert--${kind}" role="${kind === 'error' ? 'alert' : 'status'}">
    ${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'checkCircle' : 'info', { size: 18 })}
    <div>${message}</div>
  </div>`;

/** Horizontal scroll rail with previous/next buttons (mobile-first). */
export function rail(inner, { id = 'rail', label = 'Products' } = {}) {
  return html`
    <div class="rail" data-rail data-rail-label="${label}">
      <button class="rail__nav rail__nav--prev" data-rail-prev aria-label="Scroll ${label} left" type="button">
        ${icon('chevronLeft', { size: 20 })}
      </button>
      <div class="rail__track" id="${id}" tabindex="0" role="region" aria-label="${label}">
        ${inner}
      </div>
      <button class="rail__nav rail__nav--next" data-rail-next aria-label="Scroll ${label} right" type="button">
        ${icon('chevronRight', { size: 20 })}
      </button>
    </div>
  `;
}

export { cx };
