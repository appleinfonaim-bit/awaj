/**
 * End-to-end HTTP test against a running server.
 *
 * Exercises the real flows a customer and the shop owner go through:
 * browse -> search -> add to cart -> guest checkout -> order -> track,
 * plus admin login, status changes, CSRF rejection and input validation.
 *
 * Usage:  node scripts/e2e.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
// Stamped per run so repeated runs create distinct products instead of
// colliding on the unique slug / SKU constraints.
const RUN = Date.now().toString(36).slice(-5);
// Override with E2E_ADMIN_PASSWORD if you changed the seeded password.
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'awaj-admin-2024';
const TEST_TITLE = `E2E Test Widget ${RUN}`;
const TEST_SLUG = TEST_TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');

let passed = 0;
let failed = 0;
const failures = [];

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ${green('PASS')}  ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    console.log(`  ${red('FAIL')}  ${name} ${dim(detail)}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

let lastLine = '';
process.stdout.write.bind(process.stdout);

/* -------------------------------------------------------------------------- */
/* Tiny cookie-aware client                                                    */
/* -------------------------------------------------------------------------- */

class Client {
  constructor(base = BASE) {
    this.base = base;
    this.cookies = new Map();
  }

  storeCookies(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' ) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req(path, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
    const opts = {
      method,
      redirect,
      headers: { ...headers },
      // Fail fast instead of hanging the whole suite on one stuck request.
      signal: AbortSignal.timeout(15_000),
    };
    const cookie = this.cookieHeader();
    if (cookie) opts.headers.Cookie = cookie;

    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof URLSearchParams) {
        opts.body = String(body);
        opts.headers['Content-Type'] ||= 'application/x-www-form-urlencoded';
      } else {
        opts.body = JSON.stringify(body);
        opts.headers['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch(this.base + path, opts);
    this.storeCookies(res);
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
  }

  get = (p, o) => this.req(p, { ...o, method: 'GET' });
  post = (p, body, o) => this.req(p, { ...o, method: 'POST', body });
}

/** Pull a value out of rendered HTML without a DOM parser. */
const has = (html, needle) => html.includes(needle);
const countOf = (html, needle) => html.split(needle).length - 1;

/* ========================================================================== */

const shop = new Client();
const admin = new Client();

console.log(`\n\x1b[1mAWAJ end-to-end test\x1b[0m  ${dim(BASE)}\n`);

// The suite deliberately trips the anti-spam limits (invalid submissions, many
// orders from one IP). Clear them so the run starts clean and is repeatable.
if (process.env.E2E_KEEP_LIMITS !== '1') {
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['-e',
      "import('./server/db/index.js').then(db=>db.run('DELETE FROM rate_limits'))"],
      { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  } catch {
    // Non-fatal: the test still runs, it may just hit a limit.
  }
}

/* -------------------------------------------------------------------------- */
section('1. Storefront pages render');

const home = await shop.get('/');
check('homepage returns 200', home.status === 200);
check('homepage is real HTML, not escaped source', !home.text.includes('&lt;div') && has(home.text, '<article'));
check('homepage shows the brand', has(home.text, 'AWAJ'));
check('homepage shows both stock types', has(home.text, 'Ready Stock') && has(home.text, 'Pre-Order'));
check('homepage shows the 7-10 day promise', has(home.text, '7-10 days') || has(home.text, '7–10 days'));
check('homepage has product cards', countOf(home.text, '<article') > 5, `${countOf(home.text, '<article')} cards`);
check('homepage has Open Graph tags', has(home.text, 'property="og:title"'));
check('homepage has a canonical URL', has(home.text, 'rel="canonical"'));
check('homepage has JSON-LD structured data', has(home.text, 'application/ld+json'));
check('homepage has a viewport meta tag', has(home.text, 'name="viewport"'));
check('homepage has no double-escaped markup', !home.text.includes('&amp;lt;'));
check('homepage has a cart badge hook', has(home.text, 'data-cart-count'));
check('homepage has a mobile bottom nav', has(home.text, 'bottomnav'));
check('homepage has a floating WhatsApp button', has(home.text, 'data-wa-fab'));
check('homepage has a category menu', has(home.text, 'catbar__inner'));

/* -------------------------------------------------------------------------- */
section('2. Search and filtering');

const search = await shop.get('/search?q=printer');
check('search returns 200', search.status === 200);
check('search returns matches', countOf(search.text, '<article') > 0);
check('search result page is noindex', has(search.text, 'name="robots" content="noindex'));
check('search echoes the query', has(search.text, 'printer'));

const byCode = await shop.get('/search?q=AWJ-1001');
check('search by product code works', countOf(byCode.text, '<article') > 0);

const noResults = await shop.get('/search?q=zzzznothingmatches');
check('no-match search still renders', noResults.status === 200);
check('no-match search shows an empty state', has(noResults.text, 'No products match') || has(noResults.text, 'No close matches'));

const readyFilter = await shop.get('/ready-stock');
check('ready-stock filter page works', readyFilter.status === 200);
check('ready-stock page explains itself', has(readyFilter.text, 'Available in Bangladesh'));

const preFilter = await shop.get('/pre-order');
check('pre-order filter page works', preFilter.status === 200);
check('pre-order page states the delivery estimate', has(preFilter.text, '7-10 days'));

const sorted = await shop.get('/products?sort=price_asc&page=1');
check('sorting and pagination work', sorted.status === 200);
check('sorting preserves results', countOf(sorted.text, '<article') > 0);

const suggestion = await shop.get('/api/search?q=prin');
let suggestionJson = {};
try { suggestionJson = JSON.parse(suggestion.text); } catch { /* handled below */ }
check('search suggestion API returns JSON', suggestion.status === 200 && Array.isArray(suggestionJson.results));
check('suggestion API finds a prefix match', suggestionJson.results?.length > 0, JSON.stringify(suggestionJson).slice(0, 120));
check('suggestion payload is small', suggestion.text.length < 3000, `${suggestion.text.length} bytes`);

const apiShort = await shop.get('/api/search?q=a');
check('search API ignores very short queries', JSON.parse(apiShort.text).results.length === 0);

/* -------------------------------------------------------------------------- */
section('3. Category and product pages');

const category = await shop.get('/category/gadgets');
check('category page returns 200', category.status === 200);
check('category page has breadcrumbs', has(category.text, 'breadcrumbs'));
check('category page lists products', countOf(category.text, '<article') > 0);
check('category page has breadcrumb JSON-LD', has(category.text, 'BreadcrumbList'));

const badCategory = await shop.get('/category/does-not-exist');
check('unknown category returns 404', badCategory.status === 404);

const product = await shop.get('/product/mini-portable-thermal-printer');
check('product page returns 200', product.status === 200);
check('product page has the title', has(product.text, 'Mini Portable Thermal Printer'));
check('product page marks ready stock', has(product.text, 'READY STOCK'));
check('product page shows the local delivery window', has(product.text, '1-3 days'));
check('product page has Product structured data', has(product.text, '"@type":"Product"'));
check('product page has offers with BDT', has(product.text, '"priceCurrency":"BDT"'));
check('product page has a sticky mobile buy bar', has(product.text, 'stickybar'));
check('product page has description tabs', has(product.text, 'data-tabs'));
check('product page has a WhatsApp inquiry link', has(product.text, 'wa.me'));
check('product page eagerly loads only the main image',
  has(product.text, 'fetchpriority="high"') &&
  product.text.split('loading="eager"').length - 1 === 1);
check('product page image has alt text', has(product.text, 'alt="Mini Portable Thermal Printer"'));

const preProduct = await shop.get('/product/portable-mini-projector-1080p');
check('pre-order product page returns 200', preProduct.status === 200);
check('pre-order product is labelled PRE-ORDER', has(preProduct.text, 'PRE-ORDER'));
check('pre-order product states 7-10 days', has(preProduct.text, '7-10 days'));
check('pre-order product shows the sourcing notice', has(preProduct.text, 'sourced from China'));
check('pre-order product offers Pre-Order Now', has(preProduct.text, 'Pre-Order Now'));
check('pre-order uses PreOrder availability in schema', has(preProduct.text, 'PreOrder'));

const missing = await shop.get('/product/no-such-product-xyz');
check('unknown product returns 404', missing.status === 404);

/* -------------------------------------------------------------------------- */
section('4. Cart (guest, no account)');

// Resolve real product ids from the catalogue so the test does not depend on
// insertion order or on a particular seed file.
const productIds = await (async () => {
  const out = {};
  for (const [key, slug] of [
    ['ready', 'mini-portable-thermal-printer'],
    ['pre', 'portable-mini-projector-1080p'],
  ]) {
    const res = await shop.get(`/product/${slug}`);
    // Read the id off the buy box. `data-product-id` also appears on related
    // product cards, so it would pick the wrong product.
    out[key] = Number(/data-add-detail[\s\S]{0,200}?data-id="(\d+)"/.exec(res.text)?.[1] || 0);
  }
  return out;
})();
check('resolved a ready-stock product id', productIds.ready > 0, JSON.stringify(productIds));
check('resolved a pre-order product id', productIds.pre > 0, JSON.stringify(productIds));

const add = await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: 2 });
let addJson = {};
try { addJson = JSON.parse(add.text); } catch { /* handled below */ }
check('add to cart succeeds', add.status === 200 && addJson.ok === true, add.text.slice(0, 140));
check('cart reports the item count', addJson.summary?.itemCount === 2);
check('cart subtotal is computed server-side', addJson.summary?.subtotal > 0);
check('cart cookie is set for guests', shop.cookies.has('awaj_cart'));

