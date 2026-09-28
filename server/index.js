/**
 * AWAJ server entry point.
 *
 * Wires the router, static file serving, security headers, admin auth and the
 * SEO endpoints (sitemap, robots, manifest) onto a single node:http server.
 */
import { createServer } from 'node:http';
import { stat } from  'node:fs/promises';
import { createReadStream } from  'node:fs';
import { join, normalize, extname } from 'node:path';

import { config, BUILD_ID } from  './config.js';
import { paths, prune, all, rateLimit } from './db/index.js';
import { hashKey } from './lib/security.js';
import { ensureDefaults, invalidateSettingsCache, storefront } from './lib/settings.js';
import { Router, send, sendHtml, sendJson, redirect, readJson, mimeFor, clientIp, negotiateEncoding, encoders, readForm, withRepeats } from  './lib/http.js';
import { getSession, checkCsrf } from  './lib/security.js';
import { shop, admin } from './routes/index.js';
import { getCategories } from './lib/catalogue.js';
import { esc } from './lib/utils.js';

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

const router = new Router();

/* ---- Storefront ---- */
router.get('/', shop.homeRoute);
router.get('/products', shop.productsRoute);
router.get('/category/:slug', shop.categoryRoute);
router.get('/search', shop.searchRoute);
router.get('/api/search', shop.searchApiRoute);
router.get('/ready-stock', shop.readyStockRoute);
router.get('/pre-order', shop.preorderRoute);
router.get('/deals', shop.dealsRoute);
router.get('/product/:slug', shop.productRoute);
router.get('/wishlist', shop.wishlistRoute);
router.get('/cart', shop.cartRoute);
router.post('/api/cart', shop.cartApiRoute);
router.get('/checkout', shop.checkoutRoute);
router.post('/checkout', shop.checkoutSubmitRoute);
router.get('/order-confirmed', shop.orderConfirmedRoute);
router.get('/track-order', shop.trackOrderRoute);
router.get('/image-search', shop.imageSearchRoute);
router.post('/image-search', shop.imageSearchSubmitRoute);
router.get('/about', shop.aboutRoute);
router.get('/contact', shop.contactRoute);
router.get('/p/:policy', shop.policyRoute);

/* ---- Admin ---- */
router.get('/admin/login', admin.loginRoute);
router.post('/admin/login', admin.loginSubmitRoute);
router.post('/admin/logout', admin.logoutRoute);

const A = '/admin';
router.get(A, admin.dashboardRoute);
router.get(`${A}/products`, admin.productsRoute);
router.get(`${A}/products/new`, admin.productNewRoute);
router.post(`${A}/products`, admin.productSaveRoute);
router.get(`${A}/products/:id`, admin.productEditRoute);
router.post(`${A}/products/:id`, admin.productUpdateRoute);
router.post(`${A}/products/:id/toggle`, admin.productToggleRoute);
router.post(`${A}/products/:id/delete`, admin.productDeleteRoute);
router.post(`${A}/api/image`, admin.imageActionRoute);
router.get(`${A}/orders`, admin.ordersRoute);
router.get(`${A}/orders/:id`, admin.orderDetailRoute);
router.post(`${A}/orders/:id/status`, admin.orderStatusRoute);
router.post(`${A}/orders/:id/payment`, admin.orderPaymentRoute);
router.get(`${A}/categories`, admin.categoriesRoute);
router.post(`${A}/categories`, admin.categoryCreateRoute);
router.post(`${A}/categories/:id`, admin.categoryUpdateRoute);
router.post(`${A}/categories/:id/delete`, admin.categoryDeleteRoute);
router.get(`${A}/settings`, admin.settingsRoute);
router.post(`${A}/settings`, admin.settingsSaveRoute);
router.post(`${A}/settings/password`, admin.passwordRoute);

/* ---- SEO + assets ---- */
router.get('/robots.txt', robotsRoute);
router.get('/sitemap.xml', sitemapRoute);
router.get('/site.webmanifest', manifestRoute);

/* -------------------------------------------------------------------------- */
/* Security headers + middleware                                               */
/* -------------------------------------------------------------------------- */

