/**
 * Cart logic.
 *
 * Two things worth knowing:
 *
 * 1. The cart is client-side (localStorage) so guests can add items instantly
 *    and there is no session to manage. It is also mirrored into a *signed*
 *    cookie so the server can render a correct header badge and, more
 *    importantly, so a customer who blocks storage still has a working cart.
 *
 * 2. Nothing in the cart is trusted at checkout. `resolveCartLines` reloads
 *    every product from the database, recomputes the price from the current
 *    catalogue, clamps quantity to available stock and re-derives the delivery
 *    fee. A tampered cookie can change what is displayed, never what is charged.
 */
import { getProductsByIds } from './catalogue.js';
import { deliveryFee } from './settings.js';
import { all } from '../db/index.js';

export const CART_COOKIE = 'awaj_cart';
export const MAX_QTY_PER_LINE = 20;

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/** Coerce anything into a well-formed cart line. */
function normalizeLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const variantId = raw.variantId != null ? Number(raw.variantId) : null;

  let qty = Number.parseInt(raw.qty, 10);
  // A missing or nonsensical quantity is treated as "remove this line" rather
  // than silently becoming 1, so a corrupt cart never charges for an item the
  // customer did not ask for.
  if (!Number.isFinite(qty) || qty < 1) return null;
  qty = Math.min(qty, MAX_QTY_PER_LINE);

  return { id, variantId: Number.isInteger(variantId) && variantId > 0 ? variantId : null, qty };
}

/**
 * Normalise a full cart. Unknown lines are dropped silently rather than
 * throwing, because a stale cart should never block a customer from checking out.
 *
 * @returns {Array<{id:number, variantId:number|null, qty:number}>}
 */
export function normalizeCart(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const seen = new Set();
  const out = [];

  for (const item of list) {
    const line = normalizeLine(item);
    if (!line) continue;
    // Collapse duplicate lines for the same product+variant.
    const key = `${line.id}:${line.variantId ?? ''}`;
    if (seen.has(key)) {
      const existing = out.find((l) => `${l.id}:${l.variantId ?? ''}` === key);
      existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + line.qty);
      continue;
    }
    seen.add(key);
    out.push(line);
    if (out.length >= 50) break; // cap cart size
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Authoritative pricing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild the cart from the database and price it.
 *
 * @param {Array} rawCart  normalised or raw client cart
 * @param {{ district?: string, trustStock?: boolean }} [opts]
 * @returns {{
 *   lines: Array<object>, itemCount: number, subtotal: number,
 *   deliveryFee: number, total: number, hasPreorder: boolean,
 *   hasReadyStock: boolean, issues: Array<{id:number, message:string}>,
 *   estimatedDays: {min:number,max:number}
 * }}
 */
export function priceCart(rawCart, { district = '', trustStock = true } = {}) {
  const lines = normalizeCart(rawCart);
  const issues = [];
  const priced = [];

  if (lines.length === 0) {
    return {
      lines: [],
      itemCount: 0,
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      hasPreorder: false,
      hasReadyStock: false,
      issues,
      estimatedDays: { min: 0, max: 0 },
    };
  }

  const products = getProductsByIds(lines.map((l) => l.id));
  const byId = new Map(products.map((p) => [p.id, p]));

  // Variant lookup, grouped by product so it stays a single query per batch.
  const variantIds = lines.map((l) => l.variantId).filter(Boolean);
  const variants = variantIds.length
    ? all(
        `SELECT id, product_id, name, value, price_delta, stock_qty
         FROM product_variants WHERE id IN (${variantIds.map(() => '?').join(',')})`,
        variantIds
      )
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  for (const line of lines) {
    const product = byId.get(line.id);
    if (!product) {
      issues.push({ id: line.id, message: 'A product in your cart is no longer available.' });
      continue;
    }

    let unitPrice = product.price;
    let variantLabel = null;
    let available = product.stock_qty;

    if (line.variantId) {
      const variant = variantById.get(line.variantId);
      if (!variant || variant.product_id !== product.id) {
        issues.push({ id: product.id, message: `An option for "${product.title}" is unavailable.` });
        continue;
      }
      unitPrice += Number(variant.price_delta) || 0;
      variantLabel = `${variant.name}: ${variant.value}`;
      available = Number(variant.stock_qty);
    }

    // Pre-order items are made to order, so local stock never limits them.
    const isPreorder = product.is_preorder;
    let qty = line.qty;

    if (!isPreorder && available <= 0) {
      issues.push({ id: product.id, message: `"${product.title}" just sold out.`, remove: true });
      qty = 0;
    } else if (trustStock && !isPreorder && qty > available) {
      qty = Math.min(qty, available);
      issues.push({
        id: product.id,
        message: `Only ${available} left of "${product.title}". Quantity updated.`,
      });
    }

    if (qty <= 0) continue;

    priced.push({
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      title: product.title,
      image: product.image,
      product_type: product.product_type,
      is_preorder: isPreorder,
      variantId: line.variantId,
      variantLabel,
      unitPrice,
      qty,
      lineTotal: unitPrice * qty,
      stock_qty: available,
      maxQty: isPreorder ? MAX_QTY_PER_LINE : Math.min(MAX_QTY_PER_LINE, Math.max(1, available)),
    });
  }

  const subtotal = priced.reduce((sum, l) => sum + l.lineTotal, 0);
  const fee = priced.length ? deliveryFee(district, subtotal) : 0;
  const hasPreorder = priced.some((l) => l.is_preorder);
  const hasReadyStock = priced.some((l) => !l.is_preorder);

  // A mixed cart is limited by whichever leg is slowest.
  const windows = priced.map((l) => {
    const p = byId.get(l.id);
    return p ? [p.delivery_min_days, p.delivery_max_days] : [1, 3];
  });
  const estimatedDays = windows.length
    ? {
        min: Math.max(...windows.map((w) => w[0])),
        max: Math.max(...windows.map((w) => w[1])),
      }
    : { min: 0, max: 0 };

  return {
    lines: priced,
    itemCount: priced.reduce((n, l) => n + l.qty, 0),
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
    hasPreorder,
    hasReadyStock,
    issues,
    estimatedDays,
  };
}

/* -------------------------------------------------------------------------- */
/* Totals only (header badge)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Cheap summary for the header cart counter. Avoids a full price rebuild,
 * but still respects stock so the badge never shows impossible quantities.
 */
export function cartSummary(rawCart) {
  const lines = normalizeCart(rawCart);
  if (!lines.length) return { itemCount: 0, subtotal: 0, hasPreorder: false, hasReadyStock: false };

  const products = getProductsByIds(lines.map((l) => l.id));
  const byId = new Map(products.map((p) => [p.id, p]));

  let itemCount = 0;
  let subtotal = 0;
  let hasPreorder = false;
  let hasReadyStock = false;

  for (const line of lines) {
    const product = byId.get(line.id);
    if (!product) continue;
    const qty = !product.is_preorder
      ? Math.min(line.qty, Math.max(0, product.stock_qty))
      : line.qty;
    if (qty <= 0) continue;
    itemCount += qty;
    subtotal += product.price * qty;
    if (product.is_preorder) hasPreorder = true;
    else hasReadyStock = true;
  }

  return { itemCount, subtotal, hasPreorder, hasReadyStock };
}