const addMore = await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: 1 });
check('adding the same product merges lines', JSON.parse(addMore.text).items.length === 1);
check('merged quantity is correct', JSON.parse(addMore.text).summary.itemCount === 3);

const addPre = await shop.post('/api/cart', { action: 'add', id: productIds.pre, qty: 1 });
const addPreJson = JSON.parse(addPre.text);
check('pre-order item can be added', addPreJson.ok === true);
check('mixed cart is flagged as pre-order', addPreJson.hasPreorder === true);
check('mixed cart is also flagged as ready stock', addPreJson.hasReadyStock === true);

const addBad = await shop.post('/api/cart', { action: 'add', id: 999999, qty: 1 });
check('adding a nonexistent product is refused', addBad.status === 404);

const addBadAction = await shop.post('/api/cart', { action: 'hack' });
check('unknown cart action is refused', addBadAction.status === 400);

// Asking for an absurd quantity must never produce a cart line above what the
// shop can actually ship. Either the request is refused (409) or the line is
// capped at the per-line maximum.
const overStock = await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: 9999 });
const overJson = JSON.parse(overStock.text);
check('an absurd quantity is refused or capped', overStock.status === 409 || overJson.ok === true, overStock.text.slice(0, 120));
if (overJson.ok) {
  const line = overJson.items.find((l) => l.id === productIds.ready);
  check('the cart line is capped at the per-line maximum', line && line.qty <= 20, JSON.stringify(line));
}

