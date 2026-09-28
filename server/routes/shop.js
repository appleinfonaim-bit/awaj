/**
 * Public storefront routes.
 *
 * Every page is server-rendered. Query-string filters map onto
 * `searchProducts()`, so filtering is a plain navigation (works without
 * JavaScript, shareable, and crawlable).
 */
import { raw, taka, plainText, url as buildUrl } from  '../lib/utils.js';
import { config, DISTRICTS } from  '../config.js';
import { storefront } from '../lib/settings.js';
import { sendHtml, readJson, redirect, parseCookies, clientIp } from '../lib/http.js';
import { rateLimit } from '../db/index.js';
import * as cat from '../lib/catalogue.js';
import * as orders from '../lib/orders.js';
import { priceCart, normalizeCart, cartSummary, CART_COOKIE } from '../lib/cart.js';
import { signValue, unsignValue, hashKey } from '../lib/security.js';
import { searchByImage, imageSearchProviderInfo } from '../lib/image-search.js';
import { readMultipart } from '../lib/http.js';
import { storeUpload, ensureDerivatives } from  '../lib/images.js';

import { layout, organisationSchema, websiteSchema, productSchema, breadcrumbSchema, itemListSchema } from '../views/layout.js';
import { homePage } from '../views/pages/home.js';
import { productPage } from '../views/pages/product.js';
import { listingPage } from '../views/pages/listing.js';
import { cartPage } from '../views/pages/cart.js';
import { checkoutPage, orderConfirmationPage } from '../views/pages/checkout.js';
import { trackOrderPage } from '../views/pages/track.js';
import { aboutPage, contactPage, policyPage, wishlistPage, imageSearchPage, notFoundPage } from '../views/pages/misc.js';

/* -------------------------------------------------------------------------- */
/* Request context                                                             */
/* -------------------------------------------------------------------------- */

/** Read the cart from the signed cookie, falling back to an empty cart. */
function readCartCookie(req) {
  const raw = parseCookies(req)[CART_COOKIE];
  const signed = unsignValue(raw);
  return signed && Array.isArray(signed.items) ? signed.items : [];
}

/**
 * Mirror the cart into a signed cookie so guests keep it even if localStorage
 * is unavailable.
 *
 * An emptied cart must actively delete the cookie. Returning early here used to
 * leave the previous cart in place, so "clear cart" did nothing and items
 * reappeared on the next page load.
 */
function writeCartCookie(res, items) {
  const safe = normalizeCart(items);
  const existing = res.getHeader('Set-Cookie');
  const keep = existing ? [].concat(existing).filter((c) => !String(c).startsWith(`${CART_COOKIE}=`)) : [];

  if (!safe.length) {
    res.setHeader('Set-Cookie', [...keep, `${CART_COOKIE}=; Path=/; Max-Age=0; HttpOnly=false; SameSite=Lax`]);
    return;
  }

  const value = encodeURIComponent(signValue({ items: safe, t: Date.now() }));
  res.setHeader('Set-Cookie', [
    ...keep,
    `${CART_COOKIE}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly=false; SameSite=Lax`,
  ]);
}

/** Build the shared context every page needs. */
export function buildContext(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const settings = storefront();
  const categories = cat.getCategories();
  const cookieCart = readCartCookie(req);
  const cart = cartSummary(cookieCart);

  return {
    req,
    url,
    settings,
    categories,
    cart: { ...cart, items: cookieCart },
    stats: cat.getCatalogueStats(),
    currentPath: url.pathname + (url.search || ''),
  };
}

/* -------------------------------------------------------------------------- */
/* Home                                                                        */
/* -------------------------------------------------------------------------- */

