/**
 * AWAJ storefront client script.
 *
 * Progressive enhancement only: every feature here also works with JavaScript
 * disabled (forms navigate, the cart lives in a signed cookie). Written as
 * native ES modules with no build step and no dependencies.
 */

const CART_KEY = 'awaj_cart_v1';
const WISH_KEY = 'awaj_wishlist_v1';

/* ========================================================================== */
/* Storage helpers (private mode safe)                                          */
/* ========================================================================== */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/* ========================================================================== */
/* Cart                                                                        */
/* ========================================================================== */

const cart = {
  items: store.get(CART_KEY, null) ?? window.AWAJ?.cart?.items ?? [],

  save() {
    store.set(CART_KEY, this.items);
  },

  lineKey(id, variantId) {
    return `${id}:${variantId ?? ''}`;
  },

  find(id, variantId) {
    return this.items.find((l) => l.id === Number(id) && (l.variantId || null) === (variantId ? Number(variantId) : null));
  },

  /**
   * Optimistically update local state, then reconcile with the server.
   * The server response is authoritative because it knows real stock and prices.
   */
  async call(action, payload = {}) {
    let res;
    try {
      res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch {
      toast('You appear to be offline. Your cart could not be updated.', 'error');
      return { ok: false, offline: true };
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast(data.error || 'Could not update your cart', 'error');
      return { ok: false, ...data };
    }

    this.items = data.items || [];
    this.save();
    cartUI.refresh(data);
    return { ok: true, ...data };
  },

  async add(id, { qty = 1, variantId = null, title = '' } = {}) {
    const result = await this.call('add', { id, qty, variantId });
    if (result.ok) {
      const pre = result.hasPreorder;
      toast(
        pre
          ? 'Added to cart. Pre-order items ship from China in 7-10 days.'
          : 'Added to cart',
        'success'
      );
    }
    return result;
  },

  setQty(id, qty, variantId = null) {
    return this.call('setQty', { id, qty, variantId });
  },

  remove(id, variantId = null) {
    return this.call('remove', { id, variantId });
  },

  clear() {
    return this.call('clear');
  },

  /** Buy now: replace this line and jump to checkout. */
  async buyNow(id, variantId = null, qty = 1) {
    const result = await this.call('buy', { id, variantId, qty });
    if (result.ok) window.location.href = '/checkout';
    return result;
  },
};

const cartUI = {
  badge() {
    return document.querySelector('[data-cart-count]');
  },

  wishBadge() {
    return document.querySelector('[data-wishlist-count]');
  },

  refresh(data = {}) {
    const count = data.summary?.itemCount ?? this.localCount();
    const badge = this.badge();
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }

    // Mobile bottom-nav badge
    document.querySelectorAll('.bottomnav__badge').forEach((el) => {
      el.textContent = count;
    });
    const mobileCart = document.querySelector('.bottomnav__item--cart .bottomnav__wrap');
    if (mobileCart) {
      mobileCart.querySelector('.bottomnav__badge')?.remove();
      if (count > 0) {
        const span = document.createElement('span');
        span.className = 'bottomnav__badge';
        span.textContent = count;
        mobileCart.append(span);
      }
    }

    // On a cart/checkout page the server is the source of truth; reload it.
    if (data.items && /^\/(cart|checkout)/.test(window.location.pathname)) {
      scheduleReload();
    }
  },

  localCount() {
    return cart.items.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  },
};

let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => window.location.reload(), 550);
}

/* ========================================================================== */
/* Wishlist                                                                    */
/* ========================================================================== */