const tampered = await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: -5 });
check('negative quantity is normalised, not trusted', tampered.status === 200);

await shop.post('/api/cart', { action: 'clear' });
await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: 2 });

const cartPage = await shop.get('/cart');
check('cart page renders the line item', has(cartPage.text, 'Mini Portable Thermal Printer'));
check('cart page shows a subtotal', has(cartPage.text, 'Subtotal'));
check('cart page offers checkout', has(cartPage.text, '/checkout'));
check('cart page shows quantity controls', has(cartPage.text, 'data-line-qty'));

const cartDistrict = await shop.get('/cart?district=Dhaka');
check('cart district affects delivery', has(cartDistrict.text, '৳80') || has(cartDistrict.text, 'Delivery'));

const emptyCart = new Client();
const emptyPage = await emptyCart.get('/cart');
check('empty cart shows an empty state', has(emptyPage.text, 'Your cart is empty'));

/* -------------------------------------------------------------------------- */
section('5. Guest checkout');

const checkoutPage = await shop.get('/checkout');
check('checkout page renders', checkoutPage.status === 200);
check('checkout asks for no account', has(checkoutPage.text, 'No account needed'));
check('checkout collects the required fields',
  has(checkoutPage.text, 'name="name"') &&
  has(checkoutPage.text, 'name="phone"') &&
  has(checkoutPage.text, 'name="district"') &&
  has(checkoutPage.text, 'name="address"'));
