/**
 * Order service: validation, creation, status transitions and public tracking.
 *
 * Security notes
 * - Every price is recomputed server-side from the catalogue. The client only
 *   sends product ids, variant ids, quantities and delivery details.
 * - Order codes are generated server-side from a CSPRNG and are unguessable
 *   enough that tracking still requires the matching phone number.
 * - Status transitions are validated against an explicit state machine, so a
 *   bug or a crafted request cannot move an order backwards or skip ahead.
 */
import { run, get, all, tx, rateLimit } from '../db/index.js';
import { priceCart, normalizeCart, MAX_QTY_PER_LINE } from './cart.js';
import { storefront, deliveryFee } from './settings.js';
import { hashKey } from './security.js';
import { DISTRICTS } from '../config.js';
import { orderCode } from './utils.js';

/* -------------------------------------------------------------------------- */
/* Status machine                                                              */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUSES = [
  'received',
  'confirmed',
  'ordered_from_china',
  'in_transit',
  'arrived_bd',
  'ready_for_delivery',
  'delivered',
  'cancelled',
];

/**
 * Legal transitions. Ready-stock orders skip the China leg, which is how the
 * tracking page omits those steps automatically.
 */
const TRANSITIONS = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['ordered_from_china', 'ready_for_delivery', 'cancelled'],
  ordered_from_china: ['in_transit', 'arrived_bd', 'ready_for_delivery', 'cancelled'],
  in_transit: ['arrived_bd', 'ready_for_delivery', 'cancelled'],
  arrived_bd: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Steps that only make sense for products imported from China. */
const CHINA_STEPS = new Set(['ordered_from_china', 'in_transit', 'arrived_bd']);

export const isChinaStep = (status) => CHINA_STEPS.has(status);