const wishlist = {
  ids: store.get(WISH_KEY, []),

  save() {
    store.set(WISH_KEY, this.ids);
  },

  has(id) {
    return this.ids.includes(Number(id));
  },

  toggle(id) {
    const n = Number(id);
    if (this.has(n)) this.ids = this.ids.filter((x) => x !== n);
    else this.ids.push(n);
    this.save();
    this.paint();
    return this.has(n);
  },

  paint() {
    const count = this.ids.length;
    const badge = cartUI.wishBadge();
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
    document.querySelectorAll('[data-wish]').forEach((btn) => {
      const on = this.has(btn.dataset.wish);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.style.color = on ? 'var(--deal)' : '';
      btn.style.borderColor = on ? 'var(--deal)' : '';
    });
    const link = document.querySelector('[data-wishlist-link]');
    if (link) link.href = `/wishlist?ids=${this.ids.join(',')}`;
  },

  /** Re-render the wishlist page in place when items are toggled there. */
  renderPage() {
    const root = document.querySelector('[data-wishlist-root]');
    if (!root) return;
    const cards = document.querySelectorAll('[data-wishlist-root] .pcard');
    const empty = this.ids.length === 0;
    root.classList.toggle('is-empty', empty);
    if (empty) {
      const msg = root.dataset.emptyMessage || 'Your wishlist is empty.';
      root.innerHTML = `<div class="empty"><h3 class="empty__title">${escapeHtml(msg)}</h3>
        <a class="btn btn--primary" href="/products">Browse products</a></div>`;
    }
  },
};

/* ========================================================================== */
/* Toast                                                                       */
/* ========================================================================== */

let toastEl = null;
let toastTimer = null;

function toast(message, kind = 'info') {
  if (!message) return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    Object.assign(toastEl.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(var(--bottomnav-h) + 76px)',
      transform: 'translateX(-50%)',
      zIndex: '130',
      maxWidth: 'min(92vw, 420px)',
      padding: '11px 16px',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '600',
      boxShadow: '0 10px 30px rgba(15,23,42,.18)',
      color: '#fff',
      transition: 'opacity .2s ease',
    });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.background =
    kind === 'error' ? '#dc2626' : kind === 'success' ? '#059669' : '#0f172a';
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
  }, 3200);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ========================================================================== */
/* Add-to-cart buttons                                                         */
/* ========================================================================== */

function initCartButtons() {
  document.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      e.preventDefault();
      const id = Number(addBtn.dataset.add);
      const variantId = currentVariantId();
      addBtn.disabled = true;
      await cart.add(id, { qty: currentQty(), variantId, title: addBtn.dataset.title });
      addBtn.disabled = false;
      return;
    }

    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn) {
      e.preventDefault();
      await cart.buyNow(Number(buyBtn.dataset.buy), currentVariantId(), currentQty());
      return;
    }

    const detail = e.target.closest('[data-add-detail]');
    if (detail) {
      e.preventDefault();
      detail.disabled = true;
      await cart.add(Number(detail.dataset.id), {
        qty: currentQty(),
        variantId: currentVariantId(),
        title: detail.dataset.title,
      });
      detail.disabled = false;
      return;
    }

    const buyDetail = e.target.closest('[data-buy-detail]');
    if (buyDetail) {
      e.preventDefault();
      await cart.buyNow(Number(buyDetail.dataset.id), currentVariantId(), currentQty());
    }
  });
}

/** Read the quantity/variant from the product detail page, if present. */
function currentQty() {
  const input = document.querySelector('[data-buy-form] input[name="qty"]');
  return input ? Math.max(1, Number(input.value) || 1) : 1;
}

function currentVariantId() {
  const active = document.querySelector('.variant.is-active');
  if (active) return Number(active.dataset.variant);
  const hidden = document.querySelector('[data-variant-input]');
  return hidden && hidden.value ? Number(hidden.value) : null;
}

/* ========================================================================== */
/* Wishlist buttons                                                            */
/* ========================================================================== */

function initWishButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    const added = wishlist.toggle(btn.dataset.wish);
    toast(added ? 'Saved to your wishlist' : 'Removed from your wishlist', 'success');
    wishlist.renderPage();
  });
}