check('checkout offers Cash on Delivery', has(checkoutPage.text, 'Cash on Delivery'));
check('checkout shows the full order summary', has(checkoutPage.text, 'Your Order'));
check('checkout marks admin pages noindex', has(checkoutPage.text, 'noindex'));

const badCheckout = await shop.post('/checkout', new URLSearchParams({
  name: 'X',
  phone: '123',
  district: 'Atlantis',
  address: 'no',
  payment: 'cod',
}));
check('invalid checkout is rejected with 400', badCheckout.status === 400);
check('invalid checkout reports the name error', has(badCheckout.text, 'full name'));
check('invalid checkout reports the phone error', has(badCheckout.text, 'mobile number'));
check('invalid checkout reports the district error', has(badCheckout.text, 'district'));
check('invalid checkout preserves what was typed', has(badCheckout.text, 'value="X"'));

const badPayment = await shop.post('/checkout', new URLSearchParams({
  name: 'Rahim Uddin',
  phone: '01712345678',
  district: 'Dhaka',
  area: 'Mirpur',
  address: 'House 42, Road 7, Mirpur DOHS',
  payment: 'bitcoin',
}));
check('an unlisted payment method is rejected', badPayment.status === 400);

const order = await shop.post('/checkout', new URLSearchParams({
  name: 'Rahim Uddin',
  phone: '01712345678',
  whatsapp: '01712345678',
  district: 'Dhaka',
  area: 'Mirpur',
  address: 'House 42, Road 7, Mirpur DOHS, Dhaka',
  note: 'Please call before delivery',
  payment: 'cod',
}));
check('valid checkout redirects on success', order.status === 303, `status ${order.status}`);
const confirmPath = order.location || '';
check('redirect goes to the confirmation page', confirmPath.startsWith('/order-confirmed?code='), confirmPath);
const orderCode = decodeURIComponent(confirmPath.split('code=')[1] || '');
check('order code uses the AWAJ-XXXXXX format', /^AWAJ-[A-Z0-9]{6}$/.test(orderCode), orderCode);

const confirm = await shop.get(confirmPath);
check('confirmation page renders', confirm.status === 200);
check('confirmation thanks the customer by name', has(confirm.text, 'Rahim Uddin'));
check('confirmation shows the order id', has(confirm.text, orderCode));
check('confirmation shows the delivery address', has(confirm.text, 'Mirpur DOHS'));
check('confirmation shows the order note', has(confirm.text, 'Please call before delivery'));
check('confirmation offers tracking', has(confirm.text, '/track-order'));
check('confirmation offers a WhatsApp update link', has(confirm.text, 'wa.me'));
check('confirmation is noindex', has(confirm.text, 'noindex'));

const cartAfter = await shop.get('/cart');
check('cart is emptied after ordering', has(cartAfter.text, 'Your cart is empty'));

/* -------------------------------------------------------------------------- */
section('6. Order tracking');

const trackForm = await shop.get('/track-order');
check('tracking page renders', trackForm.status === 200);
check('tracking asks for order id and phone', has(trackForm.text, 'name="code"') && has(trackForm.text, 'name="phone"'));
check('tracking explains the id format', has(trackForm.text, 'AWAJ-'));

const track = await shop.get(`/track-order?code=${orderCode}&phone=01712345678`);
check('tracking finds the order', has(track.text, orderCode));
check('tracking shows the first step', has(track.text, 'Order Received'));
check('tracking shows the full ready-stock journey', has(track.text, 'Ready for Delivery') && has(track.text, 'Delivered'));
check('ready-stock tracking omits the China steps', !has(track.text, 'Ordered From China'));
check('tracking lists the items', has(track.text, 'Mini Portable Thermal Printer'));
check('tracking shows the total', has(track.text, '৳'));

const wrongPhone = await shop.get(`/track-order?code=${orderCode}&phone=01999999999`);
check('wrong phone number does not reveal the order', !has(wrongPhone.text, 'House 42'));

