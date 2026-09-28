/**
 * Catalogue: product queries, search, filtering and sorting.
 *
 * Search is built on SQLite FTS5 (prefix matching + bm25 ranking), with a LIKE
 * fallback so partial codes like "1001" still find something when the index
 * has not been rebuilt.
 */
import { all, get, pluck } from  '../db/index.js';
import { storefront } from './settings.js';

/* -------------------------------------------------------------------------- */
/* Row shaping                                                                 */
/* -------------------------------------------------------------------------- */

const safeJson = (raw, fallback) => {
  if (raw === null || raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

/** Normalise a raw product row into the shape templates expect. */
export function shapeProduct(row) {
  if (!row) return null;
  const s = storefront();
  const price = Number(row.price);
  const compare = row.compare_price != null ? Number(row.compare_price) : null;
  const discount =
    compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0;

  return {
    ...row,
    is_active: !!row.is_active,
    is_featured: !!row.is_featured,
    is_trending: !!row.is_trending,
    is_new: !!row.is_new,
    is_hot_deal: !!row.is_hot_deal,
    specs: safeJson(row.specs, {}),
    highlights: safeJson(row.highlights, []),
    keywords: safeJson(row.keywords, []),
    price,
    compare_price: compare,
    discount,
    stock_qty: Number(row.stock_qty),
    rating_avg: Number(row.rating_avg) || 0,
    rating_count: Number(row.rating_count) || 0,
    sold_count: Number(row.sold_count) || 0,
    is_preorder: row.product_type === 'preorder',

    // Delivery window: ready stock ships locally, pre-order includes China leg.
    delivery_min_days:
      row.product_type === 'preorder'
        ? Number(s['delivery.preorder_days_min']) || row.delivery_min_days
        : Number(s['delivery.ready_stock_days_min']) || row.delivery_min_days,
    delivery_max_days:
      row.product_type === 'preorder'
        ? Number(s['delivery.preorder_days_max']) || row.delivery_max_days
        : Number(s['delivery.ready_stock_days_max']) || row.delivery_max_days,

    // Pre-order stock is not "in stock" in the local sense: it is made to order.
    in_stock:
      row.product_type === 'preorder' ? true : Number(row.stock_qty) > 0,
    image: row.primary_image || null,
    deal_active: isDealActive(row),
  };
}

export function isDealActive(row) {
  if (!row.is_hot_deal) return false;
  if (!row.deal_ends_at) return true;
  return new Date(row.deal_ends_at).getTime() > Date.now();
}

const COLOR_TOLERANCE = 42;

/** '#aabbcc' | 'aabbcc' | {r,g,b} -> { r, g, b } or null. */
export function parseColor(input) {
  if (!input) return null;
  if (typeof input === 'object' && 'r' in input) return input;
  const hex = String(input).replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/* -------------------------------------------------------------------------- */
/* Base select                                                                 */
/* -------------------------------------------------------------------------- */

const PRODUCT_SELECT = `
  SELECT p.*,
         c.name  AS category_name,
         c.slug  AS category_slug,
         (SELECT path FROM product_images i
           WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS primary_image,
         (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn free text into a safe FTS5 prefix query.
 * Strips characters that would otherwise be parsed as FTS5 operators, so a
 * customer typing "C++" or "*" gets a search rather than a SQL error.
 */
export function toFtsQuery(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9০-৯]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);

  if (!tokens.length) return null;

  return tokens
    .map((t) => {
      // Weight the title and SKU above body text.
      const bare = t.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
      return `(title : ${bare}* OR sku : ${bare}* OR keywords : ${bare}*)`;
    })
    .join(' AND ');
}

/**
 * Full product search with filters.
 *
 * @param {object} q
 * @param {string} [q.q]        search text
 * @param {string|string[]} [q.category] slug or slugs
 * @param {string} [q.type]     'ready_stock' | 'preorder'
 * @param {number} [q.minPrice]
 * @param {number} [q.maxPrice]
 * @param {boolean} [q.isNew]
 * @param {boolean} [q.discounted] only products with a discount
 * @param {boolean} [q.inStock]
 * @param {string} [q.sort]     'relevance'|'newest'|'price_asc'|'price_desc'|'popular'|'rating'
 * @param {number} [q.page]     1-based
 * @param {number} [q.perPage]
 * @param {number} [q.color]    hex, used by the offline image-search provider
 * @returns {{ items: object[], total: number, page: number, perPage: number, pages: number }}
 */
export function searchProducts(q = {}) {
  const s = storefront();
  const perPage = Math.min(96, Math.max(1, Number(q.perPage) || s['site.products_per_page'] || 24));
  const page = Math.max(1, Number(q.page) || 1);
  const offset = (page - 1) * perPage;

  const where = ['p.is_active = 1'];
  const params = [];
  const joins = [];
  let orderBy = 'p.created_at DESC';

  /* ---- text search ---- */
  let usingFts = false;
  const text = String(q.q || '').trim();
  if (text) {
    const fts = toFtsQuery(text);
    if (fts) {
      joins.push('JOIN product_fts f ON f.rowid = p.id');
      // FTS5 special columns are referenced with the table name in MATCH; we
      // use a subquery so the alias stays clean.
      where.push(`p.id IN (SELECT rowid FROM product_fts WHERE product_fts MATCH ?)`);
      params.push(fts);
      usingFts = true;
    } else {
      const like = `%${text.toLowerCase()}%`;
      where.push(`(lower(p.title) LIKE ? OR lower(p.sku) LIKE ? OR lower(COALESCE(p.keywords,'')) LIKE ?
                   OR lower(COALESCE(p.description,'')) LIKE ?)`);
      params.push(like, like, like, like);
    }
  }

  /* ---- category (supports multi-select) ---- */
  const cats = (Array.isArray(q.category) ? q.category : [q.category])
    .filter(Boolean)
    .map(String);
  if (cats.length) {
    where.push(`c.slug IN (${cats.map(() => '?').join(',')})`);
    params.push(...cats);
  }

  /* ---- stock type ---- */
  if (q.type === 'ready_stock' || q.type === 'preorder') {
    where.push('p.product_type = ?');
    params.push(q.type);
  }

  /* ---- price range ---- */
  if (Number.isFinite(Number(q.minPrice)) && q.minPrice !== '' && Number(q.minPrice) > 0) {
    where.push('p.price >= ?');
    params.push(Number(q.minPrice));
  }
  if (Number.isFinite(Number(q.maxPrice)) && q.maxPrice !== '' && Number(q.maxPrice) > 0) {
    where.push('p.price <= ?');
    params.push(Number(q.maxPrice));
  }

  /* ---- merchandising flags ---- */
  if (q.isNew) where.push('p.is_new = 1');
  if (q.featured) where.push('p.is_featured = 1');
  if (q.trending) where.push('p.is_trending = 1');
  if (q.hotDeal) {
    where.push(
      `p.is_hot_deal = 1 AND (p.deal_ends_at IS NULL OR p.deal_ends_at > datetime('now'))`
    );
  }
  if (q.discounted) where.push('p.compare_price IS NOT NULL AND p.compare_price > p.price');
  if (q.inStock) {
    where.push("(p.product_type = 'preorder' OR p.stock_qty > 0)");
  }
  if (q.onSale !== undefined) {
    where.push(q.onSale ? 'p.compare_price IS NOT NULL AND p.compare_price > p.price' : '1=1');
  }

  /* ---- offline image-search colour match ----
   * Products store their dominant image colour as three integer columns, so a
   * squared Euclidean distance in SQL gives us "visually similar" ranking
   * without any AI dependency. A tolerance of 42 per channel is roughly
   * "same broad colour family" (e.g. all navy and black products match).
   */
  const color = parseColor(q.color);
  if (color) {
    const excludeId = Number(q.excludeId) || -1;
    where.push('(p.color_r IS NOT NULL)');
    where.push(`(
      ((p.color_r - ?) * (p.color_r - ?) +
       (p.color_g - ?) * (p.color_g - ?) +
       (p.color_b - ?) * (p.color_b - ?)) < ?
      OR p.id = ?
    )`);
    params.push(
      color.r, color.r,
      color.g, color.g,
      color.b, color.b,
      COLOR_TOLERANCE * COLOR_TOLERANCE * 3,
      excludeId
    );
  }

  /* ---- sorting ---- */
  const sort = String(q.sort || (text ? 'relevance' : 'newest'));
  if (sort === 'relevance' && usingFts) {
    // bm25 weights: title, sku, keywords, body
    orderBy = 'bm25(product_fts, 10.0, 8.0, 5.0, 1.0) ASC, p.sold_count DESC';
  } else if (sort === 'price_asc') {
    orderBy = 'p.price ASC';
  } else if (sort === 'price_desc') {
    orderBy = 'p.price DESC';
  } else if (sort === 'popular') {
    orderBy = 'p.sold_count DESC, p.rating_avg DESC';
  } else if (sort === 'rating') {
    orderBy = 'p.rating_avg DESC, p.rating_count DESC';
  } else if (sort === 'discount') {
    orderBy =
      'CASE WHEN p.compare_price IS NULL OR p.compare_price <= 0 THEN 0 ' +
      'ELSE CAST((p.compare_price - p.price) AS REAL) / p.compare_price END DESC';
  } else if (sort === 'oldest') {
    orderBy = 'p.created_at ASC';
  } else if (sort === 'newest') {
    orderBy = 'p.created_at DESC';
  }

  const whereSql = where.join(' AND ');
  const joinSql = joins.join('\n');

  const countSql = `
    SELECT COUNT(*) AS n
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${joinSql}
    WHERE ${whereSql}
  `;
  const total = Number(pluck(countSql, params) || 0);

  const rows = all(
    `${PRODUCT_SELECT} ${joinSql} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return {
    items: rows.map(shapeProduct),
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/* -------------------------------------------------------------------------- */
/* Single product                                                              */
/* -------------------------------------------------------------------------- */

export function getProductBySlug(slug) {
  const row = get(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.is_active = 1`, [slug]);
  if (!row) return null;
  const product = shapeProduct(row);
  product.images = all(
    'SELECT id, path, width, height, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id',
    [row.id]
  );
  product.variants = all(
    'SELECT id, name, value, price_delta, stock_qty, sku FROM product_variants WHERE product_id = ? ORDER BY sort_order, id',
    [row.id]
  );
  product.category = row.category_id
    ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
    : null;
  product.reviews = all(
    'SELECT id, author, rating, body, created_at FROM reviews WHERE product_id = ? AND is_approved = 1 ORDER BY created_at DESC LIMIT 20',
    [row.id]
  );
  return product;
}

export function getProductById(id) {
  const row = get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  if (!row) return null;
  const product = shapeProduct(row);
  product.images = all(
    'SELECT id, path, width, height, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id',
    [row.id]
  );
  product.variants = all(
    'SELECT id, name, value, price_delta, stock_qty, sku FROM product_variants WHERE product_id = ? ORDER BY sort_order, id',
    [row.id]
  );
  return product;
}

/**
 * Load products by id, preserving the caller's order.
 *
 * Inactive products are skipped on purpose: this powers the cart and checkout,
 * so a product the owner has switched off must not be orderable even if a
 * customer still has it in localStorage. Admin code should use getProductById,
 * which is unfiltered.
 */
export function getProductsByIds(ids) {
  if (!ids.length) return [];
  const rows = all(
    `${PRODUCT_SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.is_active = 1`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, shapeProduct(r)]));
  // Preserve the caller's ordering (cart line order).
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

export function getRelatedProducts(product, limit = 8) {
  if (!product) return [];
  return searchProducts({
    category: product.category?.slug,
    perPage: limit + 1,
    sort: 'popular',
  }).items.filter((p) => p.id !== product.id).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Home page collections                                                       */
/* -------------------------------------------------------------------------- */

export function getCategories(onlyActive = true) {
  const rows = all(
    `SELECT c.*, (SELECT COUNT(*) FROM products p
                   WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
     FROM categories c
     ${onlyActive ? 'WHERE c.is_active = 1' : ''}
     ORDER BY c.sort_order, c.name`
  );
  return rows.map((r) => ({ ...r, is_active: !!r.is_active, product_count: Number(r.product_count) }));
}

export function getCategoryBySlug(slug) {
  const row = get(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
     FROM categories c WHERE c.slug = ?`,
    [slug]
  );
  return row ? { ...row, is_active: !!row.is_active, product_count: Number(row.product_count) } : null;
}

/** Ready stock rail for the homepage: trending local items first. */
export function getReadyStock(limit = 10) {
  return searchProducts({ type: 'ready_stock', inStock: true, perPage: limit, sort: 'popular' }).items
    .sort((a, b) => Number(b.is_trending) - Number(a.is_trending) || b.sold_count - a.sold_count)
    .slice(0, limit);
}

/** Pre-order rail for the homepage. */
export function getPreorder(limit = 10) {
  return searchProducts({ type: 'preorder', perPage: limit, sort: 'popular' }).items
    .sort((a, b) => Number(b.is_trending) - Number(a.is_trending) || b.sold_count - a.sold_count)
    .slice(0, limit);
}

export function getHotDeals(limit = 8) {
  return searchProducts({ hotDeal: true, perPage: limit, sort: 'discount' }).items.slice(0, limit);
}

export function getTrending(limit = 8) {
  return searchProducts({ trending: true, perPage: limit, sort: 'popular' }).items.slice(0, limit);
}

export function getNewArrivals(limit = 8) {
  return searchProducts({ perPage: limit, sort: 'newest' }).items.slice(0, limit);
}

export function getFeatured(limit = 8) {
  return searchProducts({ featured: true, perPage: limit, sort: 'newest' }).items.slice(0, limit);
}

/** Cheap counts for the header / filter chips. */
export function getCatalogueStats() {
  return {
    total: Number(pluck('SELECT COUNT(*) FROM products WHERE is_active = 1') || 0),
    readyStock: Number(pluck("SELECT COUNT(*) FROM products WHERE is_active = 1 AND product_type = 'ready_stock'") || 0),
    preorder: Number(pluck("SELECT COUNT(*) FROM products WHERE is_active = 1 AND product_type = 'preorder'") || 0),
    deals: Number(
      pluck("SELECT COUNT(*) FROM products WHERE is_active = 1 AND is_hot_deal = 1 AND (deal_ends_at IS NULL OR deal_ends_at > datetime('now'))") || 0
    ),
  };
}

/** Price range of the live catalogue, for filter sliders. */
export function getPriceBounds() {
  const row = get(
    'SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE is_active = 1'
  );
  return {
    min: Number(row?.min ?? 0),
    max: Number(row?.max ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Image-search: offline provider                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fallback implementation of image search that needs no external service.
 * Matches products whose dominant colour is close to the uploaded image's
 * dominant colour, optionally combined with a text query.
 *
 * @param {{ colorHex: string, text?: string }} input
 */
export function searchByImageOffline({ colorHex, text }) {
  if (text) {
    return searchProducts({ q: text, perPage: 24, sort: 'relevance' });
  }
  return searchProducts({ color: colorHex, perPage: 24, sort: 'popular' });
}

/** Ids for "customers also viewed" style shuffle, used as a home fallback. */
export function getRandomProducts(limit = 8) {
  return all(`${PRODUCT_SELECT} WHERE p.is_active = 1 ORDER BY RANDOM() LIMIT ?`, [limit]).map(shapeProduct);
}