/* ========================================================================== */
/* Cart page interactions                                                      */
/* ========================================================================== */

function initCartPage() {
  const list = document.querySelector('[data-cart-list]');
  if (!list) return;

  const district = new URLSearchParams(window.location.search).get('district') || '';

  const lineEl = (line) => list.querySelector(`[data-line="${line.id}"][data-variant="${line.variantId || ''}"]`);

  const busy = (el, on) => el?.classList.toggle('is-busy', on);

  list.addEventListener('click', async (e) => {
    const li = e.target.closest('[data-line]');
    if (!li) return;
    const id = Number(li.dataset.line);
    const variantId = li.dataset.variant ? Number(li.dataset.variant) : null;
    const input = li.querySelector('[data-line-qty]');

    if (e.target.closest('[data-line-plus]')) {
      busy(li, true);
      await cart.setQty(id, (Number(input.value) || 0) + 1, variantId);
      busy(li, false);
    } else if (e.target.closest('[data-line-minus]')) {
      busy(li, true);
      const next = (Number(input.value) || 1) - 1;
      if (next < 1) {
        await cart.remove(id, variantId);
        toast('Item removed from your cart');
      } else {
        await cart.setQty(id, next, variantId);
      }
      busy(li, false);
    } else if (e.target.closest('[data-line-remove]')) {
      busy(li, true);
      await cart.remove(id, variantId);
      toast('Item removed from your cart');
      busy(li, false);
    }
  });

  list.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-line-qty]')) return;
    const li = e.target.closest('[data-line]');
    const id = Number(li.dataset.line);
    const variantId = li.dataset.variant ? Number(li.dataset.variant) : null;
    busy(li, true);
    const qty = Number(e.target.value) || 1;
    if (qty < 1) await cart.remove(id, variantId);
    else await cart.setQty(id, qty, variantId);
    busy(li, false);
  });

  document.querySelector('[data-cart-clear]')?.addEventListener('click', async () => {
    if (!confirm('Remove all items from your cart?')) return;
    await cart.clear();
    toast('Cart cleared');
  });
}

/* ========================================================================== */
/* Product detail: quantity, variants, gallery, tabs                           */
/* ========================================================================== */