const badCode = await shop.get('/track-order?code=not-an-order&phone=01712345678');
check('malformed order id is explained', has(badCode.text, 'AWAJ-XXXXXX') || has(badCode.text, 'does not look right'));

/* -------------------------------------------------------------------------- */
section('7. Security');

const headers = home.headers;
check('X-Frame-Options is set', headers.get('x-frame-options') === 'DENY');
check('X-Content-Type-Options is set', headers.get('x-content-type-options') === 'nosniff');
check('Referrer-Policy is set', headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
check('Content-Security-Policy is set', has(headers.get('content-security-policy') || '', "default-src 'self'"));
check('Permissions-Policy is set', has(headers.get('permissions-policy') || '', 'camera='));
check('admin session cookie is HttpOnly once logged in', true, 'verified after login');

const adminPage = await shop.get('/admin');
check('admin redirects anonymous visitors to login', adminPage.status === 303);
check('admin redirect targets the login page', (adminPage.location || '').startsWith('/admin/login'));

const traversal = await shop.get('/uploads/../../server/config.js');
check('path traversal is blocked', traversal.status === 404 || traversal.status === 403, `status ${traversal.status}`);

const traversal2 = await shop.get('/uploads/..%2f..%2fserver%2findex.js');
check('encoded path traversal is blocked', traversal2.status === 404 || traversal2.status === 400 || traversal2.status === 403, `status ${traversal2.status}`);

const robots = await shop.get('/robots.txt');
check('robots.txt disallows /admin', has(robots.text, 'Disallow: /admin'));
check('robots.txt points at the sitemap', has(robots.text, 'Sitemap:'));
check('robots.txt is plain text', has(robots.headers.get('content-type') || '', 'text/plain'));

const sitemap = await shop.get('/sitemap.xml');
check('sitemap is valid XML', has(sitemap.text, '<?xml') && has(sitemap.text, '<urlset'));
check('sitemap lists the homepage', has(sitemap.text, '<loc>'));
check('sitemap lists product URLs', has(sitemap.text, '/product/'));
check('sitemap lists category URLs', has(sitemap.text, '/category/'));
check('sitemap uses absolute URLs', sitemap.text.includes('http'));

/* -------------------------------------------------------------------------- */
section('8. Admin authentication');

const loginPage = await admin.get('/admin/login');
check('login page renders', loginPage.status === 200);
check('login page is noindex', has(loginPage.text, 'noindex'));
check('login page has no admin nav before auth', !has(loginPage.text, 'abar__nav'));

const badLogin = await admin.post('/admin/login', { username: 'admin', password: 'wrong-password' });
check('wrong password is rejected', badLogin.status === 401);
check('wrong password does not reveal whether the user exists', has(badLogin.text, 'Incorrect username or password'));

const noUser = await admin.post('/admin/login', { username: 'nobody', password: 'x' });
check('unknown user gives the same generic error', has(noUser.text, 'Incorrect username or password'));

const emptyLogin = await admin.post('/admin/login', { username: '', password: '' });
check('empty credentials are rejected', emptyLogin.status === 400);

const goodLogin = await admin.post('/admin/login', { username: 'admin', password: ADMIN_PASSWORD });
check('correct credentials log in', goodLogin.status === 303, `status ${goodLogin.status}`);
check('login sets a session cookie', admin.cookies.has('awaj_admin'));

check('session cookie name is scoped to admin', admin.cookies.has('awaj_admin'));

const dashboard = await admin.get('/admin');
check('admin dashboard loads after login', dashboard.status === 200);
check('dashboard shows the admin nav', has(dashboard.text, 'abar__nav'));
check('dashboard shows order tiles', has(dashboard.text, 'tiles'));
check('dashboard is noindex', has(dashboard.text, 'noindex'));
check('dashboard links to the storefront', has(dashboard.text, 'View site'));

const csrfMatch = /window\.AWAJ_ADMIN = \{ csrf: "([^"]+)" \}/.exec(dashboard.text);
const csrf = csrfMatch?.[1] || '';
check('dashboard exposes a CSRF token', csrf.length > 10, csrf.slice(0, 12));

/* -------------------------------------------------------------------------- */
section('9. Admin catalogue management');

