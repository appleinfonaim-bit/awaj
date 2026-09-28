/**
 * Seed the database with a realistic starter catalogue.
 *
 *   npm run seed          # add demo data if the database is empty
 *   npm run seed:reset    # wipe products/orders and rebuild from scratch
 *
 * Demo images are generated as small optimised SVGs so the storefront looks
 * complete without downloading megabytes of stock photography.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, get, all, tx, paths } from './index.js';
import { config } from '../config.js';
import { ensureDefaults, storefront } from  '../lib/settings.js';
import { hashPassword } from '../lib/security.js';
import { placeholderSvg } from  '../lib/images.js';
import { slugify } from '../lib/utils.js';

/* -------------------------------------------------------------------------- */
/* Catalogue data                                                              */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  ['gadgets', 'Gadgets', 'Phones, accessories & smart devices', 'indigo', 1],
  ['electronics', 'Electronics', 'Audio, chargers & everyday tech', 'slate', 2],
  ['fashion', 'Fashion', 'Trending clothing from China', 'rose', 3],
  ['bags', 'Bags', 'Backpacks, slings & travel bags', 'amber', 4],
  ['shoes', 'Shoes', 'Sneakers, sandals & sports shoes', 'violet', 5],
  ['beauty', 'Beauty', 'Skincare, hair & personal care', 'teal', 6],
  ['home-kitchen', 'Home & Kitchen', 'Useful household products', 'amber', 7],
  ['mobile-accessories', 'Mobile Accessories', 'Cases, cables, chargers & holders', 'indigo', 8],
  ['trending', 'Trending', 'What everyone is buying right now', 'rose', 9],
  ['lifestyle', 'Lifestyle', 'Everyday carry and small upgrades', 'teal', 10],
];

/**
 * Each product: [title, category, type, price, compare, stock, sold, rating,
 *                ratingCount, tone, featured, trending, isNew, keywords, tagline]
 */