function initProductPage() {
  /* ---- Quantity ---- */
  const qtyInput = document.querySelector('[data-buy-form] input[name="qty"]');
  if (qtyInput) {
    const totalEl = document.querySelector('[data-line-total]');
    const basePrice = Number(document.querySelector('[data-price-base]')?.dataset.price) || 0;
    const unitBase = basePrice || Number(window.__awajProductPrice || 0);

    const update = () => {
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      const delta = Number(document.querySelector('.variant.is-active')?.dataset.delta || 0);
      const unit = unitBase + delta;
      if (totalEl && unit) {
        totalEl.textContent = `৳${Math.round(unit * qty).toLocaleString('en-US')}`;
      }
    };

    document.querySelector('[data-qty-minus]')?.addEventListener('click', () => {
      qtyInput.value = Math.max(1, (Number(qtyInput.value) || 1) - 1);
      update();
    });
    document.querySelector('[data-qty-plus]')?.addEventListener('click', () => {
      const max = Number(qtyInput.max) || 20;
      qtyInput.value = Math.min(max, (Number(qtyInput.value) || 1) + 1);
      update();
    });
    qtyInput.addEventListener('input', update);
    update();
  }

  /* ---- Variants ---- */
  const variantBox = document.querySelector('[data-variants]');
  if (variantBox) {
    const hidden = variantBox.querySelector('[data-variant-input]');
    variantBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.variant');
      if (!btn || btn.disabled) return;
      variantBox.querySelectorAll('.variant').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (hidden) hidden.value = btn.dataset.variant;
      const label = variantBox.querySelector(`[data-variant-label="${CSS.escape(btn.dataset.name)}"]`);
      if (label) label.textContent = btn.dataset.value;
      variantBox.dispatchEvent(new Event('change'));
    });
  }

  /* ---- Gallery ---- */
  const gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    const thumbs = [...gallery.querySelectorAll('[data-gallery-thumb]')];
    const images = [...gallery.querySelectorAll('[data-gallery-img]')];
    const main = gallery.querySelector('.gallery__img.is-main') || images[0];
    let index = 0;

    const show = (i) => {
      index = (i + images.length) % images.length;
      images.forEach((img, n) => {
        img.hidden = n !== index;
      });
      thumbs.forEach((t, n) => {
        t.classList.toggle('is-active', n === index);
        t.setAttribute('aria-selected', n === index ? 'true' : 'false');
      });
    };

    thumbs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', () => show(index - 1));
    gallery.querySelector('[data-gallery-next]')?.addEventListener('click', () => show(index + 1));
    if (images.length > 1) show(0);

    /* ---- Lightbox ---- */
    const lightbox = document.querySelector('[data-lightbox]');
    if (lightbox) {
      const lbImg = lightbox.querySelector('[data-lightbox-img]');
      const openLb = (i) => {
        const img = images[i];
        if (!img) return;
        lbImg.src = img.currentSrc || img.src;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
        lbImg.focus?.();
      };
      const closeLb = () => {
        lightbox.hidden = true;
        document.body.style.overflow = '';
      };
      gallery.querySelector('[data-gallery-zoom]')?.addEventListener('click', () => openLb(index));
      thumbs.forEach((t, i) =>
        t.addEventListener('dblclick', () => openLb(i))
      );
      lightbox.querySelector('[data-lightbox-close]')?.addEventListener('click', closeLb);
      lightbox.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => openLb(index - 1));
      lightbox.querySelector('[data-lightbox-next]')?.addEventListener('click', () => openLb(index + 1));
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLb();
      });
      document.addEventListener('keydown', (e) => {
        if (lightbox.hidden) return;
        if (e.key === 'Escape') closeLb();
        if (e.key === 'ArrowLeft') openLb(index - 1);
        if (e.key === 'ArrowRight') openLb(index + 1);
      });
    }
  }

  /* ---- Tabs ---- */
  const tabList = document.querySelector('[data-tabs]');
  if (tabList) {
    const tabs = [...tabList.querySelectorAll('[data-tab]')];
    const panels = [...document.querySelectorAll('[data-panel]')];
    const activate = (id) => {
      tabs.forEach((t) => {
        const on = t.dataset.tab === id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach((p) => {
        const on = p.dataset.panel === id.replace('tab-', '');
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    };
    tabList.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) activate(tab.dataset.tab);
    });
    tabList.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight') tabs[(i + 1) % tabs.length].focus();
      if (e.key === 'ArrowLeft') tabs[(i - 1 + tabs.length) % tabs.length].focus();
    });
  }

  /* ---- Copy order id on the confirmation page ---- */
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Order ID copied', 'success');
      } catch {
        toast(`Your order ID is ${btn.dataset.copy}`);
      }
    });
  });
}

/* ========================================================================== */
/* Search: live suggestions                                                     */
/* ========================================================================== */

