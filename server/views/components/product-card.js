/**
 * Product card - the single most repeated component on the site.
 *
 * Mobile priority order is deliberate (Requirement 12):
 *   image -> name -> price -> stock type -> buy button
 * Everything else is progressively revealed or de-emphasised.
 */
import { html, raw, esc, taka, cx, compactCount, daysRange } from '../../lib/utils.js';
import { icon, stockBadge, newBadge, discountBadge, ratingStars, dealBadge } from  './ui.js';

/**
 * Build a responsive <img> that never downloads the original full-size file.
 *
 * If the derivatives exist (`-800.webp` etc.) we emit a real srcset so phones
 * fetch ~400px files. Otherwise we fall back to the original path, which is
 * still lazy-loaded and async-decoded.
 */
export function productImage(product, { sizes = '(max-width: 640px) 45vw, 220px', priority = false, class: klass = '' } = {}) {
  const src = product.image;
  if (!src) {
    return html`<div class="pcard__media pcard__media--empty ${klass}" aria-hidden="true">
      ${icon('image', { size: 28 })}
    </div>`;
  }

  const isAbsolute = /^https?:\/\//.test(src);
  const base = src.replace(/\.(svg|webp|jpg|jpeg|png|avif)$/i, '');
  const ext = (src.match(/\.(svg|webp|jpg|jpeg|png|avif)$/i) || [, 'webp'])[1];

  // SVG placeholders have no derivative variants.
  const hasVariants = !isAbsolute && ext !== 'svg';
  const srcset = hasVariants
    ? [400, 800, 1200]
        .map((w) => `/uploads/${base}-${w}.webp ${w}w`)
        .join(', ')
    : '';

  return html`<div class="pcard__media ${klass}">
    <img
      src="${isAbsolute ? src : `/uploads/${src}`}"
      ${raw(srcset ? `srcset="${esc(srcset)}" sizes="${esc(sizes)}"` : '')}
      alt="${product.title}"
      width="400"
      height="400"
      loading="${priority ? 'eager' : 'lazy'}"
      ${raw(priority ? 'fetchpriority="high"' : 'decoding="async"')}
    />
  </div>`;
}

/**
 * @param {object} product  shaped product
 * @param {object} [opts]
 * @param {'grid'|'rail'} [opts.variant]
 * @param {boolean} [opts.priority]  eager-load the first few images
 */
export function productCard(product, { variant = 'grid', priority = false } = {}) {
  const href = `/product/${encodeURIComponent(product.slug)}`;
  const pre = product.is_preorder;
  const soldOut = !product.in_stock;
  const isNew = product.is_new && !soldOut;

  return html`
    <article
      class="${cx('pcard', `pcard--${pre ? 'preorder' : 'ready'}`, soldOut && 'is-soldout', variant === 'rail' && 'pcard--rail')}"
      data-product-id="${product.id}"
      data-product-slug="${product.slug}"
    >
      <div class="pcard__top">
        <a class="pcard__link" href="${href}" aria-label="${product.title}">
          ${productImage(product, { priority })}
        </a>
        <div class="pcard__badges">
          ${discountBadge(product.discount)}
          ${isNew ? newBadge() : ''}
        </div>
        <button
          type="button"
          class="pcard__wish"
          data-wish="${product.id}"
          aria-pressed="false"
          aria-label="Add ${product.title} to wishlist"
          title="Add to wishlist"
        >
          ${icon('heart', { size: 17 })}
        </button>
        ${product.deal_active ? raw(`<div class="pcard__deal">${dealBadge(product.deal_ends_at)}</div>`) : ''}
      </div>

      <div class="pcard__body">
        <p class="pcard__type">${stockBadge(product)}</p>

        <h3 class="pcard__title">
          <a href="${href}">${product.title}</a>
        </h3>

        <div class="pcard__meta">
          ${product.rating_count > 0 ? ratingStars(product.rating_avg, { count: product.rating_count }) : ''}
          ${product.sold_count > 0 ? raw(`<span class="pcard__sold">${esc(compactCount(product.sold_count))} sold</span>`) : ''}
        </div>

        <div class="pcard__price">
          <span class="pcard__now">${taka(product.price)}</span>
          ${product.compare_price
            ? raw(`<span class="pcard__was">${taka(product.compare_price)}</span>`)
            : ''}
        </div>

        <p class="pcard__ship">
          ${pre
            ? html`<span class="pcard__eta">${icon('truck', { size: 14 })} Est. ${daysRange(product.delivery_min_days, product.delivery_max_days)}</span>`
            : html`<span class="pcard__eta">${icon('box', { size: 14 })} Ships in ${daysRange(product.delivery_min_days, product.delivery_max_days)}</span>`}
        </p>
      </div>

      <div class="pcard__actions">
        ${soldOut
          ? html`<button class="btn btn--block btn--disabled" type="button" disabled>Sold Out</button>`
          : html`
              <button
                class="btn btn--ghost btn--block"
                type="button"
                data-add="${product.id}"
                data-title="${product.title}"
              >
                ${icon('cart', { size: 16 })} <span>Add</span>
              </button>
              <button
                class="btn btn--block ${pre ? 'btn--preorder' : 'btn--primary'}"
                type="button"
                data-buy="${product.id}"
                data-title="${product.title}"
              >
                ${pre ? 'Pre-Order Now' : 'Buy Now'}
              </button>
            `}
      </div>
    </article>
  `;
}

/**
 * Wrap cards in the right container for the current context.
 *
 * @param {object[]} products
 * @param {object} [opts]
 * @param {number} [opts.priorityCount] how many leading cards to load eagerly.
 *   Pass 0 for sections that sit below the fold, so the browser does not fetch
 *   images the customer cannot see yet.
 */
export function productGrid(products, { priorityCount = 4 } = {}) {
  return html`<div class="pgrid pgrid--4">
    ${products.map((p, i) => productCard(p, { priority: i < priorityCount }))}
  </div>`;
}

export function productRail(products, { label = 'Products' } = {}) {
  return html`<div class="rail" data-rail>
    <button class="rail__nav rail__nav--prev" data-rail-prev type="button" aria-label="Scroll ${label} left">
      ${icon('chevronLeft', { size: 20 })}
    </button>
    <div class="rail__track">
      <div class="pgrid pgrid--rail">
        ${products.map((p) => productCard(p, { variant: 'rail' }))}
      </div>
    </div>
    <button class="rail__nav rail__nav--next" data-rail-next type="button" aria-label="Scroll ${label} right">
      ${icon('chevronRight', { size: 20 })}
    </button>
  </div>`;
}
