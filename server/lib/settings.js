/**
 * Settings service.
 *
 * Every value the owner may want to change lives here (delivery charges,
 * payment methods, contact links, social proof). The storefront reads through
 * this module, so changing a value in Admin > Settings changes the site
 * immediately - nothing is hard-coded in the templates.
 */
import { get, run } from  '../db/index.js';
import { config, INSIDE_DHAKA } from '../config.js';

/** Defaults double as the shape of the settings object. */
const DEFAULTS = {
  'store.name': 'AWAJ',
  'store.tagline': 'China Trends, Delivered to Bangladesh',
  'store.description':
    'AWAJ brings interesting and trending products from China to customers in Bangladesh. ' +
    'Buy Ready Stock products for fast local delivery, or pre-order selected products ' +
    'with an estimated delivery time of 7-10 days.',

  'contact.whatsapp': config.store.whatsapp,
  'contact.support_phone': config.store.supportPhone,
  'contact.support_email': config.store.supportEmail,
  'contact.facebook_url': config.store.facebookUrl,
  'contact.facebook_username': config.store.facebookUsername,
  'contact.instagram_url': config.store.instagramUrl,
  'contact.tiktok_url': config.store.tiktokUrl,
  'contact.show_facebook': true,

  'delivery.inside_dhaka': config.delivery.insideDhaka,
  'delivery.outside_dhaka': config.delivery.outsideDhaka,
  'delivery.free_threshold': config.delivery.freeThreshold,
  'delivery.ready_stock_days_min': 1,
  'delivery.ready_stock_days_max': 3,
  'delivery.preorder_days_min': 7,
  'delivery.preorder_days_max': 10,
  'delivery.preorder_note':
    'Pre-order products are sourced from China after order confirmation. Delivery normally takes ' +
    'approximately 7-10 days, depending on shipping and customs.',

  'payment.cod.enabled': true,
  'payment.cod.label': 'Cash on Delivery',
  'payment.bkash.enabled': true,
  'payment.bkash.label': 'bKash',
  'payment.bkash.number': '',
  'payment.nagad.enabled': true,
  'payment.nagad.label': 'Nagad',
  'payment.nagad.number': '',
  'payment.bank.enabled': true,
  'payment.bank.label': 'Bank Transfer',
  'payment.bank.details': '',
  'payment.instructions':
    'After placing your order you will receive a confirmation. For bKash/Nagad/bank transfers, ' +
    'send the amount using the number we share, then submit the transaction ID in your order ' +
    'tracking page or on WhatsApp.',

  'social.facebook_follow_text': 'Follow AWAJ on Facebook',
  'social.facebook_chat_text': 'Chat on Facebook',

  'content.return_policy':
    'Ready Stock products can be exchanged within 7 days of delivery if unused and in original ' +
    'packaging. Pre-order (imported) products can only be exchanged if the item is defective or ' +
    'incorrectly shipped, since they are sourced specifically for your order. Refunds are not ' +
    'available for change-of-mind on imported goods. Cash on Delivery orders may be refused at ' +
    'delivery, in which case the product returns to our stock.',
  'content.shipping_policy':
    'Ready Stock orders are dispatched from Bangladesh within 24-48 hours and typically arrive ' +
    'in 1-3 days. Pre-Order items are purchased from China after your order is confirmed, which ' +
    'normally takes 7-10 days to reach Bangladesh. Any customs duty for imported goods is ' +
    'included in the listed price where applicable. Delivery charges are calculated by district ' +
    'and shown clearly before you place the order.',
  'content.privacy_policy':
    'We collect only the information needed to deliver your order: name, phone/WhatsApp number, ' +
    'delivery address and district. Your data is never sold to third parties. Order lookup uses ' +
    'your order ID plus phone number, so no account is required and we hold no password for you.',
  'content.terms':
    'Product images and descriptions are provided for identification. Prices are in Bangladeshi ' +
    'Taka (BDT) and include applicable charges. Pre-Order delivery estimates are estimates, not ' +
    'guarantees, and may extend during holidays, customs inspection or courier delays. By placing ' +
    'an order you confirm the delivery address is correct and reachable by phone.',

  'seo.default_description':
    'Shop trending gadgets, fashion, beauty and home products from China. Ready Stock for fast ' +
    'delivery in Bangladesh, or Pre-Order from China in 7-10 days. Cash on Delivery available.',
  'seo.default_title': 'AWAJ - China Trends, Delivered to Bangladesh',

  'site.maintenance': false,
  'site.show_hot_deals': true,
  'site.home_ready_stock_limit': 10,
  'site.home_preorder_limit': 10,
  'site.products_per_page': 24,
  'site.free_shipping_message': '',
};

/** Insert any missing key so `getSetting` never has to guess a type. */
export function ensureDefaults() {
  const stmt =
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING';
  for (const [key, value] of Object.entries(DEFAULTS)) {
    run(stmt, [key, JSON.stringify(value)]);
  }
}

function decode(raw, fallback) {
  if (raw === undefined || raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key dotted settings key
 * @param {any} [fallback]
 */
export function getSetting(key, fallback = undefined) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback ?? DEFAULTS[key];
  return decode(row.value, fallback ?? DEFAULTS[key]);
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value)]
  );
  cache = null;
}

export function getAllSettings() {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULTS)) out[k] = getSetting(k);
  return out;
}

export function setManySettings(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (!(key in DEFAULTS)) continue; // ignore unknown keys
    setSetting(key, value);
  }
}

/* -------------------------------------------------------------------------- */
/* Derived, frequently-used views                                              */
/* -------------------------------------------------------------------------- */

let cache = null;
let cachedAt = 0;

/** Contact + payment + delivery config, memoised for ~5s. */
export function storefront() {
  const now = Date.now();
  if (cache && now - cachedAt < 5000) return cache;

  const s = {};
  for (const key of Object.keys(DEFAULTS)) s[key] = getSetting(key);

  cache = {
    ...s,
    /** Payment methods the owner has switched on, in display order. */
    paymentMethods: [
      { id: 'cod', label: s['payment.cod.label'], enabled: !!s['payment.cod.enabled'], hint: 'Pay when you receive the parcel' },
      { id: 'bkash', label: s['payment.bkash.label'], enabled: !!s['payment.bkash.enabled'], hint: s['payment.bkash.number'] ? `Send to ${s['payment.bkash.number']}` : 'Mobile wallet' },
      { id: 'nagad', label: s['payment.nagad.label'], enabled: !!s['payment.nagad.enabled'], hint: s['payment.nagad.number'] ? `Send to ${s['payment.nagad.number']}` : 'Mobile wallet' },
      { id: 'bank', label: s['payment.bank.label'], enabled: !!s['payment.bank.enabled'], hint: s['payment.bank.details'] || 'Bank transfer' },
    ].filter((m) => m.enabled),
  };
  cachedAt = now;
  return cache;
}

export function invalidateSettingsCache() {
  cache = null;
  cachedAt = 0;
}

/** Delivery fee for a district, honouring the free-shipping threshold. */
export function deliveryFee(district, subtotal) {
  const s = storefront();
  const threshold = Number(s['delivery.free_threshold']) || 0;
  if (threshold > 0 && subtotal >= threshold) return 0;
  const inside = INSIDE_DHAKA.has(String(district || '').trim());
  return Number(inside ? s['delivery.inside_dhaka'] : s['delivery.outside_dhaka']) || 0;
}