const PRODUCTS = [
  ['Mini Portable Thermal Printer', 'gadgets', 'ready_stock', 1850, 2200, 24, 2300, 4.8, 412, 'indigo', 1, 1, 0,
    'bluetooth printer, thermal label printer, pocket printer, receipt printer', 'Print receipts and labels from your phone in seconds.'],
  ['Fast Wireless Charger 15W', 'mobile-accessories', 'ready_stock', 650, 900, 60, 5400, 4.7, 890, 'slate', 1, 1, 0,
    'wireless charger, charging pad, fast charge, magsafe charger', 'Qi fast charging for phones and earbuds.'],
  ['MagSafe Magnetic Phone Holder', 'mobile-accessories', 'ready_stock', 420, 550, 45, 4100, 4.6, 620, 'indigo', 0, 1, 0,
    'phone holder, car mount, magsafe holder, magnetic mount', 'Strong magnetic grip for car and desk.'],
  ['LED Rechargeable Table Lamp', 'home-kitchen', 'ready_stock', 980, 1250, 18, 1500, 4.5, 240, 'amber', 0, 1, 0,
    'led lamp, table lamp, rechargeable light, bedside lamp', 'Three brightness levels, USB rechargeable.'],
  ['Portable Bluetooth Speaker', 'electronics', 'ready_stock', 1450, 1800, 22, 3200, 4.6, 380, 'teal', 1, 1, 0,
    'bluetooth speaker, portable speaker, waterproof speaker', 'Pocket-sized with surprisingly loud sound.'],
  ['USB-C Fast Charger 65W', 'electronics', 'ready_stock', 1150, null, 35, 2100, 4.7, 310, 'slate', 0, 0, 0,
    'usb c charger, 65w charger, laptop charger, fast charger', 'Charges a laptop, tablet and phone together.'],
  ['Collapsible Silicone Food Container Set', 'home-kitchen', 'ready_stock', 890, 1100, 15, 890, 4.4, 150, 'teal', 0, 0, 0,
    'food container, lunch box, silicone container', 'Space-saving set of five airtight containers.'],
  ['Anti-Drip Water Bottle 750ml', 'lifestyle', 'ready_stock', 690, 850, 28, 1900, 4.5, 280, 'teal', 0, 0, 0,
    'water bottle, sports bottle, leak proof bottle', 'One-press lid, keeps your bag dry.'],
  ['Velvet Jewellery Organiser Box', 'lifestyle', 'ready_stock', 1250, 1600, 12, 760, 4.6, 130, 'rose', 0, 0, 0,
    'jewellery box, organiser, storage box, ring holder', 'Keeps rings and earrings untangled.'],
  ['Stainless Steel Insulated Flask 500ml', 'home-kitchen', 'ready_stock', 950, 1150, 26, 1400, 4.7, 260, 'slate', 0, 0, 1,
    'water flask, insulated bottle, thermos, steel bottle', 'Keeps drinks cold 24 hours.'],
  ['Ultra Slim Power Bank 10000mAh', 'mobile-accessories', 'ready_stock', 1650, 1950, 20, 3800, 4.6, 520, 'indigo', 1, 1, 0,
    'power bank, portable charger, battery pack, travel charger', 'Pocket-size backup for a full day.'],
  ['Smart LED Strip Lights 5m', 'home-kitchen', 'ready_stock', 750, 950, 30, 2600, 4.5, 340, 'violet', 0, 1, 0,
    'led strip, room lights, ambient lighting, rgb lights', 'App and voice controlled.'],
  ['Portable Mini Projector 1080p', 'gadgets', 'preorder', 3250, 4200, 0, 2400, 4.7, 430, 'indigo', 1, 1, 0,
    'mini projector, portable projector, home theatre, beamer', 'Cinema-size picture from a small box.'],
  ['Wireless Mini Keyboard with Mouse', 'electronics', 'preorder', 1450, 1850, 0, 1100, 4.4, 190, 'slate', 0, 1, 0,
    'mini keyboard, wireless keyboard, travel keyboard, mouse', 'Pocket-sized for laptop and tablet.'],
  ['3D Floating LED Globe Lamp', 'home-kitchen', 'preorder', 1890, 2400, 0, 890, 4.6, 160, 'violet', 0, 1, 0,
    'led lamp, floating globe, decor light, mood lamp', 'Levitating-looking globe light.'],
  ['Automatic Pet Hair Remover', 'home-kitchen', 'preorder', 1650, 2100, 0, 720, 4.3, 120, 'teal', 0, 0, 0,
    'pet hair remover, lint remover, clothes cleaner, fabric shaver', 'Revives faded clothes in minutes.'],
  ['Leather Sling Crossbody Bag', 'bags', 'preorder', 2200, 2800, 0, 640, 4.6, 140, 'amber', 1, 1, 0,
    'crossbody bag, sling bag, leather bag, shoulder bag', 'Compact everyday bag with hidden pockets.'],
  ['Minimalist Leather Card Wallet', 'bags', 'preorder', 890, 1200, 0, 980, 4.5, 210, 'amber', 0, 0, 0,
    'card wallet, slim wallet, leather wallet, money holder', 'RFID blocking, holds 8 cards.'],
  ['Canvas Laptop Backpack 15.6 inch', 'bags', 'preorder', 2450, 3200, 0, 520, 4.7, 130, 'slate', 0, 1, 0,
    'laptop backpack, canvas bag, school bag, travel backpack', 'Water-resistant with a padded sleeve.'],
  ['Ultraboost Running Shoes', 'shoes', 'preorder', 3200, 4200, 0, 1100, 4.6, 260, 'violet', 1, 1, 0,
    'running shoes, sports shoes, sneakers, gym shoes', 'Lightweight cushioning for daily runs.'],
  ['Casual Canvas Sneakers', 'shoes', 'preorder', 1850, 2400, 0, 860, 4.4, 180, 'teal', 0, 0, 0,
    'canvas sneakers, casual shoes, flat shoes', 'Everyday comfort, easy to clean.'],
  ['Korean Skin Care Routine Set', 'beauty', 'preorder', 2650, 3400, 0, 1400, 4.8, 380, 'rose', 1, 1, 0,
    'skin care set, korean skincare, face serum, beauty set', 'Five-step routine for glowing skin.'],
  ['Electric Hair Straightener Brush', 'beauty', 'preorder', 1950, 2600, 0, 780, 4.3, 140, 'rose', 0, 1, 0,
    'hair straightener, hair brush, styling tool, hair iron', 'Straightens while you brush.'],
  ['Makeup Organiser Set with Lights', 'beauty', 'preorder', 2250, 2900, 0, 520, 4.5, 110, 'amber', 0, 0, 0,
    'makeup organiser, cosmetic storage, vanity box', 'Rotating stand with LED mirror.'],
  ['Niacinamide Vitamin C Serum 30ml', 'beauty', 'ready_stock', 780, 1050, 40, 2900, 4.7, 460, 'teal', 0, 1, 0,
    'face serum, vitamin c serum, niacinamide, skin serum', 'Brightens dull skin in four weeks.'],
  ['Ceramic Non-Stick Frying Pan 26cm', 'home-kitchen', 'preorder', 1650, 2100, 0, 690, 4.6, 150, 'amber', 0, 0, 0,
    'frying pan, non stick pan, ceramic cookware, kitchen pan', 'PFAS-free coating, oven safe.'],
  ['Digital Kitchen Scale 10kg', 'home-kitchen', 'preorder', 890, 1150, 0, 1120, 4.5, 230, 'slate', 0, 0, 0,
    'kitchen scale, weighing scale, digital scale, food scale', 'Accurate to 1 gram.'],
  ['Garlic Press & Kitchen Tool Set', 'home-kitchen', 'preorder', 620, 850, 0, 540, 4.2, 90, 'teal', 0, 0, 0,
    'garlic press, kitchen tools, cooking set, grater', 'Six tools in one rotating stand.'],
  ['Wireless Charging Pad Stand', 'mobile-accessories', 'preorder', 1250, 1600, 0, 480, 4.4, 95, 'indigo', 0, 0, 1,
    'charging stand, wireless charger stand, phone dock', 'Charges in portrait and landscape.'],
  ['Car Vacuum Cleaner 120W', 'electronics', 'preorder', 1450, 1900, 0, 910, 4.3, 175, 'slate', 0, 1, 0,
    'car vacuum, handheld vacuum, car cleaner, dustbuster', 'Strong suction for car and keyboard.'],
  ['Mini Thermal Label Maker', 'gadgets', 'preorder', 1650, 2200, 0, 1320, 4.6, 280, 'indigo', 0, 0, 0,
    'label maker, thermal printer, price tag gun, label printer', 'Prints 12mm labels from your phone.'],
  ['Pet Self-Cleaning Slicker Brush', 'lifestyle', 'preorder', 750, 990, 0, 420, 4.3, 80, 'teal', 0, 0, 0,
    'pet brush, slicker brush, dog brush, cat brush', 'Retracts the bristles when not in use.'],
  ['Rechargeable Neck Fan', 'lifestyle', 'preorder', 1350, 1750, 0, 1050, 4.4, 200, 'violet', 0, 1, 0,
    'neck fan, hands free fan, portable fan, summer fan', 'Three speeds, bladeless and quiet.'],
  ['Folding Laptop Table Bed Tray', 'lifestyle', 'preorder', 1150, 1500, 0, 330, 4.2, 65, 'slate', 0, 0, 0,
    'bed tray, laptop table, folding table, breakfast tray', 'Sturdy legs, folds flat.'],
  ['RGB Gaming Mouse Pad XL', 'electronics', 'ready_stock', 950, 1250, 22, 1600, 4.5, 300, 'violet', 0, 0, 0,
    'gaming mouse pad, rgb mousepad, desk mat, extended pad', '18 lighting modes, stitched edges.'],
  ['60W GaN Fast Charger 3-in-1', 'electronics', 'ready_stock', 2150, 2700, 14, 1180, 4.8, 320, 'indigo', 1, 1, 1,
    'gan charger, 3 in 1 charger, fast charger, travel adapter', 'Charges phone, watch and earbuds at once.'],
  ['Compact Travel Umbrella', 'lifestyle', 'ready_stock', 690, 900, 33, 1250, 4.4, 210, 'slate', 0, 0, 0,
    'travel umbrella, compact umbrella, auto umbrella', 'Windproof, opens one-handed.'],
  ['Trendy Crossbody Phone Bag', 'bags', 'ready_stock', 850, 1100, 19, 1420, 4.5, 240, 'rose', 0, 1, 0,
    'phone bag, crossbody bag, mini bag, travel pouch', 'Wearable phone pouch for short trips.'],
  ['Scented Soy Candle Set of 3', 'home-kitchen', 'ready_stock', 1250, 1600, 16, 980, 4.6, 190, 'amber', 0, 0, 0,
    'soy candle, scented candle, home fragrance, candle set', 'Up to 40 hours of clean burn.'],
  ['Wireless Charging Stand for Desk', 'mobile-accessories', 'ready_stock', 1100, 1350, 17, 830, 4.4, 160, 'teal', 0, 0, 0,
    'charging stand, phone stand, wireless charger, desk dock', 'Keeps your desk tidy.'],
  ['Sunset Projection Lamp', 'home-kitchen', 'ready_stock', 890, 1150, 24, 1560, 4.7, 280, 'rose', 0, 1, 0,
    'sunset lamp, projection lamp, mood light, instagram lamp', 'The viral sunset glow for photos.'],
  ['Travel Organiser Bag Set', 'bags', 'preorder', 1250, 1650, 0, 740, 4.5, 150, 'slate', 0, 0, 0,
    'travel organiser, packing cubes, toiletry bag, travel bag', 'Four sizes, cabin-friendly.'],
  ['Portable Blender Smoothie Maker', 'home-kitchen', 'preorder', 2250, 2900, 0, 880, 4.3, 170, 'teal', 0, 1, 0,
    'portable blender, smoothie maker, usb blender, travel blender', 'USB rechargeable, six blades.'],
  ['LED Strip Light Bedroom Set', 'home-kitchen', 'preorder', 1450, 1850, 0, 1120, 4.4, 210, 'violet', 0, 0, 0,
    'led strip lights, bedroom lights, ambient light, music sync', 'Music-reactive lighting.'],
  ['Everyday Linen Shirt', 'fashion', 'preorder', 1850, 2400, 0, 460, 4.5, 95, 'slate', 0, 0, 0,
    'linen shirt, casual shirt, summer shirt, mens shirt', 'Breathable, relaxed fit.'],
  ['Oversized Graphic T-Shirt', 'fashion', 'preorder', 950, 1250, 0, 620, 4.3, 120, 'rose', 0, 0, 0,
    'graphic tee, oversized tshirt, casual tshirt, cotton shirt', 'Heavyweight 220gsm cotton.'],
  ['Waterproof Crossbody Sling Bag', 'bags', 'ready_stock', 1250, 1600, 21, 1080, 4.5, 190, 'indigo', 0, 1, 0,
    'sling bag, waterproof bag, running bag, chest bag', 'Water-resistant with a hidden passport pocket.'],
  ['Smart LED Bathroom Mirror', 'home-kitchen', 'preorder', 3200, 4200, 0, 380, 4.4, 75, 'slate', 0, 0, 0,
    'led mirror, bathroom mirror, vanity mirror, lighted mirror', 'Touch dimming and fog removal.'],
  ['Eco Bamboo Cutlery Set', 'home-kitchen', 'ready_stock', 690, 890, 27, 740, 4.3, 130, 'teal', 0, 0, 0,
    'bamboo cutlery, wooden spoons, reusable cutlery, kitchen set', 'Reusable, biodegradable, dishwasher safe.'],
];