function initSearch() {
  const form = document.querySelector('[data-search-form]');
  if (!form) return;
  const input = form.querySelector('[data-search-input]');
  const box = form.querySelector('[data-search-suggest]');
  const clear = form.querySelector('[data-search-clear]');
  if (!input || !box) return;

  let timer = null;
  let controller = null;
  let lastQuery = '';

  const close = () => {
    box.hidden = true;
    box.innerHTML = '';
  };

  const hideClear = () => {
    if (clear) clear.hidden = !input.value;
  };
  hideClear();

  input.addEventListener('input', () => {
    const q = input.value.trim();
    hideClear();
    clearTimeout(timer);
    if (q.length < 2 || q === lastQuery) {
      close();
      return;
    }
    timer = setTimeout(() => runSuggest(q), 220);
  });

  async function runSuggest(q) {
    controller?.abort();
    controller = new AbortController();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      lastQuery = q;
      render(data, q);
    } catch {
      /* aborted or offline */
    }
  }

  function render(data, q) {
    if (!data.results?.length) {
      box.innerHTML = `<div class="sug__foot">No matches for &ldquo;${escapeHtml(q)}&rdquo;. Press Enter to search anyway.</div>`;
      box.hidden = false;
      return;
    }
    box.innerHTML =
      data.results
        .map(
          (p) => `<a class="sug" href="/product/${encodeURIComponent(p.slug)}">
            <img class="sug__img" src="${escapeHtml(p.thumb)}" alt="" width="40" height="40" loading="lazy">
            <span class="sug__body">
              <span class="sug__name">${escapeHtml(p.title)}</span>
              <span class="sug__meta">
                <span class="sug__price">৳${Number(p.price).toLocaleString('en-US')}</span>
                <span class="badge badge--sm badge--${p.preorder ? 'preorder' : 'ready'}">${p.preorder ? 'Pre-Order' : 'Ready Stock'}</span>
              </span>
            </span>
          </a>`
        )
        .join('') +
      `<div class="sug__foot">${data.total} result${data.total === 1 ? '' : 's'} &mdash; press Enter to see all</div>`;
    box.hidden = false;
  }

  clear?.addEventListener('click', () => {
    input.value = '';
    hideClear();
    close();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/* ========================================================================== */
/* Hero carousel + rails                                                        */
/* ========================================================================== */

function initHero() {
  const track = document.querySelector('[data-hero-track]');
  if (!track) return;
  const slides = [...track.querySelectorAll('[data-hero-slide]')];
  const dots = [...document.querySelectorAll('[data-hero-dot]')];
  if (slides.length < 2) return;

  let index = 0;
  let timer = null;

  const goTo = (i, smooth = true) => {
    index = (i + slides.length) % slides.length;
    track.scrollTo({ left: slides[index].offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
    dots.forEach((d, n) => {
      d.classList.toggle('is-active', n === index);
      d.setAttribute('aria-selected', n === index ? 'true' : 'false');
    });
  };

  const start = () => {
    stop();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer = setInterval(() => goTo(index + 1), 6000);
  };
  const stop = () => clearInterval(timer);

  document.querySelector('[data-hero-prev]')?.addEventListener('click', () => {
    goTo(index - 1);
    start();
  });
  document.querySelector('[data-hero-next]')?.addEventListener('click', () => {
    goTo(index + 1);
    start();
  });
  dots.forEach((d, i) => d.addEventListener('click', () => {
    goTo(i);
    start();
  }));

  // Keep the dots in sync when the user swipes.
  let scrollTimer = null;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== index) goTo(i, false);
    }, 90);
  }, { passive: true });

  // Pause while the tab is hidden or the pointer is over the hero.
  const hero = track.closest('.hero');
  hero?.addEventListener('mouseenter', stop);
  hero?.addEventListener('mouseleave', start);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  start();
}

function initRails() {
  document.querySelectorAll('[data-rail]').forEach((rail) => {
    const track = rail.querySelector('.rail__track');
    const prev = rail.querySelector('[data-rail-prev]');
    const next = rail.querySelector('[data-rail-next]');
    if (!track) return;

    const step = () => Math.max(200, track.clientWidth * 0.8);
    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

    // Hide the arrows when there is nothing left to scroll to.
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 4;
      prev?.toggleAttribute('hidden', track.scrollLeft <= 4);
      next?.toggleAttribute('hidden', track.scrollLeft >= max);
    };
    track.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  });
}

/* ========================================================================== */
/* Deal countdowns                                                             */
/* ========================================================================== */

/**
 * Renders a live countdown from the admin-set `deal_ends_at`.
 * The server already bakes in a server-rendered fallback string, so this only
 * refines it; if JS is off the original text still reads correctly.
 */