function buildBanners(settings, data) {
  const ready = data.readyStock[0];
  const pre = data.preorder[0];
  const deal = data.hotDeals[0];

  const banners = [
    {
      eyebrow: 'Trending From China',
      title: 'Find the products everyone is buying',
      text: 'Order Ready Stock for delivery in 1-3 days, or pre-order from China and receive it in about 7-10 days.',
      cta: [
        { label: 'Shop Ready Stock', href: '/ready-stock', style: 'primary' },
        { label: 'Explore Pre-Order', href: '/pre-order', style: 'light' },
      ],
      icon: 'truck',
      badge: settings['store.tagline'],
    },
  ];

  if (ready) {
    banners.push({
      eyebrow: 'Ready Stock in Bangladesh',
      title: ready.title,
      text: ready.subtitle || 'In stock and ready to ship. Order now and it arrives in 1-3 days.',
      cta: [
        { label: 'Buy Now', href: `/product/${ready.slug}`, style: 'primary' },
        { label: 'See all ready stock', href: '/ready-stock', style: 'light' },
      ],
      icon: 'box',
      badge: `${taka(ready.price)}${ready.compare_price ? ` · was ${taka(ready.compare_price)}` : ''}`,
    });
  }

  if (pre) {
    banners.push({
      eyebrow: 'Pre-Order From China',
      title: pre.title,
      text: 'We source this from China after you order. Estimated delivery 7-10 days.',
      cta: [
        { label: 'Pre-Order Now', href: `/product/${pre.slug}`, style: 'primary' },
        { label: 'How pre-order works', href: '/about', style: 'light' },
      ],
      icon: 'truck',
      badge: `${taka(pre.price)} · estimated 7-10 days`,
    });
  }

  if (deal) {
    banners.push({
      eyebrow: 'Hot Deal',
      title: deal.title,
      text: `Limited offer${deal.compare_price ? `, ${deal.discount}% off` : ''}. While stocks last.`,
      cta: [{ label: 'View deal', href: `/product/${deal.slug}`, style: 'primary' }],
      icon: 'tag',
      badge: deal.compare_price ? `Save ${taka(deal.compare_price - deal.price)}` : '',
    });
  }

  return banners.slice(0, 3);
}

function homeData(ctx) {
  const s = ctx.settings;
  const readyLimit = Number(s['site.home_ready_stock_limit']) || 10;
  const preLimit = Number(s['site.home_preorder_limit']) || 10;

  const data = {
    banners: [],
    readyStock: cat.getReadyStock(readyLimit),
    preorder: cat.getPreorder(preLimit),
    hotDeals: s['site.show_hot_deals'] ? cat.getHotDeals(4) : [],
    trending: cat.getTrending(8),
    newArrivals: cat.getNewArrivals(8),
    facebookCta: null,
    discoverSections: [],
  };

  data.banners = buildBanners(s, data);

  // Category discovery rails, only where there is enough to show.
  const wanted = [
    { key: 'gadgets', title: 'Popular Gadgets' },
    { key: 'fashion', title: 'Fashion Picks' },
    { key: 'beauty', title: 'Beauty & Personal Care' },
    { key: 'home-kitchen', title: 'Home & Kitchen' },
    { key: 'bags', title: 'Bags & Accessories' },
  ];
  // Requirement 11 asks for these specific sections, so they are always shown.
  // A rail with two products is still a useful way in; only a completely empty
  // category is dropped.
  data.discoverSections = wanted
    .map((sec) => ({
      ...sec,
      href: `/category/${sec.key}`,
      products: cat.searchProducts({ category: sec.key, perPage: 8, sort: 'popular' }).items,
    }))
    .filter((sec) => sec.products.length > 0);

  if (ctx.settings['contact.facebook_url']) {
    data.facebookCta = data.trending[0] || data.preorder[0] || data.readyStock[0] || null;
  }

  return data;
}

export async function homeRoute(req, res) {
  const ctx = buildContext(req);
  const data = homeData(ctx);

  const htmlOut = layout({
    title: ctx.settings['seo.default_title'] || 'AWAJ - China Trends, Delivered to Bangladesh',
    description: ctx.settings['seo.default_description'],
    ctx,
    body: homePage({ ctx, data }),
    canonical: `${config.siteUrl}/`,
    jsonLd: [organisationSchema(ctx.settings), websiteSchema(ctx.settings)],
  });

  sendHtml(res, 200, htmlOut, { 'Cache-Control': 'public, max-age=120' });
}

/* -------------------------------------------------------------------------- */
/* Listing pages                                                               */
/* -------------------------------------------------------------------------- */

