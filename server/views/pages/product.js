/** Product detail page (Requirements 13-14). */
import { html, raw, esc, taka, daysRange, compactCount, formatDate } from '../../lib/utils.js';
import { icon, ratingStars, breadcrumbs, sectionHead, stockBadge, discountBadge, dealBadge } from  '../components/ui.js';
import { productGrid, productImage } from '../components/product-card.js';
import { productSchema, breadcrumbSchema, itemListSchema } from '../layout.js';
import { whatsappLink } from '../components/header.js';

export function productPage({ ctx, data }) {
  const { product, settings, related } = data;
  const pre = product.is_preorder;
  const soldOut = !product.in_stock;

  return html`
    <div class="container product">
      ${breadcrumbs(data.trail)}

      <div class="product__top">
        <!-- ================= GALLERY ================= -->
        <div class="gallery" data-gallery>
          <div class="gallery__main">
            ${product.images.length > 1
              ? html`
                  <button class="gallery__zoom" type="button" data-gallery-zoom aria-label="View larger image">
                    ${icon('zoom', { size: 18 })}
                  </button>
                  <button class="gallery__nav gallery__nav--prev" data-gallery-prev type="button" aria-label="Previous image">
                    ${icon('chevronLeft', { size: 20 })}
                  </button>
                  <button class="gallery__nav gallery__nav--next" data-gallery-next type="button" aria-label="Next image">
                    ${icon('chevronRight', { size: 20 })}
                  </button>
                `
              : ''}
            <div class="gallery__stage" data-gallery-stage>
              ${product.images.map((img, i) =>
                i === 0
                  ? productImage(product, { sizes: '(max-width: 900px) 92vw, 520px', priority: true, class: 'gallery__img is-main' })
                  : html`<img class="gallery__img" src="/uploads/${img.path}" alt="${img.alt || product.title}"
                      width="${img.width || 400}" height="${img.height || 400}" loading="lazy" decoding="async"
                      data-gallery-img hidden />`
              )}
              ${!product.images.length ? productImage(product, { priority: true, class: 'gallery__img' }) : ''}
            </div>
          </div>

          ${product.images.length > 1
            ? html`<div class="gallery__thumbs" role="tablist" aria-label="Product images">
                ${product.images.map(
                  (img, i) => html`
                    <button
                      class="gallery__thumb ${i === 0 ? 'is-active' : ''}"
                      type="button"
                      data-gallery-thumb="${i}"
                      role="tab"
                      aria-selected="${i === 0 ? 'true' : 'false'}"
                      aria-label="View image ${i + 1}"
                    >
                      <img src="/uploads/${img.path}" alt="" width="72" height="72" loading="lazy" decoding="async" />
                    </button>
                  `
                )}
              </div>`
            : ''}
        </div>

        <!-- ================= BUY BOX ================= -->
        <div class="buybox">
          <div class="buybox__badges">
            ${stockBadge(product, { size: 'badge--lg' })}
            ${product.is_new ? raw('<span class="badge badge--new">New</span>') : ''}
            ${discountBadge(product.discount)}
            ${product.deal_active ? dealBadge(product.deal_ends_at) : ''}
          </div>

          <h1 class="buybox__title">${product.title}</h1>
          ${product.subtitle ? raw(`<p class="buybox__sub">${esc(product.subtitle)}</p>`) : ''}

          <div class="buybox__meta">
            ${product.rating_count > 0
              ? ratingStars(product.rating_avg, { count: product.rating_count })
              : ''}
            ${product.sold_count > 0
              ? raw(`<span class="buybox__sold">${esc(compactCount(product.sold_count))} sold</span>`)
              : ''}
            <span class="buybox__sku">Code: ${product.sku}</span>
          </div>

          <!-- Delivery promise, the core differentiator -->
          <div class="shipbox shipbox--${pre ? 'pre' : 'ready'}">
            <span class="shipbox__icon">${icon(pre ? 'truck' : 'box', { size: 20 })}</span>
            <div class="shipbox__text">
              <p class="shipbox__label">${pre ? 'PRE-ORDER — sourced from China' : 'READY STOCK — available in Bangladesh'}</p>
              <p class="shipbox__eta">
                ${pre
                  ? html`Estimated delivery: <strong>${daysRange(product.delivery_min_days, product.delivery_max_days)}</strong>`
                  : html`Delivered in <strong>${daysRange(product.delivery_min_days, product.delivery_max_days)}</strong>`}
              </p>
            </div>
          </div>
          ${pre ? raw(`<p class="buybox__notice">${esc(settings['delivery.preorder_note'])}</p>`) : ''}

          <div class="buybox__price">
            <span class="buybox__now">${taka(product.price)}</span>
            ${product.compare_price
              ? raw(`<span class="buybox__was">${taka(product.compare_price)}</span>
                     <span class="buybox__save">Save ${taka(product.compare_price - product.price)}</span>`)
              : ''}
          </div>

          <p class="buybox__stock">
            ${soldOut
              ? html`<span class="stockline stockline--out">${icon('alert', { size: 15 })} Currently sold out${pre ? ' — pre-order opens once China stock is confirmed' : ''}</span>`
              : !pre && product.stock_qty <= product.low_stock_at
                ? html`<span class="stockline stockline--low">${icon('alert', { size: 15 })} Only ${product.stock_qty} left in stock</span>`
                : pre
                  ? html`<span class="stockline stockline--pre">${icon('truck', { size: 15 })} Made to order after you confirm</span>`
                  : html`<span class="stockline stockline--in">${icon('checkCircle', { size: 15 })} In stock — ships within 24 hours</span>`}
          </p>

          ${product.variants.length
            ? variantPicker(product)
            : ''}

          ${soldOut
            ? html`
                <button class="btn btn--block btn--disabled" type="button" disabled>Sold Out</button>
                <a class="btn btn--wa btn--block" href="${whatsappLink(
                  settings['contact.whatsapp'],
                  `Hello AWAJ, I am interested in ${product.title} (${product.sku}). Is this product available?`
                )}" target="_blank" rel="noopener noreferrer">
                  ${icon('whatsapp', { size: 17 })} Ask on WhatsApp
                </a>
              `
            : html`
                <form class="buybox__qty" data-buy-form>
                  <label class="qty" for="qty">
                    <span class="qty__label">Quantity</span>
                    <span class="qty__control">
                      <button type="button" data-qty-minus aria-label="Decrease quantity">${icon('minus', { size: 15 })}</button>
                      <input type="number" id="qty" name="qty" value="1" min="1"
                        max="${!pre ? Math.min(20, Math.max(1, product.stock_qty)) : 20}" inputmode="numeric" />
                      <button type="button" data-qty-plus aria-label="Increase quantity">${icon('plus', { size: 15 })}</button>
                    </span>
                  </label>
                  <p class="buybox__total">Total: <strong data-line-total>${taka(product.price)}</strong></p>
                </form>

                <div class="buybox__actions">
                  <button class="btn btn--ghost btn--lg" type="button" data-add-detail
                    data-id="${product.id}" data-slug="${product.slug}" data-title="${product.title}">
                    ${icon('cart', { size: 18 })} Add to Cart
                  </button>
                  <button class="btn btn--${pre ? 'preorder' : 'primary'} btn--lg" type="button" data-buy-detail
                    data-id="${product.id}" data-slug="${product.slug}" data-title="${product.title}">
                    ${pre ? 'Pre-Order Now' : 'Buy Now'}
                  </button>
                </div>

                <a class="btn btn--wa btn--block btn--lg" href="${whatsappLink(
                  settings['contact.whatsapp'],
                  `Hello AWAJ, I am interested in ${product.title}. Is this product available?`
                )}" target="_blank" rel="noopener noreferrer">
                  ${icon('whatsapp', { size: 18 })} Ask on WhatsApp
                </a>
              `}

          <ul class="assurances">
            ${icon('shield', { size: 16 })}<li>Quality checked before dispatch</li>
            ${icon('truck', { size: 16 })}<li>${pre ? 'China sourcing with tracking' : 'Fast local delivery'}</li>
            ${icon('refresh', { size: 16 })}<li>7-day exchange on defects</li>
            ${icon('whatsapp', { size: 16 })}<li>Order updates on WhatsApp</li>
          </ul>
        </div>
      </div>

      <!-- ================= TABS ================= -->
      <section class="ptabs" aria-labelledby="ptabs-h">
        <h2 class="sr-only" id="ptabs-h">Product information</h2>
        <div class="ptabs__list" role="tablist" data-tabs>
          ${['Description', 'Specifications', 'Variants', 'Delivery', 'Returns', `Reviews (${product.rating_count})`].map(
            (label, i) => html`
              <button
                class="ptabs__tab ${i === 0 ? 'is-active' : ''}"
                role="tab"
                type="button"
                data-tab="tab-${i}"
                aria-selected="${i === 0 ? 'true' : 'false'}"
                id="tabbtn-${i}"
                aria-controls="tab-${i}"
              >${label}</button>
            `
          )}
        </div>

        <div class="ptabs__panel is-active" role="tabpanel" id="tab-0" aria-labelledby="tabbtn-0" data-panel="0">
          <div class="prose">${raw(product.description || '<p>No description provided for this product yet.</p>')}</div>
          ${product.highlights.length
            ? html`<h3 class="ptabs__h3">Highlights</h3>
                <ul class="ticks">${product.highlights.map((h) => html`<li>${h}</li>`)}</ul>`
            : ''}
        </div>

        <div class="ptabs__panel" role="tabpanel" id="tab-1" aria-labelledby="tabbtn-1" data-panel="1" hidden>
          ${Object.keys(product.specs).length
            ? html`<table class="spectable">
                <tbody>
                  ${Object.entries(product.specs).map(
                    ([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`
                  )}
                </tbody>
              </table>`
            : html`<p class="muted">Specifications for this product have not been added yet.</p>`}
        </div>

        <div class="ptabs__panel" role="tabpanel" id="tab-2" aria-labelledby="tabbtn-2" data-panel="2" hidden>
          ${product.variants.length
            ? html`<table class="spectable">
                <thead><tr><th scope="col">Option</th><th scope="col">Value</th><th scope="col">Extra price</th><th scope="col">Stock</th></tr></thead>
                <tbody>
                  ${product.variants.map(
                    (v) => html`<tr>
                      <td>${v.name}</td>
                      <td>${v.value}</td>
                      <td>${v.price_delta ? `+${taka(v.price_delta)}` : '—'}</td>
                      <td>${v.stock_qty > 0 ? v.stock_qty : (pre ? 'On order' : 'Sold out')}</td>
                    </tr>`
                  )}
                </tbody>
              </table>`
            : html`<p class="muted">This product is sold as a single configuration with no options.</p>`}
        </div>

        <div class="ptabs__panel" role="tabpanel" id="tab-3" aria-labelledby="tabbtn-3" data-panel="3" hidden>
          <div class="prose">
            <p><strong>Ready Stock:</strong> dispatched from Bangladesh within 24-48 hours, usually delivered in ${daysRange(
              Number(settings['delivery.ready_stock_days_min']),
              Number(settings['delivery.ready_stock_days_max'])
            )}.</p>
            <p><strong>Pre-Order:</strong> sourced from China after your order is confirmed. Estimated ${daysRange(
              Number(settings['delivery.preorder_days_min']),
              Number(settings['delivery.preorder_days_max'])
            )}, depending on shipping and customs.</p>
            <p><strong>Delivery charges:</strong> ${taka(settings['delivery.inside_dhaka'])} inside Dhaka,
              ${taka(settings['delivery.outside_dhaka'])} outside Dhaka.
              ${Number(settings['delivery.free_threshold']) > 0
                ? `Free delivery on orders over ${taka(settings['delivery.free_threshold'])}.`
                : ''}</p>
            <p>Cash on Delivery is available nationwide. For bKash, Nagad or bank transfer we will share the
              account details after you place the order.</p>
          </div>
        </div>

        <div class="ptabs__panel" role="tabpanel" id="tab-4" aria-labelledby="tabbtn-4" data-panel="4" hidden>
          <div class="prose">${raw(returnPolicyText(settings))}</div>
        </div>

        <div class="ptabs__panel" role="tabpanel" id="tab-5" aria-labelledby="tabbtn-5" data-panel="5" hidden>
          <div class="reviews">
            <div class="reviews__summary">
              <p class="reviews__score">${Number(product.rating_avg).toFixed(1)}</p>
              ${ratingStars(product.rating_avg, { size: 16 })}
              <p class="reviews__count">Based on ${product.rating_count} review${product.rating_count === 1 ? '' : 's'}</p>
            </div>
            <ul class="reviews__list">
              ${product.reviews.length
                ? product.reviews.map(
                    (r) => html`
                      <li class="review">
                        <div class="review__head">
                          <span class="review__author">${r.author}</span>
                          ${ratingStars(r.rating, { size: 13 })}
                        </div>
                        ${r.body ? raw(`<p class="review__body">${esc(r.body)}</p>`) : ''}
                        <p class="review__date">${formatDate(r.created_at)}</p>
                      </li>
                    `
                  )
                : html`<li class="muted">No reviews yet. Be the first to tell others about this product.</li>`}
            </ul>
          </div>
        </div>
      </section>

      <!-- ================= RELATED ================= -->
      ${related.length
        ? html`<section class="section container" aria-labelledby="rel-h">
            ${sectionHead({
              eyebrow: 'You may also like',
              title: html`<span id="rel-h">Related Products</span>`,
              href: `/category/${product.category?.slug || ''}`,
            })}
            ${productGrid(related, { priorityCount: 0 })}
          </section>`
        : ''}
    </div>

    <!-- Sticky mobile action bar (Requirement 28) -->
    ${soldOut
      ? ''
      : html`
          <div class="stickybar" data-stickybar>
            <div class="stickybar__price">
              <span>${taka(product.price)}</span>
              <small>${pre ? 'Pre-Order · 7-10 days' : 'Ready Stock · 1-3 days'}</small>
            </div>
            <div class="stickybar__actions">
              <button class="btn btn--ghost" type="button" data-add-detail
                data-id="${product.id}" data-slug="${product.slug}" data-title="${product.title}">
                ${icon('cart', { size: 17 })} Add
              </button>
              <button class="btn btn--${pre ? 'preorder' : 'primary'}" type="button" data-buy-detail
                data-id="${product.id}" data-slug="${product.slug}" data-title="${product.title}">
                ${pre ? 'Pre-Order Now' : 'Buy Now'}
              </button>
            </div>
          </div>
        `}

    <!-- Lightbox -->
    ${product.images.length
      ? html`<div class="lightbox" data-lightbox hidden>
          <button class="lightbox__close" type="button" data-lightbox-close aria-label="Close">${icon('close', { size: 22 })}</button>
          <button class="lightbox__nav lightbox__nav--prev" data-lightbox-prev type="button" aria-label="Previous">${icon('chevronLeft', { size: 26 })}</button>
          <img data-lightbox-img src="/uploads/${product.images[0].path}" alt="${product.title}" />
          <button class="lightbox__nav lightbox__nav--next" data-lightbox-next type="button" aria-label="Next">${icon('chevronRight', { size: 26 })}</button>
        </div>`
      : ''}
  `;
}

function variantPicker(product) {
  // Group variants by option name so "Colour: Black/White" reads clearly.
  const groups = new Map();
  for (const v of product.variants) {
    if (!groups.has(v.name)) groups.set(v.name, []);
    groups.get(v.name).push(v);
  }

  return html`
    <div class="variants" data-variants>
      ${[...groups.entries()].map(
        ([name, options]) => html`
          <div class="variants__group">
            <p class="variants__label">${name}: <span data-variant-label="${name}">Select an option</span></p>
            <div class="variants__opts">
              ${options.map(
                (o) => html`
                  <button
                    type="button"
                    class="variant ${o.stock_qty <= 0 && !product.is_preorder ? 'is-out' : ''}"
                    data-variant="${o.id}"
                    data-name="${name}"
                    data-value="${o.value}"
                    data-delta="${o.price_delta}"
                    data-stock="${o.stock_qty}"
                    ${o.stock_qty <= 0 && !product.is_preorder ? raw('disabled aria-disabled="true"') : ''}
                  >
                    ${o.value}${o.price_delta ? ` (+${taka(o.price_delta)})` : ''}
                  </button>
                `
              )}
            </div>
          </div>
        `
      )}
      <input type="hidden" name="variantId" data-variant-input value="" />
    </div>
  `;
}

function returnPolicyText(settings) {
  const text = settings['content.return_policy'] || '';
  return `<p>${esc(text).replace(/\n\n/g, '</p><p>')}</p>`;
}

export { productSchema, breadcrumbSchema, itemListSchema };
