# AWAJ — China Trends, Delivered to Bangladesh

A complete, production-ready e-commerce website for importing and selling Chinese
products to customers in Bangladesh.

Built around one idea the whole site repeats everywhere: customers either buy
**Ready Stock** already sitting in Bangladesh (1–3 days) or **Pre-Order** something
we source from China for them (7–10 days).

---

## Quick start

```bash
git clone <your-repo> awaj
cd awaj
cp .env.example .env      # optional: sensible defaults work without it
npm install               # installs nothing - the project has zero dependencies
npm run seed              # creates data/awaj.db with 49 demo products
npm run dev               # http://localhost:3000
```

Admin panel: **http://localhost:3000/admin**

The seed prints the admin username and password. Change it immediately:

```bash
npm run admin:password -- --generate     # strong random password
```

### Requirements

- **Node.js 22.5 or newer.** That is the only requirement.
  Node 22.5+ ships `node:sqlite`, which is why this project needs no database
  server and no npm packages at all.
- Nothing else. No Docker, no XAMPP, no build step, no bundler.

---

## Why there are no dependencies

This was a hard requirement: limited laptop storage, no hundreds of packages.
Everything is built into Node or written by hand.

| Need | What is used instead of a package |
|---|---|
| Database | `node:sqlite` (built in), with **FTS5 full-text search** |
| HTTP server | `node:http` |
| Templating | ~40 lines of tagged-template code in `server/lib/utils.js` |
| CSS | One hand-written file, custom properties, no framework |
| Client JS | Native ES modules, no build step, no bundler |
| Password hashing | `node:crypto` scrypt |
| Compression | `node:zlib` gzip + brotli |
| Image resizing | `sharp`, loaded **only if you install it** (see below) |

`npm install` completes in under a second and `node_modules` stays empty.

---

## Project layout

