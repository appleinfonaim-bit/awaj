-- ===========================================================================
-- AWAJ - database schema
-- SQLite. Applied idempotently on every boot by server/db/index.js
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Settings: key/value store for anything the owner must be able to change
-- (delivery charges, payment methods, WhatsApp/FB links, social proof, ...)
-- Nothing business-critical is hard-coded in the frontend.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,           -- JSON encoded
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT,                    -- e.g. "Phones, accessories, smart devices"
  description TEXT,
  image       TEXT,                    -- optimised webp path under /uploads
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Products
--
-- product_type drives the entire Ready Stock vs Pre-Order experience:
--   'ready_stock' -> ships from Bangladesh, delivery 1-3 days, no China steps
--   'preorder'    -> sourced from China after order, delivery 7-10 days
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  sku            TEXT NOT NULL UNIQUE,   -- customer-facing product code (AWJ-1001)
  title          TEXT NOT NULL,
  subtitle       TEXT,
  description    TEXT,
  specs          TEXT,                   -- JSON object: { "Battery": "1200mAh", ... }
  highlights     TEXT,                   -- JSON array of bullet strings

  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  product_type   TEXT NOT NULL DEFAULT 'ready_stock'
                 CHECK (product_type IN ('ready_stock', 'preorder')),

  price          INTEGER NOT NULL,       -- selling price, BDT, integer poisha-free
  compare_price  INTEGER,                -- strikethrough price, BDT
  cost_price     INTEGER,                -- internal, hidden from storefront

  stock_qty      INTEGER NOT NULL DEFAULT 0,
  low_stock_at   INTEGER NOT NULL DEFAULT 3,

  -- Pre-order delivery window (days). Ready stock overrides to 1-3.
  delivery_min_days INTEGER NOT NULL DEFAULT 7,
  delivery_max_days INTEGER NOT NULL DEFAULT 10,

  -- Merchandising
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  is_trending    INTEGER NOT NULL DEFAULT 0,
  is_new         INTEGER NOT NULL DEFAULT 0,
  is_hot_deal    INTEGER NOT NULL DEFAULT 0,
  deal_stock_limit  INTEGER,             -- "Only 12 left" for hot deals
  deal_ends_at   TEXT,                   -- ISO date; countdown is driven by this

  -- Social proof
  rating_avg     REAL NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  sold_count     INTEGER NOT NULL DEFAULT 0,

  -- Free-form searchable keywords (JSON array of strings)
  keywords       TEXT,

  -- Dominant colour of the main product image, split into integers so the
  -- offline image-search provider can do real distance maths in SQL.
  color_hex      TEXT,
  color_r        INTEGER,
  color_g        INTEGER,
  color_b        INTEGER,

  -- Origin (China) reference, shown on pre-order products
  origin_note    TEXT,
  supplier_ref   TEXT,

  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_type     ON products(product_type, is_active);
CREATE INDEX IF NOT EXISTS idx_products_deal     ON products(is_hot_deal, deal_ends_at);
CREATE INDEX IF NOT EXISTS idx_products_trending ON products(is_trending, sold_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products(price);

-- ---------------------------------------------------------------------------
-- Product images (already optimised to webp + jpg fallback on upload)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,            -- webp source, e.g. "products/aw-1001/1.webp"
  width       INTEGER,
  height      INTEGER,
  alt         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, sort_order);

-- ---------------------------------------------------------------------------
-- Variants (colour, size, pack size ...). Price is a delta from product.price.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- "Color", "Size", "Pack"
  value       TEXT NOT NULL,            -- "Black", "XL", "2 Pack"
  price_delta INTEGER NOT NULL DEFAULT 0,
  stock_qty   INTEGER NOT NULL DEFAULT 0,
  sku         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, sort_order);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code     TEXT NOT NULL UNIQUE,  -- AWAJ-8F3K2Q
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  whatsapp       TEXT,
  district       TEXT NOT NULL,
  area           TEXT,
  address        TEXT NOT NULL,
  note           TEXT,

  product_type   TEXT NOT NULL,         -- snapshot: ready_stock | preorder
  subtotal       INTEGER NOT NULL,
  delivery_fee   INTEGER NOT NULL,
  total          INTEGER NOT NULL,

  payment_method TEXT NOT NULL,         -- cod | bkash | nagad | bank
  payment_ref    TEXT,                  -- bKash/Nagad transaction id for manual pay
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
                 CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),

  status         TEXT NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','confirmed','ordered_from_china',
                                   'in_transit','arrived_bd','ready_for_delivery',
                                   'delivered','cancelled')),

  ip             TEXT,
  user_agent     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON orders(phone);

-- ---------------------------------------------------------------------------
-- Order lines. Product details are snapshotted so historical invoices never
-- change when the catalogue is edited later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id     INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  variant_label  TEXT,
  slug           TEXT,
  image          TEXT,
  unit_price     INTEGER NOT NULL,
  qty            INTEGER NOT NULL,
  line_total     INTEGER NOT NULL,
  product_type   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- Order timeline: every status change is appended, which powers public
-- order tracking without needing an account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT,
  visible     INTEGER NOT NULL DEFAULT 1,   -- internal notes hidden from customers
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id, created_at);

-- ---------------------------------------------------------------------------
-- Product reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, is_approved);

-- ---------------------------------------------------------------------------
-- Admin users + sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- scrypt: salt$hash, hex
  role          TEXT NOT NULL DEFAULT 'owner',
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          TEXT PRIMARY KEY,          -- random 32-byte hex token
  admin_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf        TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Rate limiting (login attempts, order placement, order tracking lookups)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      TEXT NOT NULL,
  key         TEXT NOT NULL,
  hits        INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  PRIMARY KEY (bucket, key)
);

-- ---------------------------------------------------------------------------
-- Full-text search index.
--
-- A standalone FTS5 table (rather than an "external content" table) lets us
-- weight title > sku > keywords > body, which makes results feel intentional.
-- Kept in sync by triggers so it can never drift from `products`.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS product_fts USING fts5(
  title,
  sku,
  keywords,
  body
);

CREATE TRIGGER IF NOT EXISTS products_fts_ai AFTER INSERT ON products BEGIN
  INSERT INTO product_fts(rowid, title, sku, keywords, body)
  VALUES (new.id, new.title, new.sku,
          COALESCE(new.keywords, ''),
          COALESCE(new.subtitle,'') || ' ' || COALESCE(new.description,'') || ' ' || COALESCE(new.specs,''));
END;

CREATE TRIGGER IF NOT EXISTS products_fts_ad AFTER DELETE ON products BEGIN
  DELETE FROM product_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products BEGIN
  DELETE FROM product_fts WHERE rowid = old.id;
  INSERT INTO product_fts(rowid, title, sku, keywords, body)
  VALUES (new.id, new.title, new.sku,
          COALESCE(new.keywords, ''),
          COALESCE(new.subtitle,'') || ' ' || COALESCE(new.description,'') || ' ' || COALESCE(new.specs,''));
END;