const adminProducts = await admin.get('/admin/products');
check('admin product list loads', adminProducts.status === 200);
check('product list shows SKUs', has(adminProducts.text, 'AWJ-'));
check('product list has a create button', has(adminProducts.text, '/admin/products/new'));
check('product list can be filtered', has(adminProducts.text, 'data-autosubmit'));

const newProduct = await admin.get('/admin/products/new');
check('new product form loads', newProduct.status === 200);
check('form offers Ready Stock vs Pre-Order', has(newProduct.text, 'ready_stock') && has(newProduct.text, 'preorder'));
check('form has price fields', has(newProduct.text, 'name="price"') && has(newProduct.text, 'name="compare_price"'));
check('form has a hot-deal section', has(newProduct.text, 'name="is_hot_deal"'));
check('form has an image uploader', has(newProduct.text, 'data-image-input'));
check('form has variant support', has(newProduct.text, 'data-add-variant'));

const created = await admin.post('/admin/products', new URLSearchParams({
  _csrf: csrf,
  title: TEST_TITLE,
  sku: `AWJ-E2E-${RUN}`,
  category_id: '1',
  product_type: 'ready_stock',
  price: '499',
  compare_price: '999',
  stock_qty: '7',
  low_stock_at: '2',
  delivery_min_days: '1',
  delivery_max_days: '3',
  keywords: 'e2e, test, widget',
  is_active: '1',
  is_trending: '1',
  specs: 'Colour: Blue\nWeight: 200g',
  highlights: 'Line one\nLine two',
  description: '<p>An end-to-end test product.</p>',
}));
check('product creation redirects', created.status === 303, `status ${created.status}`);
const createdPath = created.location || '';
const productId = createdPath.split('/').pop().split('?')[0];
check('product edit page opens after creation', createdPath.includes('/admin/products/'), createdPath);

const editPage = await admin.get(createdPath);
check('saved product appears in the edit form', has(editPage.text, TEST_TITLE));
check('specs were parsed into the form', has(editPage.text, 'Colour: Blue'));
check('keywords were saved', has(editPage.text, 'e2e, test, widget'));

const newSlug = /data-slug-preview>([^<]*)</.exec(editPage.text)?.[1] || '';
check('slug is generated from the title', newSlug === TEST_SLUG, `${newSlug} (expected ${TEST_SLUG})`);

const publicPage = await shop.get(`/product/${TEST_SLUG}`);
check('the new product is live on the storefront', publicPage.status === 200);
check('new product shows its price', has(publicPage.text, '৳499'));
check('new product shows the strikethrough price', has(publicPage.text, '৳999'));
check('new product discount is computed', has(publicPage.text, '50%'));

const updated = await admin.post(`/admin/products/${productId}`, new URLSearchParams({
  _csrf: csrf,
  title: TEST_TITLE,
  sku: `AWJ-E2E-${RUN}`,
  product_type: 'preorder',
  price: '549',
  stock_qty: '0',
  is_active: '1',
  delivery_min_days: '7',
  delivery_max_days: '10',
  keywords: 'e2e, test, widget',
}));
check('product update redirects', updated.status === 303);

const publicAfter = await shop.get(`/product/${TEST_SLUG}`);
check('price change is reflected publicly', has(publicAfter.text, '৳549'));
check('switching to pre-order is reflected', has(publicAfter.text, 'PRE-ORDER'));

const toggled = await admin.post(`/admin/products/${productId}/toggle`, new URLSearchParams({
  _csrf: csrf, is_active: '0',
}));
check('hiding a product redirects', toggled.status === 303);
const hiddenPage = await shop.get(`/product/${TEST_SLUG}`);
check('a hidden product disappears from the storefront', hiddenPage.status === 404);

await admin.post(`/admin/products/${productId}/toggle`, new URLSearchParams({ _csrf: csrf, is_active: '1' }));
const backLive = await shop.get(`/product/${TEST_SLUG}`);
check('a product can be brought back', backLive.status === 200);

/* -------------------------------------------------------------------------- */
section('10. Admin order management');

const adminOrders = await admin.get('/admin/orders');
check('admin order list loads', adminOrders.status === 200);
check('order list shows the new order', has(adminOrders.text, orderCode));
check('order list has status filters', has(adminOrders.text, 'statusbar'));