/** Read filters from the query string. */
function readFilters(sp) {
  return {
    q: (sp.get('q') || '').trim().slice(0, 100),
    category: sp.getAll('cat').filter(Boolean),
    type: ['ready_stock', 'preorder'].includes(sp.get('type')) ? sp.get('type') : '',
    minPrice: sp.get('min') || '',
    maxPrice: sp.get('max') || '',
    isNew: sp.get('new') === '1',
    discounted: sp.get('off') === '1',
    inStock: sp.get('stock') === '1',
    sort: sp.get('sort') || '',
    page: Number(sp.get('page')) || 1,
  };
}

function renderListing(req, res, { heading, subheading, trail, basePath, extra = {}, showFilters = true, filters: forced }) {
  const ctx = buildContext(req);
  const sp = ctx.url.searchParams;
  const filters = forced || readFilters(sp);
  const perPage = Number(ctx.settings['site.products_per_page']) || 24;

  const result = cat.searchProducts({ ...filters, perPage });
  const priceBounds = cat.getPriceBounds();

  const body = listingPage({
    data: { heading, subheading, trail, basePath, result, filters, categories: ctx.categories, priceBounds, showFilters, ...extra },
    ctx,
  });

  const canonical = buildUrl(basePath, {
    q: filters.q, cat: filters.category, type: filters.type,
    min: filters.minPrice, max: filters.maxPrice,
    new: filters.isNew ? 1 : '', off: filters.discounted ? 1 : '', stock: filters.inStock ? 1 : '',
  });

  const jsonLd = [
    breadcrumbSchema(trail),
    ...(result.items.length && !filters.q ? [itemListSchema(result.items)] : []),
  ];

  sendHtml(
    res,
    200,
    layout({
      title: heading,
      description: subheading || plainText(result.items[0]?.description || '') || ctx.settings['seo.default_description'],
      ctx: { ...ctx, currentPath: canonical },
      body,
      canonical: `${config.siteUrl}${canonical}`,
      jsonLd,
    }),
    { 'Cache-Control': 'public, max-age=120' }
  );
}

export function productsRoute(req, res) {
  renderListing(req, res, {
    heading: 'All Products',
    subheading: 'Every product AWAJ imports and stocks, from ready stock to China pre-orders.',
    basePath: '/products',
    trail: [{ name: 'Home', href: '/' }, { name: 'All Products' }],
  });
}

export function readyStockRoute(req, res) {
  renderListing(req, res, {
    heading: 'Ready Stock',
    subheading: 'Available in Bangladesh now. Order and receive in 1-3 days, Cash on Delivery available.',
    basePath: '/ready-stock',
    trail: [{ name: 'Home', href: '/' }, { name: 'Ready Stock' }],
    extra: { notice: { kind: 'ready', text: 'These items are already in our Bangladesh warehouse. No customs, no waiting for imports.' } },
  });
}

export function preorderRoute(req, res) {
  renderListing(req, res, {
    heading: 'Pre-Order From China',
    subheading: 'Order today, estimated delivery 7-10 days. We source each item from our supplier in China after you order.',
    basePath: '/pre-order',
    trail: [{ name: 'Home', href: '/' }, { name: 'Pre-Order' }],
    extra: { notice: { kind: 'pre', text: 'Pre-order products are imported from China. Delivery normally takes 7-10 days depending on shipping and customs.' } },
  });
}

export function dealsRoute(req, res) {
  renderListing(req, res, {
    heading: 'Hot Deals',
    subheading: 'Limited-time discounts with real countdowns, set by deal end time in the admin panel.',
    basePath: '/deals',
    trail: [{ name: 'Home', href: '/' }, { name: 'Hot Deals' }],
    extra: { filters: { ...readFilters(new URL(req.url, 'http://x').searchParams), hotDeal: true } },
  });
}

export function categoryRoute(req, res, params) {
  const category = cat.getCategoryBySlug(params.slug);
  if (!category || !category.is_active) return notFound(req, res);

  renderListing(req, res, {
    heading: category.name,
    subheading: category.tagline || category.description,
    basePath: `/category/${category.slug}`,
    trail: [
      { name: 'Home', href: '/' },
      { name: 'All Products', href: '/products' },
      { name: category.name },
    ],
  });
}

