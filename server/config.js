import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const env = process.env;
const bool = (v, dflt = false) =>
  v === undefined ? dflt : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, dflt) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : dflt;
};

const isProd = env.NODE_ENV === 'production';

/**
 * A dev-only fallback secret. In production we refuse to boot without a real
 * one, because otherwise admin session cookies would be forgeable after a
 * restart.
 */
function resolveSessionSecret() {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 16) return env.SESSION_SECRET;
  if (!isProd) return 'dev-only-insecure-session-secret-change-me';
  console.error(
    '\n[FATAL] SESSION_SECRET is required in production.\n' +
      '  Generate one with:\n' +
      '    node --eval "console.log(crypto.randomUUID() + crypto.randomUUID())"\n' +
      '  then set SESSION_SECRET to that value in your .env file.\n'
  );
  process.exit(1);
}

export const config = {
  isProd,
  port: int(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  corsOrigin: env.CORS_ORIGIN || '*',
  databaseFile: env.DATABASE_FILE || join(root, 'data', 'awaj.db'),
  sessionSecret: resolveSessionSecret(),
  sessionTtlHours: int(env.SESSION_TTL_HOURS, 12),
  secureCookies: bool(env.SECURE_COOKIES, false),
  maintenance: bool(env.MAINTENANCE_MODE, false),

  uploadDir: join(root, 'data', 'uploads'),
  maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 8 * 1024 * 1024), // 8 MB
  maxImagesPerProduct: int(env.MAX_IMAGES_PER_PRODUCT, 8),

  store: {
    name: 'AWAJ',
    tagline: 'China Trends, Delivered to Bangladesh',
    whatsapp: env.WHATSAPP_NUMBER || '8801700000000',
    supportPhone: env.SUPPORT_PHONE || '',
    supportEmail: env.SUPPORT_EMAIL || '',
    facebookUrl: env.FACEBOOK_PAGE_URL || '',
    facebookUsername: env.FACEBOOK_USERNAME || '',
    instagramUrl: env.INSTAGRAM_URL || '',
    tiktokUrl: env.TIKTOK_URL || '',
  },

  delivery: {
    insideDhaka: int(env.DELIVERY_INSIDE_DHAKA, 80),
    outsideDhaka: int(env.DELIVERY_OUTSIDE_DHAKA, 130),
    freeThreshold: int(env.FREE_DELIVERY_THRESHOLD, 0),
  },

  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: env.ADMIN_PASSWORD || '',
  },

  imageSearch: {
    apiUrl: env.IMAGE_SEARCH_API_URL || '',
    apiKey: env.IMAGE_SEARCH_API_KEY || '',
  },
};

/** Bangladesh's 64 districts, used to validate checkout and price delivery. */
export const DISTRICTS = [
  // Division 1 - Dhaka
  'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj',
  'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tongi', 'Tangail',
  // Division 2 - Chattogram
  'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', 'Cox’s Bazar', 'Feni',
  'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati',
  // Division 3 - Rajshahi
  'Bogura', 'Chapainawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi',
  'Sirajganj',
  // Division 4 - Khulna
  'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Jhalokathi', 'Khulna', 'Kushtia',
  'Magura', 'Meherpur', 'Narail', 'Satkhira',
  // Division 5 - Rangpur
  'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh',
  'Rangpur', 'Thakurgaon',
  // Division 6 - Mymensingh
  'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur',
  // Division 7 - Sylhet
  'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet',
  // Division 8 - Barishal
  'Barguna', 'Barishal', 'Bhola', 'Jhalakati', 'Patuakhali', 'Pirojpur',
];

export const INSIDE_DHAKA = new Set([
  'Dhaka', 'Gazipur', 'Narayanganj', 'Narsingdi', 'Munshiganj', 'Manikganj', 'Faridpur', 'Tongi',
]);

/** One-time random id used for cache-busting asset URLs. */
export const BUILD_ID = randomBytes(4).toString('hex');