function initCountdowns() {
  const nodes = document.querySelectorAll('[data-countdown]');
  if (!nodes.length) return;

  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const now = Date.now();
    nodes.forEach((node) => {
      const end = Date.parse(node.dataset.countdown);
      if (Number.isNaN(end)) return;
      const left = end - now;
      if (left <= 0) {
        node.classList.add('is-expired');
        return;
      }
      const d = Math.floor(left / 864e5);
      const h = Math.floor((left % 864e5) / 36e5);
      const m = Math.floor((left % 36e5) / 6e4);
      const s = Math.floor((left % 6e4) / 1000);
      const text = d > 0
        ? `${d}d ${h}h ${m}m left`
        : h > 0
          ? `${h}h ${m}m ${pad(s)}s left`
          : `${m}m ${pad(s)}s left`;
      // Only touch the text when it is a deal timer, not a delivery estimate.
      if (node.hasAttribute('data-deal-timer')) {
        const span = node.querySelector('span');
        if (span) span.textContent = `Ends in ${text.replace(' left', '')}`;
        else node.textContent = `Ends in ${text}`;
      }
      node.title = `Offer ends ${new Date(end).toLocaleString('en-GB')}`;
    });
  };

  tick();
  setInterval(tick, 1000);
}

/* ========================================================================== */
/* Drawer + filters drawers                                                     */
/* ========================================================================== */

function initDrawer() {
  const drawer = document.querySelector('[data-drawer]');
  if (!drawer) return;
  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelector('[data-drawer-open]')?.setAttribute('aria-expanded', 'true');
    drawer.querySelector('a, button')?.focus();
  };
  const close = () => {
    drawer.hidden = true;
    document.body.style.overflow = '';
    document.querySelector('[data-drawer-open]')?.setAttribute('aria-expanded', 'false');
    lastFocus?.focus();
  };

  document.querySelector('[data-drawer-open]')?.addEventListener('click', open);
  drawer.querySelectorAll('[data-drawer-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });
  drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

  // Trap focus inside the drawer while it is open.
  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...drawer.querySelectorAll('a[href], button, input')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

function initFilterDrawer() {
  const panel = document.querySelector('[data-filters]');
  if (!panel) return;

  const open = () => {
    panel.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    panel.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  document.querySelectorAll('[data-filters-open]').forEach((b) => b.addEventListener('click', open));
  panel.querySelectorAll('[data-filters-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
  });
}

/* ========================================================================== */
/* Auto-submitting filter forms                                                 */
/* ========================================================================== */

function initFilterForms() {
  // Sort dropdown
  document.querySelectorAll('[data-autosubmit] select').forEach((select) => {
    select.addEventListener('change', () => select.form?.requestSubmit());
  });

  // Checkboxes / radios
  document.querySelectorAll('[data-autosubmit-change]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.name === 'cat' && !input.value) return;
      input.form?.requestSubmit();
    });
  });

  // "All categories" clears the group.
  document.querySelectorAll('[data-clear-cat]').forEach((input) => {
    input.addEventListener('change', () => {
      document
        .querySelectorAll('input[name="cat"]')
        .forEach((cb) => (cb.checked = false));
      input.checked = true;
      input.form?.requestSubmit();
    });
  });

  // Price inputs submit on blur, so typing does not reload mid-word.
  document.querySelectorAll('[data-price-input]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.value === '') return;
      input.form?.requestSubmit();
    });
  });
}

/* ========================================================================== */
/* Checkout: live delivery + total                                             */
/* ========================================================================== */