const CSP = [
  "default-src 'self'",
  // Inline styles are used for the dynamic rating fill and hero art; inline
  // scripts are limited to tiny JSON bootstrap blocks.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/* -------------------------------------------------------------------------- */
/* Request handler                                                             */
/* -------------------------------------------------------------------------- */

const PUBLIC_FILE_PREFIXES = ['/css/', '/js/', '/img/', '/uploads/'];

async function handle(req, res) {
  applySecurityHeaders(res);

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
  const isHead = req.method.toUpperCase() === 'HEAD';

  /* ---- Static assets ---- */
  if ((req.method === 'GET' || isHead) && isStaticPath(pathname)) {
    return serveStatic(req, res, pathname, { headOnly: isHead });
  }

  // HEAD must behave like GET, minus the body. Rewrite the method once, here,
  // so every route below is HEAD-capable without any special-casing.
  if (isHead) {
    req.method = 'GET';
    res.write = () => true;
    const originalEnd = res.end.bind(res);
    res.end = () => originalEnd();
  }

  const method = req.method.toUpperCase();

  /* ---- Admin auth gate ---- */
  if (pathname === '/admin/login') {
    if (method === 'POST') return admin.loginSubmitRoute(req, res);
    return admin.loginRoute(req, res);
  }

  if (pathname === '/admin/logout' && method === 'POST') {
    const session = getSession(req);
    if (session) {
      let fields = {};
      try {
        ({ fields } = await readForm(req, 64 * 1024));
      } catch {
        return redirect(res, '/admin/login', 303);
      }
      if (checkCsrf(session, fields._csrf || req.headers['x-csrf-token'])) {
        return admin.logoutRoute(req, res);
      }
    }
    return redirect(res, '/admin/login', 303);
  }

  if (pathname.startsWith('/admin')) {
    const session = getSession(req);
    if (!session) {
      const next = encodeURIComponent(pathname + url.search);
      return redirect(res, `/admin/login?next=${next}`, 303);
    }

    // CSRF on every state-changing admin request. The body is read exactly
    // once here and handed to the route, because a stream can only be consumed
    // a single time and the product form is multipart.
    if (method !== 'GET' && method !== 'HEAD') {
      const token = req.headers['x-csrf-token'];

      if (pathname === '/admin/api/image') {
        const body = await readJson(req);
        if (!checkCsrf(session, body._csrf || token)) {
          return sendJson(res, 403, { error: 'Invalid CSRF token. Reload the page and try again.' });
        }
        return admin.imageActionRoute(req, res, { session, json: body, url });
      }

      let fields = {};
      let files = [];
      try {
        ({ fields, files } = await readForm(req, 24 * 1024 * 1024));
      } catch (err) {
        return sendHtml(res, err.statusCode || 400, csrfErrorPage(session.admin, err.message));
      }

      if (!checkCsrf(session, fields._csrf || token)) {
        return sendHtml(res, 403, csrfErrorPage(session.admin));
      }

      const form = withRepeats(fields);
      const ctx = { session, form, files, url, req };
      return routeAdmin(method, pathname, req, res, ctx);
    }

    const ctx = { session, url, req, form: {} };
    return routeAdmin(method, pathname, req, res, ctx);
  }

  /* ---- Storefront ---- */
  const matched = router.match(method, pathname);
  if (matched && matched !== 'method-mismatch') {
    req.params = matched.params;
    // Light per-IP throttling on order/checkout endpoints.
    if (['/checkout', '/api/cart', '/image-search'].includes(pathname) && method === 'POST') {
      const limit = rateLimit('post', hashKey(clientIp(req)), 120, 60_000);
      if (!limit.ok) {
        return send(res, 429, 'Too many requests. Please slow down.', { 'Content-Type': 'text/plain; charset=utf-8' });
      }
    }
    return matched.handler(req, res, matched.params);
  }

  if (matched === 'method-mismatch') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, POST' });
  }

  /* ---- Fallbacks ---- */
  if (pathname === '/favicon.ico') return redirect(res, '/img/favicon.svg', 301);
  if (pathname === '/healthz') return sendJson(res, 200, { ok: true, build: BUILD_ID });

  return shop.notFound(req, res);
}

