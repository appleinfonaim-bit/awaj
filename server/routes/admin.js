/**
 * Admin routes.
 *
 * Every handler is wrapped by the auth + CSRF checks in the router setup, so
 * these functions can assume `ctx.session` exists and that the request has
 * already been verified for CSRF on state-changing verbs.
 */
import { html, raw, slugify } from  '../lib/utils.js';
import { config } from '../config.js';
import { run, get, all, tx, pluck } from '../db/index.js';
import { sendHtml, redirect, readJson } from '../lib/http.js';
import { getSession, destroySession, createSession, attachSessionCookie, verifyPassword, hashPassword, validatePasswordStrength, isLoginLockedOut, recordLoginFailure, clearLoginFailures } from  '../lib/security.js';
import { getAllSettings, setManySettings, invalidateSettingsCache } from  '../lib/settings.js';
import * as cat from '../lib/catalogue.js';
import * as orders from '../lib/orders.js';
import { storeUpload, ensureDerivatives, sweepOrphanDerivatives, hexToRgb } from '../lib/images.js';
import { isOptimisationAvailable } from '../lib/images.js';

import { adminLayout, adminLoginPage, adminDashboardPage, adminProductsPage, adminProductFormPage, adminOrdersPage, adminOrderDetailPage, adminCategoriesPage, adminSettingsPage } from '../views/pages/admin.js';

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export function loginRoute(req, res) {
  const session = getSession(req);
  if (session) return redirect(res, '/admin', 303);
  sendHtml(res, 200, adminLoginPage({ next: new URL(req.url, 'http://x').searchParams.get('next') || '/admin' }));
}

export async function loginSubmitRoute(req, res) {
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const next = String(body.next || '/admin');
  const fail = (msg, status = 401) =>
    sendHtml(res, status, adminLoginPage({ error: msg, username, next }), { 'Cache-Control': 'no-store' });

  if (!username || !password) return fail('Enter both your username and password', 400);

  const lock = isLoginLockedOut(username);
  if (lock.locked) {
    return fail(
      `Too many failed attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minute(s).`,
      429
    );
  }

  const user = get('SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username]);
  // Same message whether the user is missing or the password is wrong, so the
  // form cannot be used to enumerate usernames. This must be a closure, not a
  // call: invoking it here would send the 401 before the password was checked.
  const invalid = () => fail('Incorrect username or password');

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(username);
    return invalid();
  }

  clearLoginFailures(username);
  const session = createSession(user.id, req.socket?.remoteAddress);
  attachSessionCookie(res, session);
  // New session id on login prevents session fixation.
  redirect(res, next.startsWith('/admin') ? next : '/admin', 303);
}