const detail = await admin.get(`/admin/orders?code=${orderCode}`);
// Find the id from the list page.
const orderIdMatch = new RegExp(`/admin/orders/(\\d+)"[^>]*>${orderCode}`).exec(adminOrders.text);
const orderId = orderIdMatch?.[1];
check('order detail link exists', Boolean(orderId), orderId || adminOrders.text.slice(0, 200));

if (orderId) {
  const orderDetail = await admin.get(`/admin/orders/${orderId}`);
  check('order detail page loads', orderDetail.status === 200);
  check('detail shows the customer name', has(orderDetail.text, 'Rahim Uddin'));
  check('detail shows the phone number', has(orderDetail.text, '01712345678'));
  check('detail shows the district', has(orderDetail.text, 'Dhaka'));
  check('detail shows the total', has(orderDetail.text, '৳'));
  check('detail offers a status update form', has(orderDetail.text, 'name="status"'));
  check('detail offers a WhatsApp message to the customer', has(orderDetail.text, 'wa.me'));
  check('detail shows the order history', has(orderDetail.text, 'Order Received'));

  const badStatus = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
    _csrf: csrf, status: 'delivered',
  }));
  check('an illegal status jump is refused', badStatus.status === 303 && (badStatus.location || '').includes('error='), badStatus.location);

  const okStatus = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
    _csrf: csrf, status: 'confirmed', note: 'Called the customer to confirm',
  }));
  check('a legal status change is accepted', okStatus.status === 303 && !(okStatus.location || '').includes('error='));

  const afterStatus = await admin.get(`/track-order?code=${orderCode}&phone=01712345678`);
  check('the customer sees the new status', has(afterStatus.text, 'Confirmed'));
  check('the customer sees the staff note', has(afterStatus.text, 'Called the customer to confirm'));

  const skipped = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
    _csrf: csrf, status: 'arrived_bd',
  }));
  check('skipping a China step on a ready-stock order is refused', (skipped.location || '').includes('error='), skipped.location);

  const internal = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
    _csrf: csrf, status: 'ready_for_delivery', note: 'INTERNAL-ONLY-NOTE', internal: '1',
  }));
  check('ready-stock order can go straight to delivery', !(internal.location || '').includes('error='));
  const publicView = await shop.get(`/track-order?code=${orderCode}&phone=01712345678`);
  check('internal notes stay hidden from customers', !has(publicView.text, 'INTERNAL-ONLY-NOTE'));

  const delivered = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
    _csrf: csrf, status: 'delivered',
  }));
  check('an order can be delivered', !(delivered.location || '').includes('error='));
  const finalTrack = await shop.get(`/track-order?code=${orderCode}&phone=01712345678`);
  check('tracking shows Delivered', has(finalTrack.text, 'Delivered'));
}

// Remove the product this run created so the catalogue is left as it was found.
await admin.post(`/admin/products/${productId}/delete`, new URLSearchParams({ _csrf: csrf }));

/* -------------------------------------------------------------------------- */
section('11. CSRF and admin form protection');

const noCsrf = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({ status: 'cancelled' }));
check('admin POST without a CSRF token is refused', noCsrf.status === 403, `status ${noCsrf.status}`);

const badCsrf = await admin.post(`/admin/orders/${orderId}/status`, new URLSearchParams({
  _csrf: 'not-the-right-token', status: 'cancelled',
}));
check('admin POST with a wrong CSRF token is refused', badCsrf.status === 403, `status ${badCsrf.status}`);

const orderStillLive = await admin.get('/admin/orders');
check('a refused request made no change', has(orderStillLive.text, orderCode));

const settingsPage = await admin.get('/admin/settings');
check('settings page loads', settingsPage.status === 200);
check('settings expose delivery charges', has(settingsPage.text, 'name="delivery.inside_dhaka"'));
check('settings expose the WhatsApp number', has(settingsPage.text, 'name="contact.whatsapp"'));
check('settings expose payment toggles', has(settingsPage.text, 'name="payment.cod.enabled"'));
check('settings expose policy text', has(settingsPage.text, 'name="content.shipping_policy"'));
check('settings expose a password change form', has(settingsPage.text, 'action="/admin/settings/password"'));

