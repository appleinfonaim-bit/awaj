/**
 * Site header: logo, search, wishlist, cart, account, WhatsApp.
 * Plus the horizontally scrollable category bar (Requirement 3).
 */
import { html, raw, esc } from '../../lib/utils.js';
import { icon } from  './ui.js';

/**
 * @param {object} ctx  { settings, categories, cart, counts, currentPath }
 */
export function header({ settings, categories, cart = { itemCount: 0 }, stats = {}, currentPath = '/' }) {
  const fbUrl = settings['contact.facebook_url'];
  const whatsapp = settings['contact.whatsapp'];
  const hasSocial = Boolean(fbUrl || settings['contact.instagram_url'] || settings['contact.tiktok_url']);

  return html`
    <!-- Utility strip -->
    <div class="topbar">
      <div class="topbar__inner container">
        <p class="topbar__note">
          ${icon('truck', { size: 14 })}
          <strong>Ready Stock</strong> ships from Bangladesh (1-3 days) &nbsp;·&nbsp;
          <strong>Pre-Order</strong> from China (7-10 days)
        </p>
        <div class="topbar__links">
          ${fbUrl
            ? html`<a href="${fbUrl}" target="_blank" rel="noopener noreferrer">${icon('facebook', { size: 15 })} Facebook</a>`
            : ''}
          ${settings['contact.support_phone']
            ? html`<a href="tel:${String(settings['contact.support_phone']).replace(/[^\d+]/g, '')}"
                >${icon('phone', { size: 15 })} ${settings['contact.support_phone']}</a
              >`
            : ''}
          <a href="/track-order">${icon('package', { size: 15 })} Track Order</a>
        </div>
      </div>
    </div>

    <header class="header" data-header>
      <div class="header__inner container">
        <button class="header__burger" type="button" data-drawer-open aria-label="Open menu" aria-expanded="false">
          ${icon('menu', { size: 22 })}
        </button>

        <a class="logo" href="/" aria-label="AWAJ home">
          <span class="logo__mark" aria-hidden="true">A</span>
          <span class="logo__text">
            <span class="logo__name">AWAJ</span>
            <span class="logo__tag">China Trends, Delivered to Bangladesh</span>
          </span>
        </a>

        <form class="search" action="/search" method="get" role="search" data-search-form>
          <label class="sr-only" for="q">Search products</label>
          <span class="search__icon">${icon('search', { size: 18 })}</span>
          <input
            type="search"
            id="q"
            name="q"
            placeholder="Search products, e.g. mini printer, wireless charger"
            autocomplete="off"
            enterkeyhint="search"
            data-search-input
            value=""
          />
          <button class="search__clear" type="button" data-search-clear hidden aria-label="Clear search">${icon('close', { size: 16 })}</button>
          <button class="search__go" type="submit">Search</button>
          <div class="search__suggest" data-search-suggest hidden role="listbox" aria-label="Search suggestions"></div>
        </form>

        <div class="header__actions">
          <button class="hbtn" type="button" data-image-search-open aria-label="Search by image" title="Search by image">
            ${icon('camera', { size: 20 })}
            <span class="hbtn__label">Image</span>
          </button>

          <a class="hbtn" href="/wishlist" aria-label="Wishlist" title="Wishlist" data-wishlist-link>
            ${icon('heart', { size: 20 })}
            <span class="hbtn__label">Wishlist</span>
            <span class="hbtn__count" data-wishlist-count hidden>0</span>
          </a>

          <a class="hbtn" href="/cart" aria-label="Cart" title="Cart" data-cart-link>
            ${icon('cart', { size: 20 })}
            <span class="hbtn__label">Cart</span>
            <span class="hbtn__count" data-cart-count ${cart.itemCount ? '' : 'hidden'}>${cart.itemCount}</span>
          </a>

          ${whatsapp
            ? html`<a
                class="hbtn hbtn--wa"
                href="${whatsappLink(whatsapp, 'Hello AWAJ, I need some help.')}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                >${icon('whatsapp', { size: 20 })}<span class="hbtn__label">Support</span></a
              >`
            : ''}
        </div>
      </div>

      <!-- Scrollable category bar -->
      <nav class="catbar" aria-label="Product categories">
        <div class="catbar__inner container">
          <a class="catbar__item ${currentPath === '/products' ? 'is-active' : ''}" href="/products"
            >${icon('grid', { size: 15 })} All Products</a
          >
          <a class="catbar__item catbar__item--ready ${currentPath === '/ready-stock' ? 'is-active' : ''}" href="/ready-stock">
            <span class="dot dot--ready" aria-hidden="true"></span> Ready Stock
            ${stats.readyStock ? raw(`<span class="catbar__n">${esc(stats.readyStock)}</span>`) : ''}
          </a>
          <a class="catbar__item catbar__item--pre ${currentPath === '/pre-order' ? 'is-active' : ''}" href="/pre-order">
            <span class="dot dot--pre" aria-hidden="true"></span> Pre-Order
            ${stats.preorder ? raw(`<span class="catbar__n">${esc(stats.preorder)}</span>`) : ''}
          </a>
          ${categories.map(
            (c) => html`<a
              class="catbar__item ${currentPath === `/category/${c.slug}` ? 'is-active' : ''}"
              href="/category/${c.slug}"
              >${c.name}</a
            >`
          )}
        </div>
      </nav>
    </header>
  `;
}

