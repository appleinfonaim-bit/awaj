/** Homepage (Requirements 5-11). */
import { html, raw, esc, taka } from  '../../lib/utils.js';
import { icon, sectionHead } from  '../components/ui.js';
import { productGrid, productRail, productImage } from '../components/product-card.js';
import { organisationSchema, websiteSchema } from '../layout.js';

/**
 * @param {object} data
 * @param {object} data.ctx
 */
export function homePage({ ctx, data }) {
  const { settings } = ctx;
  const s = settings;
  // Categories come from the shared request context, not the page payload.
  const categories = ctx.categories || [];

  return html`
    <!-- ===================== HERO CAROUSEL ===================== -->
    <section class="hero" aria-label="Featured promotions">
      <div class="hero__track" data-hero-track>
        ${data.banners.map((b, i) => heroSlide(b, i === 0))}
      </div>
      <button class="hero__nav hero__nav--prev" data-hero-prev type="button" aria-label="Previous banner">
        ${icon('chevronLeft', { size: 22 })}
      </button>
      <button class="hero__nav hero__nav--next" data-hero-next type="button" aria-label="Next banner">
        ${icon('chevronRight', { size: 22 })}
      </button>
      <div class="hero__dots" data-hero-dots role="tablist" aria-label="Choose banner">
        ${data.banners.map(
          (b, i) => html`<button
            type="button"
            role="tab"
            class="hero__dot ${i === 0 ? 'is-active' : ''}"
            data-hero-dot="${i}"
            aria-label="${b.eyebrow}"
            aria-selected="${i === 0 ? 'true' : 'false'}"
          ></button>`
        )}
      </div>
    </section>

    <!-- ===================== TRUST STRIP ===================== -->
    <section class="trust" aria-label="Why shop with AWAJ">
      <div class="container trust__grid">
        ${trustItem('box', 'Ready Stock in Bangladesh', 'Order now, delivered in 1-3 days')}
        ${trustItem('truck', 'Pre-Order from China', 'Estimated 7-10 days delivery')}
        ${trustItem('shield', 'Cash on Delivery', 'Pay when your parcel arrives')}
        ${trustItem('whatsapp', 'WhatsApp Support', 'We reply within minutes')}
      </div>
    </section>

    <!-- ===================== QUICK CATEGORIES ===================== -->
    ${categories.length
      ? html`<section class="section container" aria-labelledby="cats-h">
          ${sectionHead({
            eyebrow: 'Browse',
            title: html`<span id="cats-h">Shop by Category</span>`,
            subtitle: 'Everything trending from China, organised so you can find it fast',
            href: '/products',
            linkText: 'All Products',
          })}
          <div class="catgrid">
            ${categories.slice(0, 10).map((c) => categoryCard(c))}
          </div>
        </section>`
      : ''}

    <!-- ===================== READY STOCK ===================== -->
    ${data.readyStock.length
      ? html`<section class="section section--ready" aria-labelledby="ready-h">
          <div class="container">
            ${sectionHead({
              eyebrow: html`<span class="eyebrow eyebrow--ready">Ready Stock</span>`,
              title: html`<span id="ready-h">Available in Bangladesh — Order Now</span>`,
              subtitle: 'Dispatched from our local warehouse. Fastest delivery, no waiting for imports.',
              href: '/ready-stock',
              linkText: 'All Ready Stock',
            })}
            ${productRail(data.readyStock, { label: 'ready stock products' })}
          </div>
        </section>`
      : ''}

    <!-- ===================== PRE-ORDER ===================== -->
    ${data.preorder.length
      ? html`<section class="section section--pre" aria-labelledby="pre-h">
          <div class="container">
            ${sectionHead({
              eyebrow: html`<span class="eyebrow eyebrow--pre">Pre-Order</span>`,
              title: html`<span id="pre-h">Pre-Order From China</span>`,
              subtitle: 'Order today — estimated delivery 7-10 days. We source these for you after you order.',
              href: '/pre-order',
              linkText: 'All Pre-Order',
            })}
            ${preorderNotice(settings)}
            ${productRail(data.preorder, { label: 'pre-order products' })}
          </div>
        </section>`
      : ''}

    <!-- ===================== HOT DEALS ===================== -->
    ${data.hotDeals.length
      ? html`<section class="section container" aria-labelledby="deals-h">
          ${sectionHead({
            eyebrow: html`<span class="eyebrow eyebrow--deal">Limited Time</span>`,
            title: html`<span id="deals-h">Hot Deals</span>`,
            subtitle: 'Real countdowns, driven by the deal end time set in Admin',
            href: '/deals',
            linkText: 'All Deals',
          })}
          <div class="dealgrid">
            ${data.hotDeals.map((p) => dealCard(p))}
          </div>
        </section>`
      : ''}

    <!-- ===================== TRENDING ===================== -->
    ${data.trending.length
      ? html`<section class="section container" aria-labelledby="trend-h">
          ${sectionHead({
            eyebrow: 'Popular',
            title: html`<span id="trend-h">Trending Now</span>`,
            subtitle: 'What Bangladeshi shoppers are ordering this week',
          })}
          ${productGrid(data.trending)}
        </section>`
      : ''}

    <!-- ===================== DISCOVERY SECTIONS ===================== -->
    ${data.discoverSections
      .filter((sec) => sec.products.length)
      .map(
        (sec) => html`<section class="section container" aria-labelledby="disc-${esc(sec.key)}">
          ${sectionHead({
            eyebrow: 'Discover',
            title: html`<span id="disc-${sec.key}">${sec.title}</span>`,
            href: sec.href,
            linkText: 'View All',
          })}
          ${productRail(sec.products, { label: sec.title })}
        </section>`
      )}

    <!-- ===================== NEW ARRIVALS ===================== -->
    ${data.newArrivals.length
      ? html`<section class="section container" aria-labelledby="new-h">
          ${sectionHead({
            eyebrow: 'Just In',
            title: html`<span id="new-h">New Arrivals</span>`,
            subtitle: 'Freshly added to the AWAJ catalogue',
          })}
          ${productGrid(data.newArrivals)}
        </section>`
      : ''}

    <!-- ===================== HOW IT WORKS ===================== -->
    <section class="section how" aria-labelledby="how-h">
      <div class="container">
        <h2 class="section__title section__title--center" id="how-h">How AWAJ Works</h2>
        <p class="section__subtitle section__subtitle--center">
          Two ways to shop. Both supported on WhatsApp, both Cash on Delivery friendly.
        </p>
        <div class="how__grid">
          ${howStep('1', 'box', 'Ready Stock', 'The product is already in Bangladesh. Add to cart and we deliver in 1-3 days.')}
          ${howStep('2', 'truck', 'Pre-Order', 'We order it from our supplier in China after you confirm. Estimated 7-10 days.')}
          ${howStep('3', 'checkCircle', 'Pay on Delivery', 'Cash on Delivery nationwide, or pay by bKash, Nagad or bank transfer.')}
        </div>
      </div>
    </section>

    <!-- ===================== SOCIAL / FACEBOOK ===================== -->
    ${data.facebookCta ? facebookCta(settings, data.facebookCta) : ''}
  `;
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function heroSlide(banner, active) {
  return html`
    <div class="hero__slide ${active ? 'is-active' : ''}" data-hero-slide role="group" aria-roledescription="slide" aria-label="${banner.eyebrow}">
      <div class="container hero__inner">
        <div class="hero__copy">
          <p class="hero__eyebrow">${banner.eyebrow}</p>
          <h1 class="hero__title">${banner.title}</h1>
          <p class="hero__text">${banner.text}</p>
          <div class="hero__actions">
            ${banner.cta.map(
              (c) => html`<a class="btn ${c.style === 'primary' ? 'btn--primary' : 'btn--light'}" href="${c.href}">
                ${c.label} ${icon('arrowRight', { size: 16 })}
              </a>`
            )}
          </div>
          ${banner.badge ? raw(`<p class="hero__badge">${esc(banner.badge)}</p>`) : ''}
        </div>
        <div class="hero__art" aria-hidden="true">
          <div class="hero__blob hero__blob--a"></div>
          <div class="hero__blob hero__blob--b"></div>
          <div class="hero__art-inner">${icon(banner.icon, { size: 120 })}</div>
        </div>
      </div>
    </div>
  `;
}

function trustItem(iconName, title, text) {
  return html`
    <div class="trust__item">
      <span class="trust__icon">${icon(iconName, { size: 20 })}</span>
      <div>
        <p class="trust__title">${title}</p>
        <p class="trust__text">${text}</p>
      </div>
    </div>
  `;
}

function categoryCard(c) {
  return html`
    <a class="catcard" href="/category/${c.slug}">
      <span class="catcard__art catcard__art--${c.slug}" aria-hidden="true">
        ${c.image
          ? raw(
              `<img src="/uploads/${esc(c.image)}" alt="" width="200" height="200" loading="lazy" decoding="async">`
            )
          : icon('tag', { size: 26 })}
      </span>
      <span class="catcard__name">${c.name}</span>
      ${c.tagline ? raw(`<span class="catcard__tag">${esc(c.tagline)}</span>`) : ''}
      ${c.product_count
        ? raw(`<span class="catcard__count">${esc(c.product_count)} products</span>`)
        : ''}
    </a>
  `;
}

function howStep(n, iconName, title, text) {
  return html`
    <div class="how__step">
      <span class="how__num">${n}</span>
      <span class="how__icon">${icon(iconName, { size: 26 })}</span>
      <h3 class="how__title">${title}</h3>
      <p class="how__text">${text}</p>
    </div>
  `;
}

function preorderNotice(settings) {
  return html`
    <div class="notice notice--pre">
      ${icon('info', { size: 18 })}
      <div>
        <strong>How Pre-Order works:</strong>
        ${settings['delivery.preorder_note']}
        Delivery is charged once for the whole order.
      </div>
    </div>
  `;
}

function dealCard(p) {
  return html`
    <article class="deal" data-product-id="${p.id}">
      <a class="deal__media" href="/product/${p.slug}">
        ${productImage(p, { sizes: '(max-width: 640px) 45vw, 250px' })}
        <span class="deal__off">-${p.discount}%</span>
        <span class="badge badge--${p.is_preorder ? 'preorder' : 'ready'}">${p.is_preorder ? 'Pre-Order' : 'Ready Stock'}</span>
      </a>
      <div class="deal__body">
        <h3 class="deal__title"><a href="/product/${p.slug}">${p.title}</a></h3>
        <div class="deal__price">
          <span class="deal__now">${taka(p.price)}</span>
          ${p.compare_price ? raw(`<span class="deal__was">${taka(p.compare_price)}</span>`) : ''}
        </div>
        <p class="deal__timer" data-countdown="${esc(p.deal_ends_at || '')}" data-deal-timer>
          ${icon('truck', { size: 14 })} <span>Ends in —</span>
        </p>
        ${p.deal_stock_limit ? raw(`<p class="deal__stock">Only ${esc(p.deal_stock_limit)} left</p>`) : ''}
        <div class="deal__actions">
          <button class="btn btn--ghost" type="button" data-add="${p.id}">Add</button>
          <a class="btn btn--block ${p.is_preorder ? 'btn--preorder' : 'btn--primary'}" href="/checkout?buy=${p.id}">
            ${p.is_preorder ? 'Pre-Order' : 'Buy Now'}
          </a>
        </div>
      </div>
    </article>
  `;
}

function facebookCta(settings, product) {
  const url = settings['contact.facebook_url'];
  if (!url) return '';
  return html`
    <section class="fbcta" aria-labelledby="fb-h">
      <div class="container fbcta__inner">
        <span class="fbcta__icon">${icon('facebook', { size: 30 })}</span>
        <div class="fbcta__copy">
          <h2 id="fb-h">${settings['social.facebook_follow_text']}</h2>
          <p>
            New arrivals and flash deals are posted on our Facebook page first.
            ${product ? html`Right now: <a href="/product/${product.slug}">${product.title}</a> at ${taka(product.price)}.` : ''}
          </p>
        </div>
        <div class="fbcta__actions">
          <a class="btn btn--fb" href="${url}" target="_blank" rel="noopener noreferrer">
            ${icon('facebook', { size: 17 })} Follow Page
          </a>
          <a class="btn btn--light" href="${url}" target="_blank" rel="noopener noreferrer">
            ${icon('whatsapp', { size: 17 })} ${settings['social.facebook_chat_text']}
          </a>
        </div>
      </div>
    </section>
  `;
}

export { organisationSchema, websiteSchema };