function initCheckout() {
  const cfg = window.AWAJ_CHECKOUT;
  const form = document.querySelector('[data-checkout]');
  if (!cfg || !form) return;

  const district = form.querySelector('[data-district]');
  const subEl = document.querySelector('[data-sum-subtotal]');
  const delEl = document.querySelector('[data-sum-delivery]');
  const totalEl = document.querySelector('[data-sum-total]');
  const inside = new Set(cfg.insideDistricts || []);

  const taka = (n) => `৳${Math.round(n).toLocaleString('en-US')}`;

  const recalc = () => {
    const d = district?.value;
    let fee = 0;
    if (d) {
      const rate = inside.has(d) ? cfg.insideDhaka : cfg.outsideDhaka;
      fee = cfg.freeThreshold > 0 && cfg.subtotal >= cfg.freeThreshold ? 0 : rate;
    }
    if (subEl) subEl.textContent = taka(cfg.subtotal);
    if (delEl) delEl.textContent = d ? (fee === 0 ? 'FREE' : taka(fee)) : 'Select district';
    if (totalEl) totalEl.textContent = taka(cfg.subtotal + fee);
  };

  district?.addEventListener('change', recalc);
  recalc();

  // Normalise the phone field as the customer types.
  const phone = form.querySelector('[data-phone]');
  const whatsapp = form.querySelector('[data-whatsapp]');
  const clean = (v) => v.replace(/[^\d+]/g, '').slice(0, 16);
  phone?.addEventListener('input', () => {
    const before = phone.value;
    const after = clean(before);
    if (before !== after) phone.value = after;
    // Mirror into WhatsApp until the customer edits it themselves.
    if (whatsapp && whatsapp.dataset.touched !== 'true') whatsapp.value = after;
  });
  whatsapp?.addEventListener('input', () => {
    whatsapp.dataset.touched = 'true';
  });

  // Guard against double submission.
  form.addEventListener('submit', (e) => {
    const btn = form.querySelector('[data-submit]');
    if (!btn) return;
    if (btn.disabled) {
      e.preventDefault();
      return;
    }
    if (!form.reportValidity()) {
      e.preventDefault();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Placing your order…';
  });
}

/* ========================================================================== */
/* Image search preview                                                         */
/* ========================================================================== */

function initImageSearch() {
  const form = document.querySelector('[data-imgsearch]');
  if (!form) return;
  const input = form.querySelector('[data-file]');
  const preview = form.querySelector('[data-preview]');
  const drop = form.querySelector('[data-drop]');
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('That image is larger than 8 MB. Please choose a smaller one.', 'error');
      input.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Selected image preview">`;
    URL.revokeObjectURL(url);
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('is-drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('is-drag');
    })
  );
  drop?.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    // Assigning to input.files is not supported everywhere, so fall back to
    // telling the customer to use the picker.
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    } catch {
      toast('Please tap the box to choose the image.', 'error');
    }
  });
}

/* ========================================================================== */
/* Track order (GET form)                                                       */
/* ========================================================================== */

function initTrackForm() {
  const form = document.querySelector('[data-track-form]');
  if (!form) return;
  const code = form.querySelector('[data-track-code]');
  code?.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });
}

/* ========================================================================== */
/* Reveal product price for the detail page total                              */
/* ========================================================================== */

function initPriceBase() {
  // The server renders the price in the DOM; expose it for the qty calculator.
  const now = document.querySelector('.buybox__now');
  if (!now) return;
  const match = now.textContent.replace(/[^\d]/g, '');
  if (match) window.__awajProductPrice = Number(match);
}

/* ========================================================================== */
/* Boot                                                                        */
/* ========================================================================== */

function boot() {
  initCartButtons();
  initWishButtons();
  initCartPage();
  initProductPage();
  initSearch();
  initHero();
  initRails();
  initCountdowns();
  initDrawer();
  initFilterDrawer();
  initFilterForms();
  initCheckout();
  initImageSearch();
  initTrackForm();
  initPriceBase();

  wishlist.paint();
  cartUI.refresh();
}

// A tiny event API used by the header search button.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-image-search-open]')) {
    e.preventDefault();
    window.location.href = '/image-search';
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