async function routeAdmin(method, pathname, req, res, ctx) {
  const map = {
    'GET /admin': admin.dashboardRoute,
    'GET /admin/products': admin.productsRoute,
    'GET /admin/products/new': admin.productNewRoute,
    'POST /admin/products': admin.productSaveRoute,
    'GET /admin/products/:id': admin.productEditRoute,
    'POST /admin/products/:id': admin.productUpdateRoute,
    'POST /admin/products/:id/toggle': admin.productToggleRoute,
    'POST /admin/products/:id/delete': admin.productDeleteRoute,
    'GET /admin/orders': admin.ordersRoute,
    'GET /admin/orders/:id': admin.orderDetailRoute,
    'POST /admin/orders/:id/status': admin.orderStatusRoute,
    'POST /admin/orders/:id/payment': admin.orderPaymentRoute,
    'GET /admin/categories': admin.categoriesRoute,
    'POST /admin/categories': admin.categoryCreateRoute,
    'POST /admin/categories/:id': admin.categoryUpdateRoute,
    'POST /admin/categories/:id/delete': admin.categoryDeleteRoute,
    'GET /admin/settings': admin.settingsRoute,
    'POST /admin/settings': admin.settingsSaveRoute,
    'POST /admin/settings/password': admin.passwordRoute,
  };

  // Match by pattern so :id segments resolve to params.
  const key = Object.keys(map).find((k) => {
    const [m, pattern] = k.split(' ');
    if (m !== method) return false;
    const rx = new RegExp(`^${pattern.replace(/:(\w+)/g, '([^/]+)')}$`);
    const m2 = rx.exec(pathname);
    if (!m2) return false;
    ctx.params = {};
    let i = 1;
    for (const name of pattern.match(/:(\w+)/g) || []) {
      ctx.params[name.slice(1)] = decodeURIComponent(m2[i]);
      i += 1;
    }
    return true;
  });

  if (!key) return shop.notFound(req, res);
  req.params = ctx.params;
  return map[key](req, res, ctx);
}