export function searchRoute(req, res) {
  const ctx = buildContext(req);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 100);
  const sp = ctx.url.searchParams;

  // Suggest a similar term when nothing matches, so a typo is recoverable.
  let suggestion = null;
  if (q) {
    const probe = cat.searchProducts({ q, perPage: 1 });
    if (!probe.total) {
      const relaxed = cat.searchProducts({ q: q.slice(0, Math.max(3, q.length - 2)), perPage: 1 });
      if (relaxed.total) suggestion = q.slice(0, Math.max(3, q.length - 2));
    }
  }

  const filters = readFilters(sp);
  const result = cat.searchProducts({ ...filters, perPage: Number(ctx.settings['site.products_per_page']) || 24 });

  const heading = q ? `Search results for "${q}"` : 'Search products';
  const trail = [{ name: 'Home', href: '/' }, { name: 'Search' }];

  const body = listingPage({
    data: {
      heading,
      subheading: q ? `${result.total} matching product${result.total === 1 ? '' : 's'}` : 'Search by product name, keyword, category or product code.',
      trail,
      basePath: '/search',
      result,
      filters,
      categories: ctx.categories,
      priceBounds: cat.getPriceBounds(),
      showFilters: true,
      notice: suggestion
        ? { kind: 'info', text: `No exact match for "${q}". Showing results for "${suggestion}" instead.` }
        : null,
    },
    ctx,
  });

  sendHtml(
    res,
    200,
    layout({
      title: q ? `Search: ${q}` : 'Search Products',
      description: q ? `Find ${q} at AWAJ. Ready Stock and Pre-Order from China.` : ctx.settings['seo.default_description'],
      ctx,
      body,
      // Search result pages should not be indexed to avoid thin/duplicate pages.
      noindex: true,
      jsonLd: [breadcrumbSchema(trail)],
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/**
 * JSON search endpoint powering the header's live suggestions.
 * Returns a deliberately small payload (6 results, no specs or descriptions).
 */
export function searchApiRoute(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);

  if (q.length < 2) return sendJson(res, 200, { query: q, total: 0, results: [] });

  const result = cat.searchProducts({ q, perPage: 6, sort: 'relevance' });

  return sendJson(res, 200, {
    query: q,
    total: result.total,
    results: result.items.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      price: p.price,
      preorder: p.is_preorder,
      thumb: p.image ? `/uploads/${p.image}` : '/img/placeholder.svg',
    })),
  });
}

/* -------------------------------------------------------------------------- */
/* Product detail                                                              */
/* -------------------------------------------------------------------------- */

export function productRoute(req, res, params) {
  const ctx = buildContext(req);
  const product = cat.getProductBySlug(params.slug);
  if (!product) return notFound(req, res);

  const related = cat.getRelatedProducts(product, 8);
  const trail = [
    { name: 'Home', href: '/' },
    { name: 'All Products', href: '/products' },
    ...(product.category ? [{ name: product.category.name, href: `/category/${product.category.slug}` }] : []),
    { name: product.title },
  ];

  const description = plainText(
    product.subtitle
      ? `${product.subtitle}. ${product.is_preorder ? 'Pre-Order from China, 7-10 days delivery.' : 'Ready stock in Bangladesh, 1-3 days delivery.'} Order with Cash on Delivery.`
      : product.description,
    158
  );

  sendHtml(
    res,
    200,
    layout({
      title: `${product.title}${product.is_preorder ? ' (Pre-Order)' : ''}`,
      description,
      ctx,
      breadcrumb: '',
      body: productPage({ ctx, data: { product, related, trail, settings: ctx.settings } }),
      canonical: `${config.siteUrl}/product/${product.slug}`,
      jsonLd: [productSchema(product, ctx.settings), breadcrumbSchema(trail), ...(related.length ? [itemListSchema(related)] : [])],
    }),
    { 'Cache-Control': 'public, max-age=120' }
  );
}

/* -------------------------------------------------------------------------- */
/* Wishlist                                                                    */
/* -------------------------------------------------------------------------- */