const REVIEWS = [
  ['Rahim H.', 5, 'Exactly as pictured. Delivery was quick and the packaging was solid.'],
  ['Nusrat J.', 5, 'Very good quality for the price. I would order again.'],
  ['Tanvir A.', 4, 'Good product overall. Took an extra day to arrive but worth it.'],
  ['Sadia K.', 5, 'Customer support answered on WhatsApp within minutes. Highly recommended.'],
  ['Imran S.', 4, 'Nice build quality. Slightly smaller than I expected but still useful.'],
  ['Farhana R.', 5, 'Bought this for my brother and he loved it. Great price.'],
];

/* -------------------------------------------------------------------------- */
/* Seed steps                                                                  */
/* -------------------------------------------------------------------------- */

async function seedImages() {
  const dir = join(paths.uploads, 'demo');
  mkdirSync(dir, { recursive: true });

  for (const [i, p] of PRODUCTS.entries()) {
    const tone = p[9];
    const label = p[0].split(' ').slice(0, 2).join(' ');
    const svg = placeholderSvg({ label, tone, seed: i + 1 });
    const rel = `demo/${slugify(p[0])}.svg`;
    const abs = join(paths.uploads, rel);
    if (!existsSync(abs)) writeFileSync(abs, svg, 'utf8');
  }
  return true;
}