export function logoutRoute(req, res) {
  destroySession(req, res);
  redirect(res, '/admin/login', 303);
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export async function dashboardRoute(req, res, ctx) {
  const stats = orders.orderStats();
  const counts = {
    products: Number(pluck('SELECT COUNT(*) FROM products') || 0),
    active: Number(pluck('SELECT COUNT(*) FROM products WHERE is_active = 1') || 0),
    inactive: Number(pluck('SELECT COUNT(*) FROM products WHERE is_active = 0') || 0),
    categories: Number(pluck('SELECT COUNT(*) FROM categories') || 0),
    deals: Number(
      pluck("SELECT COUNT(*) FROM products WHERE is_hot_deal = 1 AND (deal_ends_at IS NULL OR deal_ends_at > datetime('now'))") || 0
    ),
  };

  const body = adminDashboardPage({
    data: {
      stats,
      counts,
      recentOrders: orders.listOrders({ perPage: 8 }).items,
      lowStock: all(
        `SELECT id, title, stock_qty, product_type FROM products
         WHERE is_active = 1 AND product_type = 'ready_stock' AND stock_qty <= low_stock_at
         ORDER BY stock_qty ASC, title LIMIT 8`
      ),
      topProducts: all(
        'SELECT id, title, sold_count FROM products ORDER BY sold_count DESC LIMIT 8'
      ),
    },
    csrf: ctx.session.csrf,
    user: ctx.session.admin,
  });

  sendHtml(res, 200, adminLayout({ title: 'Dashboard', ctx, body, active: '/admin', csrf: ctx.session.csrf, user: ctx.session.admin }));
}

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

const SORT_MAP = {
  newest: 'p.created_at DESC',
  title: 'p.title ASC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  sold: 'p.sold_count DESC',
  stock: 'p.stock_qty ASC',
};

export function productsRoute(req, res, ctx) {
  const sp = new URL(req.url, 'http://x').searchParams;
  const q = (sp.get('q') || '').trim();
  const type = sp.get('type') || '';
  const category = sp.get('category') || '';
  const filter = sp.get('filter') || '';
  const sort = SORT_MAP[sp.get('sort')] ? sp.get('sort') : 'newest';
  const page = Number(sp.get('page')) || 1;
  const perPage = 25;

  const where = [];
  const params = [];

  if (q) {
    where.push('(p.title LIKE ? OR p.sku LIKE ? OR p.keywords LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (type === 'ready_stock' || type === 'preorder') {
    where.push('p.product_type = ?');
    params.push(type);
  }
  if (category) {
    where.push('p.category_id = ?');
    params.push(Number(category));
  }
  if (filter === 'active') where.push('p.is_active = 1');
  if (filter === 'inactive') where.push('p.is_active = 0');
  if (filter === 'featured') where.push('p.is_featured = 1');
  if (filter === 'trending') where.push('p.is_trending = 1');
  if (filter === 'deal') where.push('p.is_hot_deal = 1');
  if (filter === 'lowstock') where.push("p.product_type = 'ready_stock' AND p.stock_qty <= p.low_stock_at");
  if (filter === 'noimage') where.push('NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(pluck(`SELECT COUNT(*) FROM products p ${whereSql}`, params) || 0);

  const rows = all(
    `SELECT p.*, c.name AS category_name,
            (SELECT path FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS primary_image
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY ${SORT_MAP[sort]}
     LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage]
  ).map(cat.shapeProduct);

  const body = adminProductsPage({
    data: {
      result: { items: rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) },
      categories: cat.getCategories(false),
      filters: { q, type, category, filter, sort },
    },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    200,
    adminLayout({
      title: 'Products',
      ctx,
      body,
      active: '/admin/products',
      csrf: ctx.session.csrf,
      user: ctx.session.admin,
      wide: true,
    })
  );
}

export async function productNewRoute(req, res, ctx) {
  const body = adminProductFormPage({
    data: {
      product: {
        product_type: 'ready_stock',
        is_active: 1,
        stock_qty: 0,
        low_stock_at: 3,
        delivery_min_days: 1,
        delivery_max_days: 3,
        specs: {},
        highlights: [],
        keywords: [],
      },
      categories: cat.getCategories(false),
      images: [],
      variants: [],
      optimiserAvailable: await isOptimisationAvailable(),
    },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    200,
    adminLayout({ title: 'Add product', ctx, body, active: '/admin/products', csrf: ctx.session.csrf, user: ctx.session.admin })
  );
}

export async function productEditRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const product = cat.getProductById(id);
  if (!product) return adminNotFound(res, ctx);

  const images = all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [id]);
  const variants = all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id', [id]);

  const body = adminProductFormPage({
    data: { product, images, variants, categories: cat.getCategories(false), optimiserAvailable: await isOptimisationAvailable() },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    200,
    adminLayout({
      title: `Edit ${product.title}`,
      ctx,
      body,
      active: '/admin/products',
      csrf: ctx.session.csrf,
      user: ctx.session.admin,
    })
  );
}

/** Shared validation + persistence for the product form. */
async function saveProduct(req, res, ctx) {
  const id = req.params.id ? Number(req.params.id) : null;
  const existing = id ? cat.getProductById(id) : null;
  if (id && !existing) return adminNotFound(res, ctx);

  // The body was already parsed by the request handler (the form is multipart so
  // it can carry image uploads), so just take the fields and files from context.
  const fields = ctx.form || {};
  const files = ctx.files || [];

  const title = String(fields.title || '').trim();
  if (!title) {
    return adminFormError(res, ctx, { error: 'Product title is required', product: existing, values: fields });
  }
  if (title.length > 160) {
    return adminFormError(res, ctx, { error: 'Title is too long (160 characters max)', product: existing, values: fields });
  }

  const price = Number(fields.price);
  if (!Number.isFinite(price) || price < 0) {
    return adminFormError(res, ctx, { error: 'Enter a valid selling price', product: existing, values: fields });
  }

  const productType = fields.product_type === 'preorder' ? 'preorder' : 'ready_stock';
  const comparePrice = fields.compare_price ? Number(fields.compare_price) : null;
  if (comparePrice !== null && (!Number.isFinite(comparePrice) || comparePrice < 0)) {
    return adminFormError(res, ctx, { error: 'Original price must be a number', product: existing, values: fields });
  }

  // SKU is assigned once and then locked, so existing orders stay traceable.
  let sku = existing?.sku;
  if (!sku) {
    const base = (String(fields.sku || '').trim() || `AWJ-${1000 + Number(pluck('SELECT COUNT(*) FROM products') || 0) + 1}`);
    let candidate = base;
    let n = 1;
    while (get('SELECT 1 FROM products WHERE sku = ? AND id != ?', [candidate, id ?? -1])) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    sku = candidate;
  }

  // Slug stays stable once created so existing links keep working.
  const slug = existing?.slug || uniqueSlug(title, (s) => get('SELECT 1 FROM products WHERE slug = ?', [s]));

  const specs = parseKeyValues(fields.specs);
  const highlights = String(fields.highlights || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const keywords = String(fields.keywords || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 40);

  const deliveryMin = clampInt(fields.delivery_min_days, 0, 60, productType === 'preorder' ? 7 : 1);
  const deliveryMax = Math.max(deliveryMin, clampInt(fields.delivery_max_days, 0, 90, productType === 'preorder' ? 10 : 3));

  const dealEnds = fields.deal_ends_at ? new Date(fields.deal_ends_at).toISOString() : null;

  const payload = {
    title,
    slug,
    sku,
    subtitle: String(fields.subtitle || '').trim().slice(0, 200) || null,
    description: String(fields.description || '').trim() || null,
    specs: JSON.stringify(specs),
    highlights: JSON.stringify(highlights),
    keywords: JSON.stringify(keywords),
    category_id: fields.category_id ? Number(fields.category_id) : null,
    product_type: productType,
    price: Math.round(price),
    compare_price: comparePrice !== null ? Math.round(comparePrice) : null,
    cost_price: fields.cost_price ? Math.round(Number(fields.cost_price)) : null,
    stock_qty: Math.max(0, Number(fields.stock_qty) || 0),
    low_stock_at: Math.max(0, Number(fields.low_stock_at) || 0),
    delivery_min_days: deliveryMin,
    delivery_max_days: deliveryMax,
    is_active: fields.is_active ? 1 : 0,
    is_featured: fields.is_featured ? 1 : 0,
    is_trending: fields.is_trending ? 1 : 0,
    is_new: fields.is_new ? 1 : 0,
    is_hot_deal: fields.is_hot_deal ? 1 : 0,
    deal_stock_limit: fields.deal_stock_limit ? Math.max(0, Number(fields.deal_stock_limit)) : null,
    deal_ends_at: dealEnds,
    supplier_ref: String(fields.supplier_ref || '').trim() || null,
  };

  let productId = id;
  const imageFiles = files.filter((f) => f.name === 'images' && f.data?.length);

  tx(() => {
    if (id) {
      // `slug` and `sku` are intentionally absent from the UPDATE: a product's
      // URL and code must stay stable so existing links and invoices keep
      // working. SQLite rejects named parameters that the statement does not
      // use, so they are stripped here rather than in the payload.
      const { slug: _slug, sku: _sku, ...updatable } = payload;
      run(
        `UPDATE products SET
          title = :title, subtitle = :subtitle, description = :description,
          specs = :specs, highlights = :highlights, keywords = :keywords,
          category_id = :category_id, product_type = :product_type,
          price = :price, compare_price = :compare_price, cost_price = :cost_price,
          stock_qty = :stock_qty, low_stock_at = :low_stock_at,
          delivery_min_days = :delivery_min_days, delivery_max_days = :delivery_max_days,
          is_active = :is_active, is_featured = :is_featured, is_trending = :is_trending,
          is_new = :is_new, is_hot_deal = :is_hot_deal,
          deal_stock_limit = :deal_stock_limit, deal_ends_at = :deal_ends_at,
          supplier_ref = :supplier_ref, updated_at = datetime('now')
         WHERE id = :id`,
        { ...updatable, id }
      );
    } else {
      const info = run(
        `INSERT INTO products
          (title, slug, sku, subtitle, description, specs, highlights, keywords, category_id,
           product_type, price, compare_price, cost_price, stock_qty, low_stock_at,
           delivery_min_days, delivery_max_days, is_active, is_featured, is_trending, is_new,
           is_hot_deal, deal_stock_limit, deal_ends_at, supplier_ref)
         VALUES (:title, :slug, :sku, :subtitle, :description, :specs, :highlights, :keywords,
                 :category_id, :product_type, :price, :compare_price, :cost_price, :stock_qty,
                 :low_stock_at, :delivery_min_days, :delivery_max_days, :is_active, :is_featured,
                 :is_trending, :is_new, :is_hot_deal, :deal_stock_limit, :deal_ends_at, :supplier_ref)`,
        payload
      );
      productId = Number(info.lastInsertRowid);
    }

    saveVariants(productId, fields);
    saveAltText(productId, fields.alt_text || title);
  });

  // Image handling happens outside the transaction because it touches the disk.
  if (imageFiles.length) {
    await attachImages(productId, imageFiles, title);
  }

  redirect(res, `/admin/products/${productId}?saved=1`, 303);
}

const parseKeyValues = (text) => {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key.slice(0, 60)] = value.slice(0, 200);
  }
  return out;
};

/**
 * Variants are submitted as parallel arrays. Rebuild them wholesale, which is
 * simpler and safer than diffing, and only touch rows belonging to this product.
 */
function saveVariants(productId, fields) {
  const ids = toArray(fields.variant_id);
  const names = toArray(fields.variant_name);
  const values = toArray(fields.variant_value);
  const deltas = toArray(fields.variant_delta);
  const stocks = toArray(fields.variant_stock);

  run('DELETE FROM product_variants WHERE product_id = ?', [productId]);

  const rows = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = String(values[i] || '').trim();
    const name = String(names[i] || '').trim() || 'Option';
    if (!value) continue;
    rows.push([
      productId,
      name.slice(0, 40),
      value.slice(0, 60),
      Math.round(Number(deltas[i]) || 0),
      Math.max(0, Number(stocks[i]) || 0),
      i,
    ]);
  }
  for (const row of rows) {
    run(
      `INSERT INTO product_variants (product_id, name, value, price_delta, stock_qty, sort_order)
       VALUES (?,?,?,?,?,?)`,
      row
    );
  }
}

/**
 * The product form submits repeated field names (one set per variant row), but
 * `parseFormBody` collapses duplicates to the last value. The admin router
 * therefore preserves the raw pairs and `toArray` restores them here.
 */
const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function attachImages(productId, files, title) {
  const current = Number(pluck('SELECT COUNT(*) FROM product_images WHERE product_id = ?', [productId]) || 0);
  const room = config.maxImagesPerProduct - current;
  if (room <= 0) return;

  for (const file of files.slice(0, room)) {
    const stored = storeUpload(file, `products/${productId}`);
    if (!stored.ok) continue;

    let width = 1200;
    let height = 1200;
    let dominant = null;
    try {
      const info = await ensureDerivatives(stored.relPath);
      width = info.width;
      height = info.height;
      dominant = info.dominant;
    } catch {
      /* keep defaults */
    }

    const sort = current + run(
      'INSERT INTO product_images (product_id, path, width, height, alt, sort_order) VALUES (?,?,?,?,?,?)',
      [productId, stored.relPath, width, height, title, 0]
    ).changes;

    if (dominant) {
      const rgb = hexToRgb(dominant);
      if (rgb && current === 0) {
        run('UPDATE products SET color_hex = ?, color_r = ?, color_g = ?, color_b = ? WHERE id = ?', [
          dominant, rgb.r, rgb.g, rgb.b, productId,
        ]);
      }
    }
  }
}

async function saveAltText(productId, alt) {
  run('UPDATE product_images SET alt = ? WHERE product_id = ? AND (alt IS NULL OR alt = ?)', [
    alt.slice(0, 160), productId, '',
  ]);
}

export async function productSaveRoute(req, res, ctx) {
  return saveProduct(req, res, ctx);
}

export async function productUpdateRoute(req, res, ctx) {
  return saveProduct(req, res, ctx);
}

export function productToggleRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const body = ctx.form || {};
  const isActive = body.is_active === '1' || body.is_active === 1 ? 1 : 0;
  run('UPDATE products SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [isActive, id]);
  redirect(res, req.headers.referer || '/admin/products', 303);
}

export function productDeleteRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const product = cat.getProductById(id);
  if (!product) return adminNotFound(res, ctx);

  tx(() => {
    // order_items.product_id is ON DELETE SET NULL, so order history survives.
    run('DELETE FROM products WHERE id = ?', [id]);
  });
  sweepOrphanDerivatives();
  redirect(res, '/admin/products?deleted=1', 303);
}

/* Image reordering / deletion, driven by fetch() from the admin UI. */
export async function imageActionRoute(req, res, ctx) {
  const payload = ctx.json || {};
  const imageId = Number(payload.imageId);
  const action = String(payload.action || '');

  const image = get('SELECT * FROM product_images WHERE id = ?', [imageId]);
  if (!image) return sendJson(res, 404, { error: 'Image not found' });

  if (action === 'delete') {
    run('DELETE FROM product_images WHERE id = ?', [imageId]);
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'main') {
    tx(() => {
      run('UPDATE product_images SET sort_order = 1 WHERE product_id = ?', [image.product_id]);
      run('UPDATE product_images SET sort_order = 0 WHERE id = ?', [imageId]);
    });
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'move') {
    const dir = payload.dir === 'up' ? -1 : 1;
    const siblings = all('SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [image.product_id]);
    const idx = siblings.findIndex((s) => s.id === imageId);
    const swapWith = siblings[idx + dir];
    if (!swapWith) return sendJson(res, 200, { ok: true, unchanged: true });

    const a = get('SELECT sort_order FROM product_images WHERE id = ?', [imageId]);
    const b = get('SELECT sort_order FROM product_images WHERE id = ?', [swapWith.id]);
    // Use a temporary value to avoid a unique-constraint style collision.
    run('UPDATE product_images SET sort_order = -1 WHERE id = ?', [imageId]);
    run('UPDATE product_images SET sort_order = ? WHERE id = ?', [a.sort_order, swapWith.id]);
    run('UPDATE product_images SET sort_order = ? WHERE id = ?', [b.sort_order, imageId]);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 400, { error: 'Unknown image action' });
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export function ordersRoute(req, res, ctx) {
  const sp = new URL(req.url, 'http://x').searchParams;
  const filters = {
    status: sp.get('status') || '',
    q: (sp.get('q') || '').trim(),
    sort: sp.get('sort') || 'newest',
    page: Number(sp.get('page')) || 1,
  };

  const body = adminOrdersPage({
    data: { result: orders.listOrders(filters), filters, stats: orders.orderStats() },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    200,
    adminLayout({ title: 'Orders', ctx, body, active: '/admin/orders', csrf: ctx.session.csrf, user: ctx.session.admin, wide: true })
  );
}

export function orderDetailRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const order = orders.getOrderById(id);
  if (!order) return adminNotFound(res, ctx);

  const body = adminOrderDetailPage({
    data: {
      order,
      items: orders.getOrderItems(id),
      events: orders.getOrderEvents(id, true),
      next: orders.nextStatus(order),
    },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    200,
    adminLayout({ title: order.order_code, ctx, body, active: '/admin/orders', csrf: ctx.session.csrf, user: ctx.session.admin })
  );
}

export function orderStatusRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const form = ctx.form || {};
  const result = orders.updateOrderStatus(id, String(form.status || ''), {
    note: String(form.note || '').trim(),
    visible: !form.internal,
    actor: ctx.session.admin.username,
  });

  const suffix = result.ok ? '' : '?error=' + encodeURIComponent(result.error || 'Could not update');
  redirect(res, `/admin/orders/${id}${suffix}`, 303);
}

export function orderPaymentRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const form = ctx.form || {};
  const allowed = ['unpaid', 'pending', 'paid', 'failed', 'refunded'];
  const status = allowed.includes(form.payment_status) ? form.payment_status : 'unpaid';
  run(
    `UPDATE orders SET payment_status = ?, payment_ref = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, String(form.payment_ref || '').trim().slice(0, 80) || null, id]
  );
  redirect(res, `/admin/orders/${id}`, 303);
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export function categoriesRoute(req, res, ctx) {
  const body = adminCategoriesPage({
    data: { categories: cat.getCategories(false) },
    csrf: ctx.session.csrf,
  });
  sendHtml(
    res,
    200,
    adminLayout({ title: 'Categories', ctx, body, active: '/admin/categories', csrf: ctx.session.csrf, user: ctx.session.admin })
  );
}

export function categoryCreateRoute(req, res, ctx) {
  const form = ctx.form || {};
  const name = String(form.name || '').trim().slice(0, 60);
  if (name) {
    const slug = uniqueSlug(name, (s) => get('SELECT 1 FROM categories WHERE slug = ?', [s]));
    run(
      'INSERT INTO categories (slug, name, tagline, sort_order, is_active) VALUES (?,?,?,?,1)',
      [slug, name, String(form.tagline || '').trim().slice(0, 100) || null, Number(form.sort_order) || 0]
    );
  }
  redirect(res, '/admin/categories', 303);
}

export function categoryUpdateRoute(req, res, ctx) {
  const id = Number(req.params.id);
  const form = ctx.form || {};
  run(
    `UPDATE categories SET name = ?, tagline = ?, sort_order = ?, is_active = ? WHERE id = ?`,
    [
      String(form.name || '').trim().slice(0, 60) || 'Untitled',
      String(form.tagline || '').trim().slice(0, 100) || null,
      Math.max(0, Number(form.sort_order) || 0),
      form.is_active ? 1 : 0,
      id,
    ]
  );
  redirect(res, '/admin/categories', 303);
}

export function categoryDeleteRoute(req, res, ctx) {
  const id = Number(req.params.id);
  // Products keep existing; their category is set to NULL.
  run('DELETE FROM categories WHERE id = ?', [id]);
  redirect(res, '/admin/categories', 303);
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export function settingsRoute(req, res, ctx) {
  const body = adminSettingsPage({
    data: { settings: getAllSettings(), saved: ctx.url?.searchParams.get('saved') === '1' },
    csrf: ctx.session.csrf,
  });
  sendHtml(
    res,
    200,
    adminLayout({ title: 'Settings', ctx, body, active: '/admin/settings', csrf: ctx.session.csrf, user: ctx.session.admin })
  );
}

const NUMERIC_SETTINGS = new Set([
  'delivery.inside_dhaka',
  'delivery.outside_dhaka',
  'delivery.free_threshold',
  'delivery.ready_stock_days_min',
  'delivery.ready_stock_days_max',
  'delivery.preorder_days_min',
  'delivery.preorder_days_max',
  'site.products_per_page',
  'site.home_ready_stock_limit',
  'site.home_preorder_limit',
]);

const BOOLEAN_SETTINGS = new Set([
  'payment.cod.enabled',
  'payment.bkash.enabled',
  'payment.nagad.enabled',
  'payment.bank.enabled',
  'site.show_hot_deals',
  'site.maintenance',
  'contact.show_facebook',
]);

export function settingsSaveRoute(req, res, ctx) {
  const form = ctx.form || {};
  const current = getAllSettings();
  const next = {};

  // HTML checkboxes are only sent when ticked, so "absent = off" is only true
  // for a full form submission. The form posts this marker; a partial payload
  // (script, API call) leaves boolean settings untouched instead of silently
  // disabling payment methods.
  const isFullForm = form.settings_form === '1' || form.settings_form === 'true';

  for (const [key, value] of Object.entries(current)) {
    if (BOOLEAN_SETTINGS.has(key)) {
      if (!isFullForm && form[key] === undefined) {
        next[key] = value;
        continue;
      }
      next[key] = form[key] === '1' || form[key] === 'on' || form[key] === true;
      continue;
    }
    if (NUMERIC_SETTINGS.has(key)) {
      const n = Number(form[key]);
      next[key] = Number.isFinite(n) && n >= 0 ? n : value;
      continue;
    }
    if (form[key] !== undefined) next[key] = String(form[key]).slice(0, 5000);
  }

  setManySettings(next);
  invalidateSettingsCache();
  redirect(res, '/admin/settings?saved=1', 303);
}

export function passwordRoute(req, res, ctx) {
  const form = ctx.form || {};
  const password = String(form.password || '');
  const confirm = String(form.confirm || '');

  const fail = (msg) => {
    const body = adminSettingsPage({
      data: { settings: getAllSettings(), saved: false, error: msg },
      csrf: ctx.session.csrf,
    });
    sendHtml(
      res,
      400,
      adminLayout({ title: 'Settings', ctx, body, active: '/admin/settings', csrf: ctx.session.csrf, user: ctx.session.admin })
    );
  };

  if (password !== confirm) return fail('The two passwords do not match');
  const strength = validatePasswordStrength(password);
  if (strength) return fail(strength);

  run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [
    hashPassword(password),
    ctx.session.admin.id,
  ]);

  // Invalidate every other session for this user.
  run('DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?', [ctx.session.admin.id, ctx.session.id]);

  redirect(res, '/admin/settings?saved=1', 303);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const clampInt = (v, min, max, dflt) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

function uniqueSlug(base, exists) {
  let slug = slugify(base);
  let n = 1;
  while (exists(slug)) {
    n += 1;
    slug = `${slugify(base).slice(0, 70)}-${n}`;
  }
  return slug;
}

async function adminFormError(res, ctx, { error, product, values }) {
  const images = product?.id ? all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [product.id]) : [];
  const variants = product?.id ? all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id', [product.id]) : [];

  const body = adminProductFormPage({
    data: {
      product: product || { specs: {}, highlights: [], keywords: [] },
      images,
      variants,
      categories: cat.getCategories(false),
      error,
      values,
      optimiserAvailable: await isOptimisationAvailable(),
    },
    csrf: ctx.session.csrf,
  });

  sendHtml(
    res,
    400,
    adminLayout({
      title: product?.id ? 'Edit product' : 'Add product',
      ctx,
      body,
      active: '/admin/products',
      csrf: ctx.session.csrf,
      user: ctx.session.admin,
    })
  );
}

function adminNotFound(res, ctx) {
  const body = html`
    <h1 class="amain__title">Not found</h1>
    <p class="muted">That record does not exist, or it was deleted.</p>
    <a class="btn btn--primary" href="/admin">Back to dashboard</a>
  `;
  sendHtml(
    res,
    404,
    adminLayout({ title: 'Not found', ctx, body, active: '', csrf: ctx.session?.csrf || '', user: ctx.session?.admin || { username: '' } })
  );
}

const sendJson = (res, status, data) =>
  sendHtml(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