export function wishlistRoute(req, res) {
  const ctx = buildContext(req);
  const ids = (ctx.url.searchParams.get('ids') || '')
    .split(',')
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 60);

  const products = ids.length ? cat.getProductsByIds(ids) : [];

  sendHtml(
    res,
    200,
    layout({
      title: 'Your Wishlist',
      description: 'Products you have saved for later.',
      ctx,
      body: wishlistPage({ data: { products }, ctx }),
      noindex: true,
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export function cartRoute(req, res) {
  const ctx = buildContext(req);
  const sp = ctx.url.searchParams;
  const district = DISTRICTS.includes(sp.get('district')) ? sp.get('district') : '';

  const priced = priceCart(ctx.cart.items, { district });
  writeCartCookie(res, ctx.cart.items);

  sendHtml(
    res,
    200,
    layout({
      title: 'Your Cart',
      description: 'Review the items in your AWAJ cart before checking out.',
      ctx,
      body: cartPage({ data: { priced, settings: ctx.settings, suggestions: cat.getTrending(8) }, ctx }),
      noindex: true,
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/** JSON cart operations used by the client script. */
export async function cartApiRoute(req, res) {
  if (req.method !== 'POST') return sendHtml(res, 405, 'Method Not Allowed');
  const ctx = buildContext(req);
  const district = DISTRICTS.includes(ctx.url.searchParams.get('district')) ? ctx.url.searchParams.get('district') : '';

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendHtml(res, 400, JSON.stringify({ error: 'Invalid request' }), { 'Content-Type': 'application/json' });
  }

  const action = body.action;
  let items = normalizeCart(ctx.cart.items);

  if (action === 'add') {
    const id = Number(body.id);
    const variantId = body.variantId ? Number(body.variantId) : null;
    const qty = Math.max(1, Math.min(20, Number(body.qty) || 1));

    const product = cat.getProductById(id);
    if (!product || !product.is_active) {
      return sendJson(res, 404, { error: 'That product is not available' });
    }

    // Refuse to add more than we can actually ship.
    if (!product.is_preorder && qty > product.stock_qty) {
      return sendJson(res, 409, {
        error: product.stock_qty === 0 ? 'This product just sold out' : `Only ${product.stock_qty} left in stock`,
        stock: product.stock_qty,
      });
    }

    const idx = items.findIndex((l) => l.id === id && (l.variantId || null) === (variantId || null));
    if (idx >= 0) {
      const next = items[idx].qty + qty;
      if (!product.is_preorder && next > product.stock_qty) {
        return sendJson(res, 409, { error: `Only ${product.stock_qty} left in stock`, stock: product.stock_qty });
      }
      items[idx].qty = Math.min(20, next);
    } else {
      items.push({ id, variantId, qty });
    }
  } else if (action === 'setQty') {
    const id = Number(body.id);
    const variantId = body.variantId ? Number(body.variantId) : null;
    const qty = Math.max(0, Math.min(20, Number(body.qty) || 0));
    const idx = items.findIndex((l) => l.id === id && (l.variantId || null) === (variantId || null));
    if (idx >= 0) {
      if (qty === 0) items.splice(idx, 1);
      else items[idx].qty = qty;
    }
  } else if (action === 'remove') {
    const id = Number(body.id);
    const variantId = body.variantId ? Number(body.variantId) : null;
    items = items.filter((l) => !(l.id === id && (l.variantId || null) === (variantId || null)));
  } else if (action === 'clear') {
    items = [];
  } else if (action === 'buy') {
    const id = Number(body.id);
    const variantId = body.variantId ? Number(body.variantId) : null;
    const product = cat.getProductById(id);
    if (!product || !product.is_active) {
      return sendJson(res, 404, { error: 'That product is not available' });
    }
    items = items.filter((l) => l.id !== id);
    items.unshift({ id, variantId, qty: Math.max(1, Math.min(20, Number(body.qty) || 1)) });
  } else {
    return sendJson(res, 400, { error: 'Unknown cart action' });
  }

  const priced = priceCart(items, { district });
  writeCartCookie(res, items);

  sendJson(res, 200, {
    ok: true,
    items,
    summary: { itemCount: priced.itemCount, subtotal: priced.subtotal },
    issues: priced.issues,
    hasPreorder: priced.hasPreorder,
    hasReadyStock: priced.hasReadyStock,
  });
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

export function checkoutRoute(req, res) {
  const ctx = buildContext(req);
  const sp = ctx.url.searchParams;

  // "Buy now" adds the product to the cart, so the summary shows only that item.
  if (sp.get('buy')) {
    const id = Number(sp.get('buy'));
    const qty = Math.max(1, Math.min(20, Number(sp.get('qty')) || 1));
    const items = normalizeCart(ctx.cart.items);
    const product = cat.getProductById(id);
    if (product && product.is_active) {
      const idx = items.findIndex((l) => l.id === id);
      if (idx >= 0) items[idx].qty = qty;
      else items.unshift({ id, qty });
      writeCartCookie(res, items);
    }
    return redirect(res, '/checkout', 303);
  }

  const priced = priceCart(ctx.cart.items, { district: '' });

  sendHtml(
    res,
    200,
    layout({
      title: 'Checkout',
      description: 'Complete your AWAJ order. Guest checkout, no account needed. Cash on Delivery available.',
      ctx,
      body: checkoutPage({ data: { priced, settings: ctx.settings }, ctx }),
      noindex: true,
    }),
    { 'Cache-Control': 'no-store' }
  );
}

export async function checkoutSubmitRoute(req, res) {
  const ctx = buildContext(req);
  const ip = clientIp(req);

  // Spam protection.
  //
  // Deliberately generous per IP: in Bangladesh a large share of mobile
  // traffic sits behind carrier-grade NAT, so a strict per-IP limit can block a
  // whole network segment of legitimate customers. The tighter, more meaningful
  // control is per phone number, applied below.
  const limit = rateLimit('order', hashKey(ip), 40, 60 * 60_000);
  if (!limit.ok) {
    return sendHtml(
      res,
      429,
      layout({
        title: 'Too many orders',
        ctx,
        noindex: true,
        body: checkoutPage({
          data: {
            priced: priceCart(ctx.cart.items, { district: '' }),
            settings: ctx.settings,
            stockError: `You have placed several orders already. Please wait ${Math.ceil(limit.retryAfterSec / 60)} minutes, or contact us on WhatsApp if this was a mistake.`,
          },
          ctx,
        }),
      }),
      { 'Cache-Control': 'no-store' }
    );
  }

  const form = parseFormBody(await readBody(req));

  const validation = orders.validateCheckout({ ...form, cart: ctx.cart.items });
  const priced = priceCart(ctx.cart.items, { district: validation.ok ? validation.value.district : form.district });

  if (!validation.ok) {
    return sendHtml(
      res,
      400,
      layout({
        title: 'Checkout - fix errors',
        ctx,
        noindex: true,
        body: checkoutPage({ data: { priced, settings: ctx.settings, values: form, errors: validation.errors }, ctx }),
      }),
      { 'Cache-Control': 'no-store' }
    );
  }

  // Honeypot: real customers never fill a hidden field.
  if (form.website) {
    return redirect(res, '/order-confirmed', 303);
  }

  // Per-phone limit: catches repeated submissions (accidental double taps or a
  // bot) without penalising unrelated customers behind the same IP.
  const phoneLimit = rateLimit('order_phone', hashKey(validation.value.phone), 6, 60 * 60_000);
  if (!phoneLimit.ok) {
    return sendHtml(
      res,
      429,
      layout({
        title: 'Too many orders',
        ctx,
        noindex: true,
        body: checkoutPage({
          data: {
            priced: priceCart(ctx.cart.items, { district: validation.value.district }),
            settings: ctx.settings,
            values: form,
            stockError: 'We already have several recent orders for this phone number. If you placed one by mistake, please call or WhatsApp us and we will check right away.',
          },
          ctx,
        }),
      }),
      { 'Cache-Control': 'no-store' }
    );
  }

  let result;
  try {
    result = orders.createOrder({
      value: validation.value,
      ip,
      userAgent: req.headers['user-agent'] || '',
    });
  } catch (err) {
    if (err.code === 'stock_changed') {
      return sendHtml(
        res,
        409,
        layout({
          title: 'Stock changed',
          ctx,
          noindex: true,
          body: checkoutPage({
            data: {
              priced: priceCart(ctx.cart.items, { district: validation.value.district }),
              settings: ctx.settings,
              values: form,
              stockError: `${err.message} Please review your cart and try again.`,
            },
            ctx,
          }),
        }),
        { 'Cache-Control': 'no-store' }
      );
    }
    throw err;
  }

  if (!result.ok) {
    return sendHtml(
      res,
      400,
      layout({
        title: 'Checkout - fix errors',
        ctx,
        noindex: true,
        body: checkoutPage({ data: { priced, settings: ctx.settings, values: form, errors: result.errors }, ctx }),
      }),
      { 'Cache-Control': 'no-store' }
    );
  }

  // Empty the cart, then show the confirmation.
  writeCartCookie(res, []);
  redirect(res, `/order-confirmed?code=${encodeURIComponent(result.order.order_code)}`, 303);
}

export function orderConfirmedRoute(req, res) {
  const ctx = buildContext(req);
  const code = (ctx.url.searchParams.get('code') || '').trim().toUpperCase();

  const order = orders.getOrderByCode(code);
  if (!order) {
    return sendHtml(
      res,
      404,
      layout({
        title: 'Order not found',
        ctx,
        noindex: true,
        body: notFoundPage({ ctx }),
      })
    );
  }

  const items = orders.getOrderItems(order.id);

  sendHtml(
    res,
    200,
    layout({
      title: `Order ${order.order_code} confirmed`,
      description: 'Your AWAJ order has been received.',
      ctx,
      noindex: true,
      body: orderConfirmationPage({ data: { order, items, settings: ctx.settings }, ctx }),
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/* -------------------------------------------------------------------------- */
/* Order tracking                                                              */
/* -------------------------------------------------------------------------- */

export function trackOrderRoute(req, res) {
  const ctx = buildContext(req);
  const code = (ctx.url.searchParams.get('code') || '').trim().toUpperCase();
  const phone = ctx.url.searchParams.get('phone') || '';

  let result = null;
  let error = '';
  if (code || phone) {
    const found = orders.trackOrderRateLimited(code, phone, clientIp(req));
    if (found.ok) result = found;
    else error = found.error;
  }

  sendHtml(
    res,
    200,
    layout({
      title: 'Track Your Order',
      description: 'Track your AWAJ order using your order ID and phone number.',
      ctx,
      body: trackOrderPage({ data: { result, code, phone, error }, ctx }),
      noindex: true,
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/* -------------------------------------------------------------------------- */
/* Image search                                                                */
/* -------------------------------------------------------------------------- */

export function imageSearchRoute(req, res) {
  const ctx = buildContext(req);
  sendHtml(
    res,
    200,
    layout({
      title: 'Search by Image',
      description: 'Upload a product photo and find similar items at AWAJ.',
      ctx,
      body: imageSearchPage({
        data: { result: null, provider: imageSearchProviderInfo(), query: '', error: '' },
        ctx,
      }),
      noindex: true,
    })
  );
}

export async function imageSearchSubmitRoute(req, res) {
  const ctx = buildContext(req);
  const ip = clientIp(req);

  const limit = rateLimit('imgsearch', hashKey(ip), 20, 60 * 60_000);
  if (!limit.ok) {
    return sendHtml(
      res,
      429,
      layout({
        title: 'Image search',
        ctx,
        noindex: true,
        body: imageSearchPage({
          data: { result: null, provider: imageSearchProviderInfo(), error: 'Too many image searches. Please try again later.' },
          ctx,
        }),
      })
    );
  }

  let fields = {};
  let files = [];
  try {
    ({ fields, files } = await readMultipart(req));
  } catch (err) {
    return sendHtml(
      res,
      400,
      layout({
        title: 'Image search',
        ctx,
        noindex: true,
        body: imageSearchPage({ data: { result: null, provider: imageSearchProviderInfo(), error: err.message }, ctx }),
      })
    );
  }

  const file = files.find((f) => f.name === 'image');
  if (!file) {
    return sendHtml(
      res,
      400,
      layout({
        title: 'Image search',
        ctx,
        noindex: true,
        body: imageSearchPage({ data: { result: null, provider: imageSearchProviderInfo(), error: 'Please choose an image first.' }, ctx }),
      })
    );
  }

  const stored = storeUpload(file, 'searches');
  if (!stored.ok) {
    return sendHtml(
      res,
      400,
      layout({
        title: 'Image search',
        ctx,
        noindex: true,
        body: imageSearchPage({ data: { result: null, provider: imageSearchProviderInfo(), error: stored.error }, ctx }),
      })
    );
  }

  // Derive a dominant colour for the offline provider (best effort).
  let colorHex = '#8a94a6';
  try {
    const info = await ensureDerivatives(stored.relPath);
    if (info.dominant) colorHex = info.dominant;
  } catch {
    /* keep the default */
  }

  const query = String(fields.q || '').trim().slice(0, 100);
  const result = await searchByImage({ imagePath: stored.relPath, colorHex, text: query });

  sendHtml(
    res,
    200,
    layout({
      title: 'Image search results',
      ctx,
      noindex: true,
      body: imageSearchPage({
        data: {
          result,
          provider: imageSearchProviderInfo(),
          query,
          uploadedImage: `/uploads/${stored.relPath}`,
          error: '',
        },
        ctx,
      }),
    }),
    { 'Cache-Control': 'no-store' }
  );
}

/* -------------------------------------------------------------------------- */
/* Content pages                                                               */
/* -------------------------------------------------------------------------- */

export function aboutRoute(req, res) {
  const ctx = buildContext(req);
  sendHtml(
    res,
    200,
    layout({
      title: 'About AWAJ',
      description: plainText(ctx.settings['store.description']),
      ctx,
      body: aboutPage({ ctx, data: { stats: ctx.stats } }),
      jsonLd: [organisationSchema(ctx.settings)],
    }),
    { 'Cache-Control': 'public, max-age=600' }
  );
}

export function contactRoute(req, res) {
  const ctx = buildContext(req);
  sendHtml(
    res,
    200,
    layout({
      title: 'Contact Us',
      description: `Contact AWAJ on WhatsApp${ctx.settings['contact.support_phone'] ? `, ${ctx.settings['contact.support_phone']}` : ''}. We reply within minutes.`,
      ctx,
      body: contactPage({ ctx, data: {} }),
    }),
    { 'Cache-Control': 'public, max-age=600' }
  );
}

const POLICY_KEYS = {
  'shipping-policy': 'Shipping Policy',
  'return-policy': 'Return & Refund Policy',
  'privacy-policy': 'Privacy Policy',
  terms: 'Terms & Conditions',
};

export function policyRoute(req, res, params) {
  if (!POLICY_KEYS[params.policy]) return notFound(req, res);
  const ctx = buildContext(req);
  sendHtml(
    res,
    200,
    layout({
      title: POLICY_KEYS[params.policy],
      description: plainText(ctx.settings[`content.${params.policy === 'terms' ? 'terms' : params.policy.replace('-', '_').replace('return_policy', 'return_policy')}`] || ''),
      ctx,
      body: policyPage({ ctx, data: { policy: params.policy } }),
    }),
    { 'Cache-Control': 'public, max-age=600' }
  );
}

export function notFound(req, res) {
  const ctx = buildContext(req);
  sendHtml(
    res,
    404,
    layout({ title: 'Page not found', ctx, noindex: true, body: notFoundPage({ ctx }) }),
    { 'Cache-Control': 'no-store' }
  );
}

/* -------------------------------------------------------------------------- */
/* Form body helper                                                            */
/* -------------------------------------------------------------------------- */

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(parseFormBody(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', () => resolve({}));
  });
}

/** Parse an application/x-www-form-urlencoded body into a plain object. */
export function parseFormBody(body) {
  const params = new URLSearchParams(body);
  const out = {};
  for (const [k, v] of params) {
    // Checkboxes that share a name collapse to the last value; for our forms
    // that is fine because only one is ever checked.
    out[k] = v;
  }
  return out;
}

const sendJson = (res, status, data) =>
  sendHtml(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