function seedCategories() {
  CATEGORIES.forEach(([slug, name, tagline, , sort], i) => {
    const exists = get('SELECT id FROM categories WHERE slug = ?', [slug]);
    if (exists) return;
    run(
      `INSERT INTO categories (slug, name, tagline, description, image, sort_order, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      [slug, name, tagline, `${tagline}. Curated by AWAJ.`, null, sort]
    );
  });
}

function seedProducts() {
  const catId = Object.fromEntries(all('SELECT id, slug FROM categories').map((c) => [c.slug, c.id]));

  PRODUCTS.forEach((p, index) => {
    const [title, cat, type, price, compare, stock, sold, rating, ratingCount, tone, featured, trending, isNew, keywords, tagline] = p;
    const slug = slugify(title);
    if (get('SELECT id FROM products WHERE slug = ?', [slug])) return;

    const isDeal = Boolean(featured && index % 3 === 0);
    const rgb = rgbOf(dominantFor(tone));

    const info = run(
      `INSERT INTO products (
         slug, sku, title, subtitle, description, specs, highlights,
         category_id, product_type, price, compare_price, stock_qty, low_stock_at,
         delivery_min_days, delivery_max_days,
         is_active, is_featured, is_trending, is_new,
         is_hot_deal, deal_stock_limit, deal_ends_at,
         rating_avg, rating_count, sold_count, keywords,
         color_hex, color_r, color_g, color_b,
         origin_note, supplier_ref, created_at, updated_at
       ) VALUES (
         :slug, :sku, :title, :subtitle, :description, :specs, :highlights,
         :category_id, :product_type, :price, :compare_price, :stock_qty, :low_stock_at,
         :delivery_min_days, :delivery_max_days,
         1, :is_featured, :is_trending, :is_new,
         :is_hot_deal, :deal_stock_limit, :deal_ends_at,
         :rating_avg, :rating_count, :sold_count, :keywords,
         :color_hex, :color_r, :color_g, :color_b,
         :origin_note, :supplier_ref, datetime('now', :created_offset), datetime('now')
       )`,
      {
        slug,
        sku: `AWJ-${1001 + index}`,
        title,
        subtitle: tagline,
        description: buildDescription(title, tagline, type),
        specs: JSON.stringify(buildSpecs(type, cat)),
        highlights: JSON.stringify(buildHighlights(title, type)),
        category_id: catId[cat] ?? null,
        product_type: type,
        price,
        compare_price: compare ?? null,
        stock_qty: stock,
        low_stock_at: type === 'ready_stock' ? 5 : 0,
        delivery_min_days: type === 'preorder' ? 7 : 1,
        delivery_max_days: type === 'preorder' ? 10 : 3,
        is_featured: featured,
        is_trending: trending,
        is_new: isNew,
        is_hot_deal: isDeal ? 1 : 0,
        deal_stock_limit: isDeal ? 8 : null,
        deal_ends_at: isDeal
          ? new Date(Date.now() + (2 + (index % 8)) * 864e5).toISOString()
          : null,
        rating_avg: rating,
        rating_count: ratingCount,
        sold_count: sold,
        keywords: JSON.stringify(keywords.split(',').map((k) => k.trim()).filter(Boolean)),
        color_hex: dominantFor(tone),
        color_r: rgb[0],
        color_g: rgb[1],
        color_b: rgb[2],
        origin_note: type === 'preorder' ? 'Sourced from China after order confirmation.' : null,
        supplier_ref: type === 'preorder' ? `CN-${1000 + index * 7}` : null,
        created_offset: `-${index * 3} days`,
      }
    );

    const productId = Number(info.lastInsertRowid);
    const rel = `demo/${slug}.svg`;

    run(
      `INSERT INTO product_images (product_id, path, width, height, alt, sort_order) VALUES (?,?,?,?,?,?)`,
      [productId, rel, 200, 200, title, 0]
    );
    // A couple of plausible variants for products where options make sense.
    if (/shirt|tee|shoes|sneaker|bottle|flask|wallet|watch/i.test(title)) {
      const options = /shirt|tee/i.test(title)
        ? ['S', 'M', 'L', 'XL']
        : /shoe|sneaker/i.test(title)
          ? ['38', '39', '40', '41', '42', '43']
          : ['500ml', '750ml', '1000ml'];
      options.forEach((value, i) => {
        run(
          `INSERT INTO product_variants (product_id, name, value, price_delta, stock_qty, sku, sort_order)
           VALUES (?,?,?,?,?,?,?)`,
          [productId, /shoe/i.test(value) ? 'Size' : /ml$/i.test(value) ? 'Capacity' : 'Size', value, 0,
            type === 'ready_stock' ? Math.max(1, Math.floor(stock / options.length)) : 0, null, i]
        );
      });
    }

    // Approved reviews for a subset of products.
    if (index % 3 === 0) {
      for (let r = 0; r < 2; r += 1) {
        const [author, stars, body] = REVIEWS[(index + r) % REVIEWS.length];
        run(
          `INSERT INTO reviews (product_id, author, rating, body, is_approved, created_at)
           VALUES (?,?,?,?,1,datetime('now', ?))`,
          [productId, author, stars, body, `-${r * 6 + 2} days`]
        );
      }
    }
  });
}

function dominantFor(tone) {
  return {
    indigo: '#3b3f8f',
    slate: '#5b6b80',
    teal: '#2f7f74',
    amber: '#b5822a',
    rose: '#b2566c',
    violet: '#7a4f9e',
  }[tone] || '#5b6b80';
}

function rgbOf(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function buildDescription(title, tagline, type) {
  const source = type === 'preorder'
    ? 'This item is imported from China once your order is confirmed.'
    : 'This item is already in our Bangladesh warehouse.';
  return [
    `<p>${tagline} The <strong>${title}</strong> is one of the products our customers keep coming back for.</p>`,
    `<p>${source} Every unit is checked before it is packed, so you receive exactly what you ordered.</p>`,
    type === 'preorder'
      ? '<p><strong>Please note:</strong> pre-order products are sourced after your order is placed. Delivery normally takes 7-10 days depending on shipping and customs clearance.</p>'
      : '<p><strong>Good news:</strong> ready stock is dispatched from Bangladesh, so you can start using it within 1-3 days.</p>',
    '<h3>Why customers choose it</h3>',
    '<ul><li>Reliable quality checked before dispatch</li><li>Cash on Delivery available nationwide</li><li>Support on WhatsApp before and after your order</li></ul>',
  ].join('\n');
}

function buildSpecs(type, cat) {
  const base = {
    'Brand': 'AWAJ Selection',
    'Origin': type === 'preorder' ? 'China' : 'Imported / stocked in Bangladesh',
    'Warranty': type === 'preorder' ? '7 days against manufacturing defects' : '7 days against manufacturing defects',
    'Payment': 'Cash on Delivery, bKash, Nagad, Bank transfer',
  };
  if (/shoe|sneaker/i.test(cat)) return { ...base, 'Upper': 'Engineered mesh', 'Sole': 'Rubber outsole', 'Use': 'Daily wear, gym' };
  if (/beauty|skin|serum|makeup/i.test(cat)) return { ...base, 'Volume': 'As pictured', 'Shelf life': '24 months', 'Skin type': 'All skin types' };
  if (/bag|wallet/i.test(cat)) return { ...base, 'Material': 'PU leather / canvas', 'Compartments': 'Multiple', 'Fits': 'Phone, cards, essentials' };
  return { ...base, 'Material': 'Durable consumer material', 'Colour': 'As shown in image', 'Package': '1 piece' };
}

function buildHighlights(title, type) {
  const base = [`${title} - quality checked before dispatch`];
  if (type === 'preorder') base.push('Imported from China after order confirmation');
  else base.push('Ready stock in Bangladesh');
  base.push('Cash on Delivery available');
  return base;
}

function seedAdmin() {
  const count = get('SELECT COUNT(*) AS n FROM admin_users').n;
  if (count > 0) return null;

  const password = config.admin.password || 'awaj-admin-2024';
  run(
    'INSERT INTO admin_users (username, password_hash, role, is_active) VALUES (?,?,?,1)',
    [config.admin.username, hashPassword(password), 'owner']
  );
  return { username: config.admin.username, password, generated: !config.admin.password };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const reset = process.argv.includes('--reset');

console.log('\n  AWAJ - database setup\n  ' + '-'.repeat(40));

tx(() => {
  if (reset) {
    console.log('  Resetting catalogue and orders...');
    for (const table of ['order_events', 'order_items', 'orders', 'reviews', 'product_images', 'product_variants', 'products', 'categories']) {
      run(`DELETE FROM ${table}`);
      run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
    }
  }

  ensureDefaults();
  seedCategories();
  seedProducts();

  const admin = seedAdmin();
  if (admin) {
    console.log(`\n  Admin account created`);
    console.log(`    username: ${admin.username}`);
    console.log(`    password: ${admin.password}`);
    if (admin.generated) {
      console.log(`\n  !! This is a default password. Change it immediately:`);
      console.log(`     Admin > Settings, or run: npm run admin:password`);
    }
  }
});

await seedImages();

// Verify the image pipeline can serve derivatives if sharp is available.
if (await import('../lib/images.js').then((m) => m.isOptimisationAvailable())) {
  console.log('  Image optimisation: sharp detected (WebP derivatives enabled)');
} else {
  console.log('  Image optimisation: running without sharp (originals served as-is)');
  console.log('    For WebP + responsive sizes, run:  npm install sharp');
}

const products = get('SELECT COUNT(*) AS n FROM products').n;
const categories = get('SELECT COUNT(*) AS n FROM categories').n;
const ready = get("SELECT COUNT(*) AS n FROM products WHERE product_type='ready_stock'").n;
const pre = get("SELECT COUNT(*) AS n FROM products WHERE product_type='preorder'").n;

console.log('  ' + '-'.repeat(40));
console.log(`  ${products} products (${ready} ready stock, ${pre} pre-order)`);
console.log(`  ${categories} categories`);
console.log(`\n  Start the site:  npm run dev\n  Admin panel:    http://localhost:${config.port}/admin\n`);