```
awaj/
├─ server/
│  ├─ index.js              HTTP server, router, security headers, sitemap
│  ├─ config.js             environment configuration + BD district list
│  ├─ db/
│  │  ├─ schema.sql         tables, indexes, FTS5 triggers
│  │  ├─ index.js           connection, query helpers, rate limiting
│  │  └─ seed.js            demo catalogue
│  ├─ lib/
│  │  ├─ catalogue.js       search, filters, sorting, product queries
│  │  ├─ cart.js            cart normalisation and server-side pricing
│  │  ├─ orders.js          validation, state machine, tracking
│  │  ├─ settings.js        every configurable value
│  │  ├─ security.js        scrypt, sessions, CSRF, rate limits
│  │  ├─ images.js          upload + WebP pipeline
│  │  ├─ image-search.js    image search providers
│  │  ├─ http.js            router, body parsing, compression
│  │  └─ utils.js           escaping, templating, formatting
│  ├─ routes/               shop.js (storefront), admin.js, index.js
│  └─ views/                layout + components + pages (server-rendered)
├─ public/
│  ├─ css/app.css           storefront styles
│  ├─ css/admin.css         admin styles
│  ├─ js/app.js             cart, search, galleries, countdowns
│  ├─ js/admin.js           admin behaviours
│  └─ img/                  logo, favicon, Open Graph image, placeholder
├─ scripts/
│  ├─ e2e.js                end-to-end HTTP suite
│  ├─ optimize-images.js    WebP generation
│  ├─ set-admin-password.js password tool
│  ├─ check-unused.js       import sweep
│  └─ restart-dev.sh        restart + wait-until-ready helper
├─ test/                    86 unit tests
└─ data/                    SQLite database + uploaded images (git-ignored)
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start normally |
| `npm run seed` | Add demo data if the database is empty |
| `npm run seed:reset` | Wipe products/orders and rebuild the demo catalogue |
| `npm run admin:password -- --generate` | Set a strong random admin password |
| `npm test` | 86 unit tests (catalogue, orders, templates) |
| `npm run e2e` | 218 end-to-end HTTP checks against a running server |
| `npm run images:optimize` | Generate WebP derivatives (needs `sharp`) |

---

## Image optimisation (optional)

By default product images are stored and served as uploaded. To get WebP with
responsive sizes, install `sharp` once:

```bash
npm install sharp        # ~20 MB
npm run images:optimize  # converts existing uploads
```

With `sharp` installed, every upload automatically gets WebP + JPEG at 400, 800
and 1200px plus a blurred preview, and product cards emit a `srcset` so phones
download the 400px file instead of a full-resolution photo.

The admin product form shows a warning when it is not installed, so you always
know which mode you are in.

---

## Configuration

Everything is editable in **Admin → Settings** and takes effect immediately.
Nothing commercial is hard-coded in the templates.

| Setting | Where |
|---|---|
| Delivery charge inside/outside Dhaka | Admin → Settings → Delivery |
| Free-delivery threshold | Admin → Settings → Delivery |
| Ready-stock vs pre-order delivery windows | Admin → Settings → Delivery |
| Payment methods on/off, bKash/Nagad/bank details | Admin → Settings → Payment |
| WhatsApp, phone, email, Facebook, Instagram, TikTok | Admin → Settings → Contact |
| Store name, tagline, description | Admin → Settings → Store identity |
| Shipping, returns, privacy, terms text | Admin → Settings → Policies |
| Products per page, homepage section sizes | Admin → Settings → Display |

`.env` is only for deployment-level settings: `PORT`, `SITE_URL`,
`SESSION_SECRET`, `SECURE_COOKIES`, `DATABASE_FILE`, `IMAGE_SEARCH_API_URL`.

---

## Deploying

1. Set a strong session secret and secure cookies:

   ```bash
   node --eval "console.log(crypto.randomUUID() + crypto.randomUUID())"
   ```

   ```env
   NODE_ENV=production
   SESSION_SECRET=<paste>
   SECURE_COOKIES=1
   SITE_URL=https://your-domain.com
   ```

2. Put a process manager and a TLS terminator in front:

   ```bash
   npm install -g pm2
   pm2 start server/index.js --name awaj
   pm2 save
   ```

   Nginx example:

   ```nginx
   server {
     listen 443 ssl http2;
     server_name your-domain.com;

     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

3. Back up `data/awaj.db` and `data/uploads/` — that is your whole shop.

> The app only trusts `X-Forwarded-For` when `TRUST_PROXY=1`. Behind a reverse
> proxy that terminates real client addresses, set it so rate limiting sees real
> IPs. Without it, all traffic looks like it comes from the proxy.

---

## How the important bits work

### Search

SQLite FTS5 with weighted ranking (title > SKU > keywords > body) and prefix
matching, so `charg` finds "Wireless Charger". Search input is sanitised before
it becomes an FTS5 query, so typing `C++` or `*` searches instead of erroring.
The index is kept in sync by database triggers, so it can never drift.

### Cart and pricing

The cart lives in the browser and is mirrored into an HMAC-signed cookie.
**Nothing in the cart is trusted at checkout**: every product is reloaded from
the database, prices are recomputed from the current catalogue, quantities are
clamped to real stock, and the delivery fee is derived from the district. A
tampered cookie can change what is displayed, never what is charged.

Guest checkout is the default — no account required, because most customers
come from Facebook and want to order in one step.

### Order lifecycle

An explicit state machine controls status changes, so a bug or a crafted
request cannot skip or reverse a step. Ready-stock orders skip the China leg in
tracking automatically. Cancelling returns reserved stock to the shelf. Every
change is appended to a timeline the customer can read with just an order ID
and phone number.

### Image search

Version 1 ships with an offline provider that matches the dominant colour of an
uploaded photo — genuinely useful for fashion and accessories, and it needs no
AI service. `server/lib/image-search.js` defines a provider interface, so
connecting a real visual-search API is a configuration change:

```env
IMAGE_SEARCH_API_URL=https://your-vision-service/search
IMAGE_SEARCH_API_KEY=...
```

If the external service fails, the offline provider takes over rather than
showing an error.

### Security

- scrypt password hashing, constant-time comparison
- HttpOnly + SameSite admin session cookies, rotated on login
- CSRF tokens on every state-changing admin request
- Rate limits on login, checkout, order tracking and image search
- Security headers including a Content-Security-Policy
- Magic-number checks and a whitelist on image uploads
- Path-traversal guard on the static file server
- Parameterised SQL everywhere

### Performance

- Server-rendered HTML, so content is crawlable and works without JavaScript
- gzip/brotli compression built in (homepage: 222 KB → 12 KB)
- Responsive `srcset` images, lazy loading, `fetchpriority` on above-the-fold images
- System font stack — no web font download
- CSS-only star ratings instead of inline SVG per star
- Batched queries, indexed columns, WAL mode

---

## SEO

Clean URLs (`/product/mini-portable-thermal-printer`, `/category/gadgets`),
unique titles and meta descriptions, Open Graph and Twitter cards, breadcrumbs,
Product / ItemList / BreadcrumbList / Organization / WebSite structured data,
`robots.txt` and a `sitemap.xml` generated from the live catalogue, and
`noindex` on cart, checkout, search and admin pages.

---

## Testing

```bash
npm test                    # 86 unit tests
npm run dev                 # in one terminal
npm run e2e                 # 218 end-to-end HTTP checks
```

The unit tests run against a temporary database (set up in `test/setup.js`) and
will refuse to run if that redirect is missing, so they can never truncate your
real data. The end-to-end suite drives the real HTTP surface: browsing, search,
cart, guest checkout, order tracking, admin login, product and order management,
CSRF rejection, input validation, and that delivery charges and payment methods
really are configurable.

---

## Accessibility

Semantic landmarks, a skip link, labelled form fields with inline errors,
keyboard-operable drawer with focus trapping, `aria-pressed` on wishlist
toggles, `aria-live` on toasts, visible focus rings, and
`prefers-reduced-motion` support.

---

## Licence

Private. All rights reserved.