function csrfErrorPage(user, reason) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Session expired | AWAJ Admin</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/app.css"></head>
<body style="display:grid;place-items:center;min-height:100vh;background:#f6f7fb;margin:0;padding:24px">
<div style="max-width:420px;background:#fff;border:1px solid #e2e6ef;border-radius:14px;padding:28px;text-align:center">
<h1 style="font-size:18px;margin:0 0 8px">Your session expired</h1>
<p style="color:#64748b;font-size:14px;margin:0 0 20px">For your security the form was rejected. Please sign in again and retry.</p>
${reason ? `<p style="color:#b45309;font-size:12px;margin:-12px 0 20px">${esc(reason)}</p>` : ''}
<a class="btn btn--primary" style="display:inline-flex" href="/admin/login">Back to sign in</a>
</div></body></html>`;
}

/* -------------------------------------------------------------------------- */
/* Static files                                                                */
/* -------------------------------------------------------------------------- */

const STATIC_ROOTS = {
  '/css/': join(paths.public, 'css'),
  '/js/': join(paths.public, 'js'),
  '/img/': join(paths.public, 'img'),
  '/uploads/': paths.uploads,
};

function isStaticPath(pathname) {
  return PUBLIC_FILE_PREFIXES.some((p) => pathname.startsWith(p));
}

const STATIC_TYPES = new Set([
  '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.woff2', '.json', '.webmanifest',
]);

async function serveStatic(req, res, pathname, { headOnly = false } = {}) {
  const prefix = PUBLIC_FILE_PREFIXES.find((p) => pathname.startsWith(p));
  const root = STATIC_ROOTS[prefix];
  const rel = normalize(pathname.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');

  const ext = extname(rel).toLowerCase();
  if (!STATIC_TYPES.has(ext)) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });

  const file = join(root, rel);
  // Path traversal guard: the resolved file must stay under the allowed root.
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });

  try {
    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });

    const isUpload = prefix === '/uploads/';
    const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }

    // Uploaded product images change when the catalogue is edited, so they get
    // a short cache. Code assets are fingerprinted by BUILD_ID in the query.
    const cacheControl = isUpload
      ? 'public, max-age=604800, stale-while-revalidate=86400'
      : 'public, max-age=3600';

    const type = mimeFor(ext);
    const headers = {
      'Content-Type': type,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': new Date(info.mtimeMs).toUTCString(),
    };

    // Text assets (CSS/JS/SVG) are worth compressing; images already are.
    const compressible = /^(text\/|application\/|image\/svg)/.test(type) && info.size > 1024;
    const encoding = compressible ? negotiateEncoding(req) : '';

    if (!encoding) {
      res.writeHead(200, { ...headers, 'Content-Length': info.size });
      if (headOnly) return res.end();
      return createReadStream(file).pipe(res);
    }

    res.writeHead(200, {
      ...headers,
      'Content-Encoding': encoding,
      Vary: 'Accept-Encoding',
    });
    if (headOnly) return res.end();
    const stream = createReadStream(file).pipe(encoders[encoding]());
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (err) {
    console.error(`[static] ${pathname}:`, err.message);
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

/* -------------------------------------------------------------------------- */
/* SEO endpoints                                                               */
/* -------------------------------------------------------------------------- */

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/ready-stock', changefreq: 'daily', priority: '0.9' },
  { path: '/pre-order', changefreq: 'daily', priority: '0.9' },
  { path: '/deals', changefreq: 'daily', priority: '0.7' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/track-order', changefreq: 'monthly', priority: '0.4' },
  { path: '/p/shipping-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/p/return-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/p/privacy-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/p/terms', changefreq: 'yearly', priority: '0.3' },
];

function robotsRoute(req, res) {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /order-confirmed',
    'Disallow: /api/',
    'Disallow: /image-search',
    'Disallow: /*?q=',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');

  send(res, 200, body, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  });
}

function sitemapRoute(req, res) {
  const base = config.siteUrl;
  const urls = [...STATIC_ROUTES];

  for (const c of getCategories()) {
    urls.push({ path: `/category/${c.slug}`, changefreq: 'weekly', priority: '0.8' });
  }

  // Product URLs come straight from the catalogue so the sitemap can never
  // drift out of date with reality.
  const products = all(
    'SELECT slug, updated_at FROM products WHERE is_active = 1 ORDER BY updated_at DESC'
  );
  for (const p of products) {
    urls.push({
      path: `/product/${p.slug}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: (p.updated_at || '').slice(0, 10) || undefined,
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${esc(base + u.path)}</loc>${u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  send(res, 200, body, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
}

function manifestRoute(req, res) {
  sendJson(res, 200, {
    name: 'AWAJ - China Trends, Delivered to Bangladesh',
    short_name: 'AWAJ',
    description: 'Ready Stock and China Pre-Order products for Bangladesh.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    icons: [
      { src: '/img/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/img/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

ensureDefaults();
prune();
invalidateSettingsCache();
setInterval(prune, 3600_000).unref();

const server = createServer((req, res) => {
  // Expose the request to send() so it can negotiate Content-Encoding.
  res.req = req;
  handle(req, res).catch((err) => {
    const status = err?.statusCode || 500;
    if (status >= 500) console.error(`[error] ${req.method} ${req.url}`, err);

    if (res.headersSent) return res.end();
    if (pathnameIsApi(req.url)) {
      sendJson(res, status, { error: status >= 500 ? 'Something went wrong' : err.message });
    } else {
      sendHtml(res, status, internalErrorPage(status, err));
    }
  });
});

const pathnameIsApi = (url = '') =>
  url.startsWith('/api/') || url.startsWith('/admin/api/') || url.includes('image-search') || url.startsWith('/admin');

function internalErrorPage(status, err) {
  const detail = config.isProd ? '' : `<pre style="text-align:left;font-size:12px;overflow:auto;background:#f8fafc;padding:12px;border-radius:8px">${esc(err?.stack || err?.message || '')}</pre>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${status} | AWAJ</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/app.css"></head>
<body style="display:grid;place-items:center;min-height:100vh;background:#f6f7fb;margin:0;padding:24px">
<div style="max-width:520px;background:#fff;border:1px solid #e2e6ef;border-radius:14px;padding:28px;text-align:center">
<h1 style="font-size:18px;margin:0 0 8px">Something went wrong</h1>
<p style="color:#64748b;font-size:14px;margin:0 0 20px">We hit an unexpected problem loading this page. Please try again.</p>
<a class="btn btn--primary" style="display:inline-flex" href="/">Back to home</a>
${detail}
</div></body></html>`;
}

server.listen(config.port, config.host, () => {
  const bar = '─'.repeat(46);
  console.log(`\n  ${storefront()['store.name']} is running\n  ${bar}`);
  console.log(`  Storefront   http://localhost:${config.port}`);
  console.log(`  Admin        http://localhost:${config.port}/admin`);
  console.log(`  Database     ${config.databaseFile}`);
  console.log(`  Environment  ${config.isProd ? 'production' : 'development'}`);
  console.log(`  ${bar}\n`);
});

const shutdown = (signal) => {
  console.log(`\n  ${signal} received, shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