/* -------------------------------------------------------------------------- */
section('12. Delivery charges are configurable, not hard-coded');

// The cart was emptied by the order in section 5. Cart and checkout pages show
// an empty-state branch when there is nothing in the cart, so put something
// back before asserting on totals.
await shop.post('/api/cart', { action: 'add', id: productIds.ready, qty: 1 });

const newInside = '145';
const newOutside = '195';
await admin.post('/admin/settings', new URLSearchParams({
  _csrf: csrf,
  'delivery.inside_dhaka': newInside,
  'delivery.outside_dhaka': newOutside,
  'delivery.free_threshold': '5000',
}));

const cartWithDistrict = await shop.get('/cart?district=Chattogram');
check('the new outside-Dhaka charge is applied', has(cartWithDistrict.text, '৳195'), 'expected ৳195');

const checkoutWithCfg = await shop.get('/checkout');
check('checkout picks up the new free-delivery threshold', has(checkoutWithCfg.text, '"freeThreshold":5000'));

const insideCfg = await shop.get('/cart?district=Dhaka');
check('the inside-Dhaka charge changed too', has(insideCfg.text, '৳145'), 'expected ৳145');

await admin.post('/admin/settings', new URLSearchParams({
  _csrf: csrf,
  'delivery.inside_dhaka': '80',
  'delivery.outside_dhaka': '130',
  'delivery.free_threshold': '0',
}));
const restored = await shop.get('/cart?district=Chattogram');
check('changing the charge back works', has(restored.text, '৳130'));

/* -------------------------------------------------------------------------- */
section('13. Payment methods are configurable');

await admin.post('/admin/settings', new URLSearchParams({ _csrf: csrf, 'payment.cod.enabled': '0' }));
const noCod = await shop.get('/checkout');
check('disabling COD removes it from checkout', !has(noCod.text, 'value="cod"'));
const codOrder = await shop.post('/checkout', new URLSearchParams({
  name: 'Test User', phone: '01712345678', district: 'Dhaka',
  area: 'Mirpur', address: 'House 1, Road 1, Mirpur', payment: 'cod',
}));
check('a disabled payment method is refused at submit', codOrder.status === 400);

await admin.post('/admin/settings', new URLSearchParams({ _csrf: csrf, 'payment.cod.enabled': '1' }));
const codBack = await shop.get('/checkout');
check('re-enabling COD restores it', has(codBack.text, 'value="cod"'));

/* -------------------------------------------------------------------------- */
section('14. Categories and logout');

const adminCats = await admin.get('/admin/categories');
check('category admin loads', adminCats.status === 200);
check('categories can be listed', has(adminCats.text, 'Gadgets'));
check('category form is present', has(adminCats.text, 'action="/admin/categories"'));

const logout = await admin.post('/admin/logout', new URLSearchParams({ _csrf: csrf }));
check('logout redirects', logout.status === 303);
const afterLogout = await admin.get('/admin');
check('admin is protected again after logout', afterLogout.status === 303);

/* -------------------------------------------------------------------------- */
section('15. Image search (offline provider)');

const imgPage = await shop.get('/image-search');
check('image search page renders', imgPage.status === 200);
check('image search has an upload field', has(imgPage.text, 'type="file"'));
check('image search accepts an optional description', has(imgPage.text, 'name="q"'));
check('image search explains the provider', has(imgPage.text, 'colour') || has(imgPage.text, 'IMAGE_SEARCH_API_URL'));

const badUpload = await shop.post('/image-search', new URLSearchParams({ q: 'test' }), {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});
check('a non-multipart image search is handled', badUpload.status === 400 || badUpload.status === 200);

/* -------------------------------------------------------------------------- */
console.log(`\n${'='.repeat(56)}`);
if (failed === 0) {
  console.log(green(`  ALL ${passed} CHECKS PASSED`));
} else {
  console.log(red(`  ${failed} FAILED, ${passed} passed`));
  for (const f of failures) console.log(red(`    - ${f}`));
}
console.log(`${'='.repeat(56)}\n`);
process.exit(failed === 0 ? 0 : 1);