export const STATUS_LABELS = {
  received: 'Order Received',
  confirmed: 'Confirmed',
  ordered_from_china: 'Ordered From China',
  in_transit: 'In Transit',
  arrived_bd: 'Arrived in Bangladesh',
  ready_for_delivery: 'Ready for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

/** Next status an admin would normally pick, skipping irrelevant China steps. */
export function nextStatus(order) {
  const isPreorder = order.product_type === 'preorder';
  const map = isPreorder
    ? {
        received: 'confirmed',
        confirmed: 'ordered_from_china',
        ordered_from_china: 'in_transit',
        in_transit: 'arrived_bd',
        arrived_bd: 'ready_for_delivery',
        ready_for_delivery: 'delivered',
      }
    : {
        received: 'confirmed',
        confirmed: 'ready_for_delivery',
        ready_for_delivery: 'delivered',
      };
  return map[order.status] || null;
}

/**
 * Build the public tracking timeline for an order.
 * China-only steps are omitted for ready-stock orders.
 */
export function buildTimeline(order) {
  const isPreorder = order.product_type === 'preorder';
  const steps = isPreorder
    ? ['received', 'confirmed', 'ordered_from_china', 'in_transit', 'arrived_bd', 'ready_for_delivery', 'delivered']
    : ['received', 'confirmed', 'ready_for_delivery', 'delivered'];

  const currentIndex = steps.indexOf(order.status);

  // Map each step to the most recent matching event, so the customer sees
  // real timestamps rather than "pending" for everything already done.
  const events = all(
    'SELECT status, note, created_at FROM order_events WHERE order_id = ? AND visible = 1 ORDER BY created_at, id',
    [order.id]
  );
  const byStatus = new Map();
  for (const ev of events) byStatus.set(ev.status, ev);

  return steps.map((status, i) => {
    const event = byStatus.get(status);
    const done = currentIndex > -1 && i < currentIndex;
    const isCurrent = status === order.status;
    const failed = order.status === 'cancelled' && !done;
    return {
      status,
      label: STATUS_LABELS[status],
      state: order.status === 'cancelled' ? 'cancelled' : isCurrent ? 'current' : done ? 'done' : 'upcoming',
      note: event?.note || '',
      at: event?.created_at || (done ? null : null),
      index: i,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const NAME_RE = /^[\p{L}\p{M}\s.'-]{2,80}$/u;
// Bangladeshi mobile numbers: 11 digits starting 013-019, or +880...
const PHONE_RE = /^(?:\+?88)?0?1[3-9]\d{8}$/;

/**
 * Normalise a Bangladeshi phone number to local 11-digit form.
 *
 * Handles the formats customers actually type:
 *   01712345678 | +8801712345678 | 8801712345678 | 01712-345678 | 01712 345678
 *
 * Note the 880 prefix is stripped *before* the leading 0 is added, otherwise
 * "+8801712..." would become "001712..." and fail validation.
 */
const normalisePhone = (value) => {
  let digits = String(value || '').replace(/[\s\-().]/g, '');
  digits = digits.replace(/^\+/, '');              // +880...  -> 880...
  digits = digits.replace(/^88/, '');               // 880...   -> 0...
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`; // 1712... -> 01712...
  return digits;
};

/**
 * Validate a checkout payload.
 * @returns {{ ok: true, value: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateCheckout(input) {
  const errors = {};
  const s = storefront();

  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(name)) errors.name = 'Please enter your full name (letters only)';

  const phone = normalisePhone(input.phone);
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid Bangladeshi mobile number (e.g. 01712345678)';

  // WhatsApp is optional; if given it must be valid.
  const whatsapp = input.whatsapp ? normalisePhone(input.whatsapp) : phone;
  if (!PHONE_RE.test(whatsapp)) errors.whatsapp = 'Enter a valid Bangladeshi mobile number';

  const district = String(input.district || '').trim();
  if (!district) errors.district = 'Select your district';
  else if (!DISTRICTS.includes(district)) errors.district = 'Select a district from the list';

  const area = String(input.area || '').trim();
  if (area.length > 80) errors.area = 'Area/thana is too long';

  const address = String(input.address || '').trim();
  if (address.length < 8) errors.address = 'Please enter your full address (house, road, area)';
  else if (address.length > 300) errors.address = 'Address is too long';

  const note = String(input.note || '').trim();
  if (note.length > 400) errors.note = 'Note is too long (400 characters max)';

  const payment = String(input.payment || 'cod').trim();
  const allowed = s.paymentMethods.map((m) => m.id);
  if (!allowed.includes(payment)) errors.payment = 'Choose a valid payment method';

  const lines = normalizeCart(input.cart);
  if (!lines.length) errors.cart = 'Your cart is empty';

  for (const line of lines) {
    if (line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      errors.cart = `Quantity per item must be between 1 and ${MAX_QTY_PER_LINE}`;
      break;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, phone, whatsapp, district, area, address, note, payment, lines },
  };
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create an order from a validated checkout payload.
 *
 * Prices, delivery fee and stock are all recomputed here. Any line that
 * became unavailable since the cart was rendered is rejected outright rather
 * than silently changed, so the customer always confirms the real total.
 *
 * @returns {{ ok: true, order: object } | { ok: false, errors: object }}
 */
export function createOrder({ value, ip, userAgent }) {
  // trustStock:false keeps the customer's *requested* quantity intact instead
  // of silently clamping it to what is on the shelf. The stock check below
  // then rejects the order outright, so a customer is never charged for a
  // quantity they did not agree to.
  const priced = priceCart(value.lines, { district: value.district, trustStock: false });

  if (!priced.lines.length) {
    return { ok: false, errors: { cart: 'None of the products in your cart are available any more.' } };
  }

  // Pre-order carts can mix in ready stock; delivery is charged once.
  const delivery = deliveryFee(value.district, priced.subtotal);
  const total = priced.subtotal + delivery;

  const order = tx(() => {
    // Re-read stock inside the transaction to avoid overselling under load.
    for (const line of priced.lines) {
      if (line.is_preorder) continue;
      const fresh = get('SELECT stock_qty FROM products WHERE id = ?', [line.id]);
      const available = fresh ? Number(fresh.stock_qty) : 0;
      if (available < line.qty) {
        throw Object.assign(new Error(`Only ${available} left of "${line.title}"`), {
          statusCode: 409,
          code: 'stock_changed',
          productId: line.id,
        });
      }
    }

    let code = orderCode();
    // Astronomically unlikely, but cheap to guarantee.
    while (get('SELECT 1 FROM orders WHERE order_code = ?', [code])) code = orderCode();

    const productType = priced.hasPreorder ? 'preorder' : 'ready_stock';

    const info = run(
      `INSERT INTO orders
        (order_code, customer_name, phone, whatsapp, district, area, address, note,
         product_type, subtotal, delivery_fee, total, payment_method, payment_status,
         status, ip, user_agent)
       VALUES (:code, :name, :phone, :whatsapp, :district, :area, :address, :note,
               :product_type, :subtotal, :delivery_fee, :total, :payment, 'unpaid',
               'received', :ip, :ua)`,
      {
        code,
        name: value.name,
        phone: value.phone,
        whatsapp: value.whatsapp,
        district: value.district,
        area: value.area,
        address: value.address,
        note: value.note || null,
        product_type: productType,
        subtotal: priced.subtotal,
        delivery_fee: delivery,
        total,
        payment: value.payment,
        ip: ip || null,
        ua: (userAgent || '').slice(0, 300) || null,
      }
    );

    const orderId = Number(info.lastInsertRowid);

    for (const line of priced.lines) {
      run(
        `INSERT INTO order_items
          (order_id, product_id, variant_id, title, variant_label, slug, image,
           unit_price, qty, line_total, product_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [orderId, line.id, line.variantId, line.title, line.variantLabel, line.slug,
          line.image, line.unitPrice, line.qty, line.lineTotal, line.product_type]
      );

      // Decrement local stock. Pre-order items are not decremented.
      if (!line.is_preorder) {
        run('UPDATE products SET stock_qty = MAX(0, stock_qty - ?), sold_count = sold_count + ? WHERE id = ?', [
          line.qty,
          line.qty,
          line.id,
        ]);
      } else {
        run('UPDATE products SET sold_count = sold_count + ? WHERE id = ?', [line.qty, line.id]);
      }
    }

    run(
      `INSERT INTO order_events (order_id, status, note, visible) VALUES (?,?,?,1)`,
      [orderId, 'received', 'We have received your order and will call to confirm.']
    );

    return get('SELECT * FROM orders WHERE id = ?', [orderId]);
  });

  return { ok: true, order: shapeOrder(order) };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export function shapeOrder(row) {
  if (!row) return null;
  return {
    ...row,
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    total: Number(row.total),
    statusLabel: STATUS_LABELS[row.status] || row.status,
    paymentLabel: storefront().paymentMethods.find((m) => m.id === row.payment_method)?.label || row.payment_method,
  };
}

export function getOrderById(id) {
  return shapeOrder(get('SELECT * FROM orders WHERE id = ?', [id]));
}

export function getOrderByCode(code) {
  return shapeOrder(get('SELECT * FROM orders WHERE order_code = ?', [String(code || '').trim().toUpperCase()]));
}

export function getOrderItems(orderId) {
  return all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
}

export function getOrderEvents(orderId, includeInternal = false) {
  return all(
    `SELECT status, note, visible, created_at FROM order_events
     WHERE order_id = ? ${includeInternal ? '' : 'AND visible = 1'} ORDER BY created_at, id`,
    [orderId]
  );
}

/**
 * Public order lookup: order code + phone number.
 * Rate limited because it is the only unauthenticated order endpoint.
 */
export function trackOrder(code, phone) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanPhone = normalisePhone(phone);

  if (!cleanCode || !cleanPhone) {
    return { ok: false, error: 'Enter both your order ID and the phone number you ordered with.' };
  }
  if (!/^AWAJ-[A-Z0-9]{4,12}$/.test(cleanCode)) {
    return { ok: false, error: 'That order ID does not look right. It looks like AWAJ-XXXXXX.' };
  }

  const row = get('SELECT * FROM orders WHERE order_code = ? AND phone = ?', [cleanCode, cleanPhone]);
  if (!row) {
    return { ok: false, error: 'We could not find an order with that ID and phone number. Please check both and try again.' };
  }

  const order = shapeOrder(row);
  return {
    ok: true,
    order,
    items: getOrderItems(order.id),
    timeline: buildTimeline(order),
    events: getOrderEvents(order.id),
  };
}

/** Same lookup, but rate limited by IP. Used by the POST handler. */
export function trackOrderRateLimited(code, phone, ip) {
  const limit = rateLimit('track', hashKey(ip), 20, 10 * 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      retryAfter: limit.retryAfterSec,
      error: `Too many lookup attempts. Please wait ${Math.ceil(limit.retryAfterSec / 60)} minutes and try again.`,
    };
  }
  return trackOrder(code, phone);
}

/* -------------------------------------------------------------------------- */
/* Status changes (admin)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Move an order to a new status, recording the change in the timeline.
 *
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function updateOrderStatus(orderId, next, { note = '', visible = true, actor = 'admin' } = {}) {
  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return { ok: false, error: 'Order not found' };
  if (!ORDER_STATUSES.includes(next)) return { ok: false, error: 'Unknown status' };
  if (order.status === next) return { ok: true };
  if (!canTransition(order.status, next)) {
    return {
      ok: false,
      error: `Cannot change from "${STATUS_LABELS[order.status]}" to "${STATUS_LABELS[next]}".`,
    };
  }

  tx(() => {
    run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [next, orderId]);
    run(
      'INSERT INTO order_events (order_id, status, note, visible) VALUES (?,?,?,?)',
      [orderId, next, note || defaultNote(next, actor), visible ? 1 : 0]
    );

    // Cancelling returns reserved stock to the shelf.
    if (next === 'cancelled' && order.status !== 'cancelled') {
      for (const item of all('SELECT product_id, qty, product_type FROM order_items WHERE order_id = ?', [orderId])) {
        if (!item.product_id || item.product_type === 'preorder') continue;
        run('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [item.qty, item.product_id]);
      }
    }
  });

  return { ok: true };
}

function defaultNote(status, actor) {
  const notes = {
    received: 'We have received your order.',
    confirmed: 'Your order has been confirmed. We will call before dispatch.',
    ordered_from_china: 'We have ordered this product from our supplier in China.',
    in_transit: 'Your parcel is on the way to Bangladesh.',
    arrived_bd: 'Your parcel has arrived in Bangladesh and is going through customs.',
    ready_for_delivery: 'Your parcel is ready and will be delivered shortly.',
    delivered: 'Delivered. Thank you for shopping with AWAJ.',
    cancelled: 'This order has been cancelled.',
  };
  return notes[status] || `Status updated to ${STATUS_LABELS[status]}.`;
}

/* -------------------------------------------------------------------------- */
/* Admin listing                                                               */
/* -------------------------------------------------------------------------- */

const LIST_SORTS = {
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  total_desc: 'total DESC',
  total_asc: 'total ASC',
  status: `CASE status WHEN 'received' THEN 1 WHEN 'confirmed' THEN 2
           WHEN 'ordered_from_china' THEN 3 WHEN 'in_transit' THEN 4
           WHEN 'arrived_bd' THEN 5 WHEN 'ready_for_delivery' THEN 6
           WHEN 'delivered' THEN 7 ELSE 8 END`,
};

export function listOrders({ status = '', q = '', sort = 'newest', page = 1, perPage = 25 } = {}) {
  const where = [];
  const params = [];

  if (status && ORDER_STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${String(q).trim()}%`;
    where.push('(order_code LIKE ? OR customer_name LIKE ? OR phone LIKE ?)');
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = LIST_SORTS[sort] || LIST_SORTS.newest;
  const per = Math.min(100, Math.max(1, Number(perPage) || 25));
  const pg = Math.max(1, Number(page) || 1);

  const total = Number(get(`SELECT COUNT(*) AS n FROM orders ${whereSql}`, params)?.n || 0);
  const rows = all(
    `SELECT * FROM orders ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...params, per, (pg - 1) * per]
  ).map(shapeOrder);

  return { items: rows, total, page: pg, perPage: per, pages: Math.max(1, Math.ceil(total / per)) };
}

/** Counts for the admin dashboard tiles. */
export function orderStats() {
  const s = storefront();
  const byStatus = Object.fromEntries(
    all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((r) => [r.status, Number(r.n)])
  );
  const revenueRow = get(
    "SELECT COALESCE(SUM(total),0) AS revenue FROM orders WHERE status != 'cancelled'"
  );
  const todayRow = get(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status != 'cancelled' AND date(created_at) = date('now')"
  );
  const preorderRow = get(
    "SELECT COUNT(*) AS n FROM orders WHERE product_type = 'preorder' AND status NOT IN ('delivered','cancelled')"
  );

  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    open: Object.entries(byStatus)
      .filter(([k]) => k !== 'delivered' && k !== 'cancelled')
      .reduce((sum, [, n]) => sum + n, 0),
    revenue: Number(revenueRow?.revenue || 0),
    todayOrders: Number(todayRow?.n || 0),
    todayRevenue: Number(todayRow?.revenue || 0),
    openPreorders: Number(preorderRow?.n || 0),
    codOutstanding: 0,
    paymentMethods: s.paymentMethods.length,
  };
}