/** Build a wa.me link from a number that may be 017… / 88017… / +88017… */
export function whatsappLink(number, message = '') {
  const digits = String(number || '').replace(/\D/g, '');
  const intl = digits.startsWith('880') ? digits : `880${digits.replace(/^0/, '')}`;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/** Mobile bottom navigation (Requirement 28). */
export function bottomNav({ currentPath = '/', cartCount = 0 } = {}) {
  const items = [
    { href: '/', label: 'Home', icon: 'home', active: currentPath === '/' },
    { href: '/products', label: 'Shop', icon: 'grid', active: /^\/(products|category|search|ready-stock|pre-order)/.test(currentPath) },
    { href: '/search', label: 'Search', icon: 'search', active: currentPath === '/search' },
    { href: '/track-order', label: 'Track', icon: 'package', active: currentPath === '/track-order' },
  ];

  return html`
    <nav class="bottomnav" aria-label="Main navigation">
      ${items.map(
        (i) => html`<a class="bottomnav__item ${i.active ? 'is-active' : ''}" href="${i.href}">
          ${icon(i.icon, { size: 20 })}<span>${i.label}</span>
        </a>`
      )}
      <a class="bottomnav__item bottomnav__item--cart" href="/cart">
        <span class="bottomnav__wrap">
          ${icon('cart', { size: 20 })}
          ${cartCount ? raw(`<span class="bottomnav__badge">${esc(cartCount)}</span>`) : ''}
        </span>
        <span>Cart</span>
      </a>
    </nav>
  `;
}

/** Off-canvas drawer for mobile navigation. */
export function drawer({ settings, categories, currentPath = '' }) {
  return html`
    <div class="drawer" data-drawer hidden>
      <div class="drawer__scrim" data-drawer-close></div>
      <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="drawer__head">
          <span class="logo__name">AWAJ</span>
          <button class="iconbtn" type="button" data-drawer-close aria-label="Close menu">${icon('close', { size: 20 })}</button>
        </div>

        <form class="drawer__search" action="/search" method="get" role="search">
          <input type="search" name="q" placeholder="Search AWAJ…" aria-label="Search products" />
          <button type="submit" class="iconbtn" aria-label="Search">${icon('search', { size: 18 })}</button>
        </form>

        <nav class="drawer__nav" aria-label="Categories">
          <a href="/products" class="${currentPath === '/products' ? 'is-active' : ''}">${icon('grid', { size: 17 })} All Products</a>
          <a href="/ready-stock" class="drawer__pre-ready ${currentPath === '/ready-stock' ? 'is-active' : ''}">
            <span class="dot dot--ready"></span> Ready Stock
          </a>
          <a href="/pre-order" class="drawer__pre-pre ${currentPath === '/pre-order' ? 'is-active' : ''}">
            <span class="dot dot--pre"></span> Pre-Order from China
          </a>
          ${categories.map(
            (c) => html`<a href="/category/${c.slug}" class="${currentPath === `/category/${c.slug}` ? 'is-active' : ''}"
              >${icon('tag', { size: 17 })} ${c.name}</a
            >`
          )}
        </nav>

        <div class="drawer__foot">
          <a href="/track-order">${icon('package', { size: 17 })} Track Your Order</a>
          <a href="/wishlist">${icon('heart', { size: 17 })} Wishlist</a>
          <a href="/about">${icon('info', { size: 17 })} About AWAJ</a>
          <a href="/contact">${icon('phone', { size: 17 })} Contact</a>
          ${settings['contact.facebook_url']
            ? html`<a href="${settings['contact.facebook_url']}" target="_blank" rel="noopener noreferrer">
                ${icon('facebook', { size: 17 })} ${settings['social.facebook_follow_text'] || 'Follow on Facebook'}
              </a>`
            : ''}
        </div>
      </aside>
    </div>
  `;
}

/** Floating WhatsApp button, shown on every page. */
export function floatingWhatsapp(settings) {
  const number = settings['contact.whatsapp'];
  if (!number) return '';
  return html`
    <a
      class="fab fab--wa"
      href="${whatsappLink(number, 'Hello AWAJ, I need help with an order.')}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with AWAJ on WhatsApp"
      title="Chat on WhatsApp"
      data-wa-fab
    >
      ${icon('whatsapp', { size: 24 })}
    </a>
  `;
}
