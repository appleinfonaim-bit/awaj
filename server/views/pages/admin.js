/**
 * Admin panel views.
 *
 * Server-rendered like the storefront: a small client script adds
 * auto-submitting forms, image previews and a confirm step for deletes.
 * Admin pages share the same layout so security headers stay consistent.
 */
import { html, raw, esc, taka, formatDateTime, formatDate, compactCount, url as buildUrl } from '../../lib/utils.js';
import { icon, emptyState, alert } from  '../components/ui.js';
import { STATUS_LABELS } from '../../lib/orders.js';
import { whatsappLink } from '../components/header.js';
import { config } from '../../config.js';

const TABS = [
  ['/admin', 'Dashboard', 'chart'],
  ['/admin/products', 'Products', 'grid'],
  ['/admin/orders', 'Orders', 'package'],
  ['/admin/categories', 'Categories', 'tag'],
  ['/admin/settings', 'Settings', 'settings'],
];

export function adminLayout({ title, ctx, body, active = '', csrf, user, wide = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | AWAJ Admin</title>
<meta name="robots" content="noindex,nofollow,noarchive">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/admin.css">
<link rel="stylesheet" href="/css/app.css">
<script>
  window.AWAJ_ADMIN = { csrf: ${JSON.stringify(csrf)} };
</script>
</head>
<body class="admin">
<header class="abar">
  <div class="abar__inner">
    <a class="abar__brand" href="/admin"><span class="logo__mark">A</span> AWAJ <em>Admin</em></a>
    <nav class="abar__nav">
      ${TABS.map(
        ([href, label, ic]) => html`
          <a href="${href}" class="abar__link ${active === href ? 'is-active' : ''}">${icon(ic, { size: 16 })} ${label}</a>
        `
      )}
    </nav>
    <div class="abar__right">
      <a class="abar__view" href="/" target="_blank" rel="noopener">${icon('eye', { size: 15 })} View site</a>
      <form method="post" action="/admin/logout" class="abar__logout">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <button type="submit" class="abar__link">${icon('logout', { size: 15 })} ${user.username}</button>
      </form>
    </div>
  </div>
</header>
<main class="amain ${wide ? 'amain--wide' : ''}">
${body}
</main>
<div class="toast" data-toast hidden></div>
<script type="module" src="/js/admin.js"></script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

export function adminLoginPage({ error = '', username = '', next = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Login | AWAJ</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
<style>
  body{display:grid;place-items:center;min-height:100vh;background:var(--surface-2);margin:0;padding:24px}
  .login{width:100%;max-width:400px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:var(--shadow-lg)}
  .login h1{font-size:20px;margin:0 0 4px}
  .login p.sub{color:var(--muted);margin:0 0 24px;font-size:14px}
  .login .field{margin-bottom:16px}
  .login .btn{width:100%;justify-content:center}
  .login__brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}
  .login__hint{margin-top:20px;padding:12px;background:var(--surface-2);border-radius:10px;font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<form class="login" method="post" action="/admin/login">
  <input type="hidden" name="next" value="${esc(next)}">
  <div class="login__brand"><span class="logo__mark">A</span><strong style="font-size:18px">AWAJ Admin</strong></div>
  <h1>Sign in</h1>
  <p class="sub">Manage products, orders and store settings.</p>
  ${error ? `<div class="alert alert--error" style="margin-bottom:16px">${error}</div>` : ''}
  <label class="field">
    <span class="field__label">Username</span>
    <input type="text" name="username" value="${esc(username)}" required autocomplete="username" autofocus>
  </label>
  <label class="field">
    <span class="field__label">Password</span>
    <input type="password" name="password" required autocomplete="current-password">
  </label>
  <button class="btn btn--primary btn--block btn--lg" type="submit">${icon('logout', { size: 17 })} Sign in</button>
  <p class="login__hint">Sessions expire after ${config.sessionTtlHours} hours. Repeated failed attempts are temporarily blocked.</p>
</form>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export function adminDashboardPage({ data, csrf, user }) {
  const { stats, recentOrders, lowStock, topProducts, counts } = data;

  return html`
    <h1 class="amain__title">Dashboard</h1>

    <div class="tiles">
      ${tile('Total orders', stats.total, 'package', `/admin/orders`)}
      ${tile('Open orders', stats.open, 'truck', `/admin/orders?status=received`)}
      ${tile('Revenue', taka(stats.revenue), 'taka', '/admin/orders')}
      ${tile('Today', `${stats.todayOrders} orders · ${taka(stats.todayRevenue)}`, 'chart', '/admin/orders')}
    </div>

    ${stats.openPreorders > 0
      ? html`<div class="alert alert--info" style="margin-bottom:20px">
          ${icon('truck', { size: 18 })}
          <div><strong>${stats.openPreorders} pre-order</strong> ${stats.openPreorders === 1 ? 'shipment is' : 'shipments are'} still in progress from China.</div>
        </div>`
      : ''}

    <div class="apanels">
      <section class="apanel">
        <div class="apanel__head">
          <h2>Recent orders</h2>
          <a class="btn btn--ghost btn--sm" href="/admin/orders">View all</a>
        </div>
        ${recentOrders.length
          ? html`<div class="atable-wrap">
              <table class="atable">
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Total</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr>
                </thead>
                <tbody>
                  ${recentOrders.map(
                    (o) => html`<tr>
                      <td><a class="mono" href="/admin/orders/${o.id}">${o.order_code}</a></td>
                      <td>${o.customer_name}<br /><small class="muted">${o.phone}</small></td>
                      <td>${taka(o.total)}</td>
                      <td>${o.product_type === 'preorder'
                        ? raw('<span class="badge badge--sm badge--preorder">Pre-Order</span>')
                        : raw('<span class="badge badge--sm badge--ready">Ready</span>')}</td>
                      <td>${statusPill(o.status)}</td>
                      <td><small>${formatDate(o.created_at)}</small></td>
                      <td><a class="btn btn--ghost btn--xs" href="/admin/orders/${o.id}">Open</a></td>
                    </tr>`
                  )}
                </tbody>
              </table>
            </div>`
          : emptyState({ title: 'No orders yet', message: 'Orders will appear here as customers check out.', icon: 'package' })}
      </section>

      <div class="apanels__side">
        <section class="apanel">
          <div class="apanel__head">
            <h2>Needs restocking</h2>
            <a class="btn btn--ghost btn--sm" href="/admin/products?filter=lowstock">All</a>
          </div>
          ${lowStock.length
            ? html`<ul class="stocklist">
                ${lowStock.map(
                  (p) => html`<li>
                    <a class="stocklist__item" href="/admin/products/${p.id}">
                      <span class="stocklist__name">${p.title}</span>
                      <span class="stocklist__qty ${p.stock_qty === 0 ? 'is-out' : 'is-low'}">
                        ${p.product_type === 'preorder' ? 'Pre-Order' : `${p.stock_qty} left`}
                      </span>
                    </a>
                  </li>`
                )}
              </ul>`
            : raw('<p class="muted" style="padding:16px">Stock levels look healthy.</p>')}
        </section>

        <section class="apanel">
          <div class="apanel__head"><h2>Best sellers</h2></div>
          <ul class="stocklist">
            ${topProducts.map(
              (p) => html`<li>
                <a class="stocklist__item" href="/admin/products/${p.id}">
                  <span class="stocklist__name">${p.title}</span>
                  <span class="stocklist__qty">${compactCount(p.sold_count)} sold</span>
                </a>
              </li>`
            )}
          </ul>
        </section>

        <section class="apanel">
          <div class="apanel__head"><h2>Catalogue</h2></div>
          <ul class="statlist">
            ${statRow('Products', counts.products, '/admin/products')}
            ${statRow('Active', counts.active, '/admin/products?filter=active')}
            ${statRow('Hidden', counts.inactive, '/admin/products?filter=inactive')}
            ${statRow('Categories', counts.categories, '/admin/categories')}
            ${statRow('Hot deals active', counts.deals, '/admin/products?filter=deal')}
          </ul>
        </section>
      </div>
    </div>
  `;
}

const tile = (label, value, ic, href) => html`
  <a class="tile" href="${href}">
    <span class="tile__icon">${icon(ic, { size: 20 })}</span>
    <span class="tile__value">${value}</span>
    <span class="tile__label">${label}</span>
  </a>
`;

const statRow = (label, value, href) => html`
  <li><a href="${href}"><span>${label}</span><strong>${value}</strong></a></li>
`;

export function statusPill(status) {
  const kind = {
    received: 'info',
    confirmed: 'info',
    ordered_from_china: 'preorder',
    in_transit: 'preorder',
    arrived_bd: 'warn',
    ready_for_delivery: 'success',
    delivered: 'success',
    cancelled: 'danger',
  }[status] || 'info';
  return html`<span class="badge badge--sm badge--${kind}">${STATUS_LABELS[status] || status}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Product list                                                                */
/* -------------------------------------------------------------------------- */

export function adminProductsPage({ data, csrf }) {
  const { result, filters } = data;

  return html`
    <div class="ahead">
      <h1 class="amain__title">Products</h1>
      <a class="btn btn--primary" href="/admin/products/new">${icon('plus', { size: 17 })} Add product</a>
    </div>

    <form class="afilters" method="get" action="/admin/products" data-autosubmit>
      <input type="search" name="q" value="${filters.q || ''}" placeholder="Search title, code or SKU…" aria-label="Search products" />
      <select name="type" aria-label="Stock type">
        <option value="">All types</option>
        <option value="ready_stock" ${filters.type === 'ready_stock' ? 'selected' : ''}>Ready Stock</option>
        <option value="preorder" ${filters.type === 'preorder' ? 'selected' : ''}>Pre-Order</option>
      </select>
      <select name="category" aria-label="Category">
        <option value="">All categories</option>
        ${data.categories.map(
          (c) => html`<option value="${c.id}" ${String(filters.category) === String(c.id) ? 'selected' : ''}>${c.name}</option>`
        )}
      </select>
      <select name="filter" aria-label="Status">
        <option value="">Any status</option>
        <option value="active" ${filters.filter === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${filters.filter === 'inactive' ? 'selected' : ''}>Hidden</option>
        <option value="featured" ${filters.filter === 'featured' ? 'selected' : ''}>Featured</option>
        <option value="trending" ${filters.filter === 'trending' ? 'selected' : ''}>Trending</option>
        <option value="deal" ${filters.filter === 'deal' ? 'selected' : ''}>Hot deals</option>
        <option value="lowstock" ${filters.filter === 'lowstock' ? 'selected' : ''}>Low stock</option>
        <option value="noimage" ${filters.filter === 'noimage' ? 'selected' : ''}>No image</option>
      </select>
      <button class="btn btn--ghost btn--sm" type="submit">Filter</button>
      ${filters.q || filters.type || filters.category || filters.filter
        ? html`<a class="btn btn--text btn--sm" href="/admin/products">Clear</a>`
        : ''}
    </form>

    <p class="muted" style="margin-bottom:14px">${result.total} product${result.total === 1 ? '' : 's'}</p>

    ${result.items.length
      ? html`<div class="atable-wrap">
          <table class="atable atable--products">
            <thead>
              <tr>
                <th style="width:60px">Image</th>
                <th>Product</th>
                <th>Type</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Sold</th>
                <th>Flags</th>
                <th style="width:130px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${result.items.map(
                (p) => html`<tr class="${p.is_active ? '' : 'is-dim'}">
                  <td>
                    <span class="athumb">
                      ${p.image
                        ? html`<img src="/uploads/${p.image}" alt="" width="44" height="44" loading="lazy" />`
                        : icon('image', { size: 16 })}
                    </span>
                  </td>
                  <td>
                    <a class="atitle" href="/admin/products/${p.id}">${p.title}</a>
                    <br /><small class="muted mono">${p.sku}</small>
                  </td>
                  <td>
                    ${p.product_type === 'preorder'
                      ? raw('<span class="badge badge--sm badge--preorder">Pre-Order</span>')
                      : raw('<span class="badge badge--sm badge--ready">Ready</span>')}
                  </td>
                  <td>
                    ${taka(p.price)}
                    ${p.compare_price ? raw(`<br /><small class="muted" style="text-decoration:line-through">${taka(p.compare_price)}</small>`) : ''}
                  </td>
                  <td>${p.product_type === 'preorder' ? raw('<span class="muted">on order</span>') : p.stock_qty}</td>
                  <td>${compactCount(p.sold_count)}</td>
                  <td>
                    <span class="flagset">
                      ${p.is_active ? raw('<span class="flag flag--on" title="Visible in the storefront">Live</span>') : raw('<span class="flag">Hidden</span>')}
                      ${p.is_featured ? raw('<span class="flag flag--feat">Featured</span>') : ''}
                      ${p.is_trending ? raw('<span class="flag flag--trend">Trending</span>') : ''}
                      ${p.is_hot_deal ? raw('<span class="flag flag--deal">Deal</span>') : ''}
                      ${p.is_new ? raw('<span class="flag flag--new">New</span>') : ''}
                    </span>
                  </td>
                  <td class="atd-actions">
                    <a class="btn btn--ghost btn--xs" href="/admin/products/${p.id}">Edit</a>
                    <a class="btn btn--ghost btn--xs" href="/product/${p.slug}" target="_blank" rel="noopener">View</a>
                    <form method="post" action="/admin/products/${p.id}/toggle" data-confirm="Change visibility of &quot;${p.title}&quot;?">
                      <input type="hidden" name="_csrf" value="${csrf}" />
                      <input type="hidden" name="is_active" value="${p.is_active ? 0 : 1}" />
                      <button class="btn btn--text btn--xs" type="submit">${p.is_active ? 'Hide' : 'Show'}</button>
                    </form>
                  </td>
                </tr>`
              )}
            </tbody>
          </table>
        </div>
        ${pagination(result, filters, '/admin/products')}`
      : emptyState({
          title: 'No products match your filters',
          message: 'Try clearing the filters, or add your first product.',
          action: `<a class="btn btn--primary" href="/admin/products/new">Add product</a>`,
          icon: 'grid',
        })}
  `;
}

/* -------------------------------------------------------------------------- */
/* Product form                                                                */
/* -------------------------------------------------------------------------- */

export function adminProductFormPage({ data, csrf }) {
  const p = data.product || {};
  const isNew = !p.id;
  const images = data.images || [];
  const variants = data.variants || [];

  return html`
    <div class="ahead">
      <h1 class="amain__title">${isNew ? 'Add Product' : 'Edit Product'}</h1>
      <a class="btn btn--ghost" href="/admin/products">${icon('chevronLeft', { size: 15 })} Back</a>
    </div>

    ${data.error ? alert(data.error, 'error') : ''}
    ${data.saved ? alert('Product saved.', 'success') : ''}

    <!-- multipart is required so image uploads can travel with the rest of the form -->
    <form
      method="post"
      action="${isNew ? '/admin/products' : `/admin/products/${p.id}`}"
      enctype="multipart/form-data"
      class="aform"
      data-product-form
    >
      <input type="hidden" name="_csrf" value="${csrf}" />

      <div class="aform__main">
        <!-- ============ BASICS ============ -->
        <section class="card">
          <h2 class="card__title">Basics</h2>
          <div class="field-grid">
            <label class="field field--wide">
              <span class="field__label">Product Title <em>*</em></span>
              <input type="text" name="title" value="${p.title || ''}" required maxlength="160"
                data-slug-source placeholder="e.g. Mini Portable Thermal Printer" />
              <span class="field__hint">URL: /product/<span data-slug-preview>${p.slug || 'your-product'}</span></span>
            </label>

            <label class="field field--wide">
              <span class="field__label">Short Tagline</span>
              <input type="text" name="subtitle" value="${p.subtitle || ''}" maxlength="160"
                placeholder="One line that sells the product" />
            </label>

            <label class="field">
              <span class="field__label">Category</span>
              <select name="category_id">
                <option value="">No category</option>
                ${data.categories.map(
                  (c) => html`<option value="${c.id}" ${String(p.category_id) === String(c.id) ? 'selected' : ''}>${c.name}</option>`
                )}
              </select>
            </label>

            <label class="field">
              <span class="field__label">Product Code (SKU) <em>*</em></span>
              <input type="text" name="sku" value="${p.sku || ''}" required maxlength="40"
                ${isNew ? 'placeholder="AWJ-1001"' : ''} />
              ${!isNew ? raw('<span class="field__hint">SKU cannot be changed after creation</span>') : ''}
            </label>

            <label class="field field--wide">
              <span class="field__label">Search Keywords</span>
              <input type="text" name="keywords" value="${(p.keywords || []).join(', ')}"
                placeholder="bluetooth printer, label printer, pocket printer" />
              <span class="field__hint">Comma separated. Customers search by these words, so think like a shopper.</span>
            </label>

            <label class="field field--wide">
              <span class="field__label">Description</span>
              <textarea name="description" rows="10" placeholder="<p>Describe the product…</p>">${p.description || ''}</textarea>
              <span class="field__hint">Basic HTML allowed: &lt;p&gt; &lt;ul&gt; &lt;li&gt; &lt;strong&gt; &lt;h3&gt;</span>
            </label>

            <label class="field field--wide">
              <span class="field__label">Highlights</span>
              <textarea name="highlights" rows="4" placeholder="One per line">${(p.highlights || []).join('\n')}</textarea>
            </label>
          </div>
        </section>

        <!-- ============ SPECIFICATIONS ============ -->
        <section class="card">
          <h2 class="card__title">Specifications</h2>
          <p class="muted small">One "Name: value" pair per line.</p>
          <textarea name="specs" rows="8" class="mono"
            placeholder="Battery: 1200mAh&#10;Material: ABS&#10;Warranty: 7 days">${Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}</textarea>
        </section>

        <!-- ============ VARIANTS ============ -->
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Variants</h2>
            <button class="btn btn--ghost btn--sm" type="button" data-add-variant>${icon('plus', { size: 15 })} Add row</button>
          </div>
          <p class="muted small">
            Leave empty if the product has no options. Extra price is added to the base price.
          </p>
          <div class="vartable" data-variant-rows>
            ${variants.length
              ? variants.map((v) => variantRow(v))
              : variantRow(null)}
          </div>
        </section>
      </div>

      <!-- ============ SIDEBAR ============ -->
      <aside class="aform__side">
        <section class="card">
          <h2 class="card__title">Visibility</h2>
          <label class="switch">
            <input type="checkbox" name="is_active" value="1" ${p.is_active !== false ? 'checked' : ''} />
            <span class="switch__track"></span>
            <span class="switch__label">Active (visible in store)</span>
          </label>
          <label class="switch">
            <input type="checkbox" name="is_featured" value="1" ${p.is_featured ? 'checked' : ''} />
            <span class="switch__track"></span><span class="switch__label">Featured</span>
          </label>
          <label class="switch">
            <input type="checkbox" name="is_trending" value="1" ${p.is_trending ? 'checked' : ''} />
            <span class="switch__track"></span><span class="switch__label">Trending</span>
          </label>
          <label class="switch">
            <input type="checkbox" name="is_new" value="1" ${p.is_new ? 'checked' : ''} />
            <span class="switch__track"></span><span class="switch__label">Show NEW badge</span>
          </label>
        </section>

        <section class="card">
          <h2 class="card__title">Stock Type</h2>
          <div class="radios">
            <label class="radioopt">
              <input type="radio" name="product_type" value="ready_stock" data-type-radio
                ${p.product_type !== 'preorder' ? 'checked' : ''} />
              <span>
                <strong>Ready Stock</strong>
                <small>In Bangladesh now. Ships in 1-3 days.</small>
              </span>
            </label>
            <label class="radioopt radioopt--pre">
              <input type="radio" name="product_type" value="preorder" data-type-radio
                ${p.product_type === 'preorder' ? 'checked' : ''} />
              <span>
                <strong>Pre-Order</strong>
                <small>Sourced from China. 7-10 days.</small>
              </span>
            </label>
          </div>

          <label class="field" data-stock-field>
            <span class="field__label">Stock Quantity</span>
            <input type="number" name="stock_qty" value="${p.stock_qty ?? 0}" min="0" step="1" />
          </label>

          <label class="field" data-lowstock-field>
            <span class="field__label">Low stock alert at</span>
            <input type="number" name="low_stock_at" value="${p.low_stock_at ?? 3}" min="0" step="1" />
          </label>

          <div class="field-grid field-grid--tight" data-delivery-fields>
            <label class="field">
              <span class="field__label">Delivery min (days)</span>
              <input type="number" name="delivery_min_days" value="${p.delivery_min_days ?? 7}" min="0" max="60" />
            </label>
            <label class="field">
              <span class="field__label">Delivery max (days)</span>
              <input type="number" name="delivery_max_days" value="${p.delivery_max_days ?? 10}" min="0" max="90" />
            </label>
          </div>
          <p class="field__hint" data-delivery-hint></p>

          <label class="field field--wide">
            <span class="field__label">Supplier Reference</span>
            <input type="text" name="supplier_ref" value="${p.supplier_ref || ''}" placeholder="CN-1042" />
          </label>
        </section>

        <section class="card">
          <h2 class="card__title">Pricing</h2>
          <label class="field">
            <span class="field__label">Selling Price (BDT) <em>*</em></span>
            <input type="number" name="price" value="${p.price ?? ''}" required min="0" step="1" data-price-input />
          </label>
          <label class="field">
            <span class="field__label">Original Price (BDT)</span>
            <input type="number" name="compare_price" value="${p.compare_price ?? ''}" min="0" step="1" />
            <span class="field__hint" data-discount-hint>Leave empty if not discounted</span>
          </label>
          <label class="field">
            <span class="field__label">Cost Price (internal)</span>
            <input type="number" name="cost_price" value="${p.cost_price ?? ''}" min="0" step="1" />
            <span class="field__hint">Never shown to customers</span>
          </label>
        </section>

        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Hot Deal</h2>
            <label class="switch switch--sm">
              <input type="checkbox" name="is_hot_deal" value="1" ${p.is_hot_deal ? 'checked' : ''} data-deal-toggle />
              <span class="switch__track"></span>
            </label>
          </div>
          <div data-deal-fields>
            <label class="field">
              <span class="field__label">Deal ends at</span>
              <input type="datetime-local" name="deal_ends_at"
                value="${(p.deal_ends_at || '').slice(0, 16)}" />
              <span class="field__hint">The countdown on the site uses this exact time.</span>
            </label>
            <label class="field">
              <span class="field__label">Limited stock message</span>
              <input type="number" name="deal_stock_limit" value="${p.deal_stock_limit ?? ''}" min="0" step="1"
                placeholder="12" />
              <span class="field__hint">Shows as &quot;Only N left&quot;</span>
            </label>
          </div>
        </section>

        <!-- ============ IMAGES ============ -->
        <section class="card">
          <h2 class="card__title">Images</h2>

          ${images.length
            ? html`<div class="imggrid">
                ${images.map(
                  (img, i) => html`
                    <div class="imggrid__item">
                      <img src="/uploads/${img.path}" alt="${img.alt || ''}" width="120" height="120" loading="lazy" />
                      ${i === 0 ? raw('<span class="imggrid__main">Main</span>') : ''}
                      <div class="imggrid__actions">
                        <button class="btn btn--text btn--xs" type="button" data-move-image="${img.id}" data-dir="up"
                          aria-label="Move up">↑</button>
                        <button class="btn btn--text btn--xs" type="button" data-move-image="${img.id}" data-dir="down"
                          aria-label="Move down">↓</button>
                        <button class="btn btn--text btn--xs btn--danger" type="button" data-delete-image="${img.id}"
                          aria-label="Delete image">${icon('trash', { size: 14 })}</button>
                      </div>
                    </div>
                  `
                )}
              </div>`
            : ''}

          <div class="uploader" data-uploader>
            <label class="uploader__btn">
              ${icon('upload', { size: 18 })}
              <span>Upload image</span>
              <input type="file" name="images" accept="image/png,image/jpeg,image/webp,image/avif" multiple
                data-image-input ${isNew ? 'disabled' : ''} />
            </label>
            ${isNew ? raw('<p class="field__hint">Save the product first, then add images.</p>') : ''}
            <div class="uploader__previews" data-image-previews></div>
          </div>

          <label class="field">
            <span class="field__label">Main image alt text</span>
            <input type="text" name="alt_text" value="${images[0]?.alt || p.title || ''}" maxlength="160" />
          </label>

          ${data.optimiserAvailable === false
            ? html`<p class="field__hint">
                ${icon('alert', { size: 14 })} WebP optimisation is off because <code>sharp</code> is not installed.
                Run <code>npm install sharp</code> to generate responsive WebP versions.
              </p>`
            : html`<p class="field__hint">${icon('checkCircle', { size: 14 })} Images are converted to WebP with responsive sizes.</p>`}
        </section>

        <div class="aform__save">
          <button class="btn btn--primary btn--block btn--lg" type="submit" data-submit>
            ${icon('check', { size: 18 })} ${isNew ? 'Create product' : 'Save changes'}
          </button>
          ${!isNew
            ? html`<a class="btn btn--ghost btn--block" href="/product/${p.slug}" target="_blank" rel="noopener">
                ${icon('eye', { size: 16 })} Preview
              </a>`
            : ''}
        </div>
      </aside>
    </form>

    ${!isNew
      ? html`<form method="post" action="/admin/products/${p.id}/delete" class="adanger"
            data-confirm="Delete &quot;${p.title}&quot;? This cannot be undone. Past orders keep their saved details.">
          <input type="hidden" name="_csrf" value="${csrf}" />
          <button class="btn btn--danger" type="submit">${icon('trash', { size: 16 })} Delete this product</button>
        </form>`
      : ''}
  `;
}

function variantRow(v) {
  return html`
    <div class="varrow">
      <input type="hidden" name="variant_id" value="${v?.id || ''}" />
      <input type="text" name="variant_name" value="${v?.name || ''}" placeholder="Colour" aria-label="Option name" />
      <input type="text" name="variant_value" value="${v?.value || ''}" placeholder="Black" aria-label="Option value" />
      <input type="number" name="variant_delta" value="${v?.price_delta ?? 0}" step="1" placeholder="0" aria-label="Extra price" />
      <input type="number" name="variant_stock" value="${v?.stock_qty ?? 0}" min="0" step="1" placeholder="0" aria-label="Stock" />
      <button class="btn btn--text btn--xs btn--danger" type="button" data-remove-variant aria-label="Remove variant">
        ${icon('close', { size: 14 })}
      </button>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export function adminOrdersPage({ data, csrf }) {
  const { result, filters, stats } = data;

  return html`
    <div class="ahead">
      <h1 class="amain__title">Orders</h1>
      <p class="muted">${stats.open} open · ${stats.total} total</p>
    </div>

    <div class="statusbar">
      <a class="statusbar__item ${!filters.status ? 'is-active' : ''}" href="/admin/orders">
        All <strong>${stats.total}</strong>
      </a>
      ${Object.entries(STATUS_LABELS).map(
        ([key, label]) => html`<a class="statusbar__item ${filters.status === key ? 'is-active' : ''}"
          href="/admin/orders?status=${key}">
          ${label} <strong>${stats.byStatus[key] || 0}</strong>
        </a>`
      )}
    </div>

    <form class="afilters" method="get" action="/admin/orders" data-autosubmit>
      ${filters.status ? raw(`<input type="hidden" name="status" value="${esc(filters.status)}">`) : ''}
      <input type="search" name="q" value="${filters.q || ''}" placeholder="Order ID, name or phone…" aria-label="Search orders" />
      <select name="sort" aria-label="Sort">
        <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Newest first</option>
        <option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>Oldest first</option>
        <option value="total_desc" ${filters.sort === 'total_desc' ? 'selected' : ''}>Highest total</option>
        <option value="status" ${filters.sort === 'status' ? 'selected' : ''}>By status</option>
      </select>
      <button class="btn btn--ghost btn--sm" type="submit">Search</button>
    </form>

    ${result.items.length
      ? html`<div class="atable-wrap">
          <table class="atable">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>District</th><th>Total</th><th>Payment</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              ${result.items.map(
                (o) => html`<tr>
                  <td><a class="mono" href="/admin/orders/${o.id}">${o.order_code}</a></td>
                  <td>${o.customer_name}<br /><small class="muted">${o.phone}</small></td>
                  <td>${o.district}</td>
                  <td>${taka(o.total)}</td>
                  <td><small>${o.paymentLabel}</small></td>
                  <td>${o.product_type === 'preorder'
                    ? raw('<span class="badge badge--sm badge--preorder">Pre</span>')
                    : raw('<span class="badge badge--sm badge--ready">Ready</span>')}</td>
                  <td>${statusPill(o.status)}</td>
                  <td><small>${formatDate(o.created_at)}</small></td>
                  <td><a class="btn btn--ghost btn--xs" href="/admin/orders/${o.id}">Open</a></td>
                </tr>`
              )}
            </tbody>
          </table>
        </div>
        ${pagination(result, filters, '/admin/orders')}`
      : emptyState({ title: 'No orders found', message: 'Orders will appear here as customers check out.', icon: 'package' })}
  `;
}

export function adminOrderDetailPage({ data, csrf }) {
  const { order, items, events, next } = data;

  return html`
    <div class="ahead">
      <h1 class="amain__title mono">${order.order_code}</h1>
      <a class="btn btn--ghost" href="/admin/orders">${icon('chevronLeft', { size: 15 })} All orders</a>
    </div>

    <div class="agrid">
      <div class="agrid__main">
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Update status</h2>
            ${statusPill(order.status)}
          </div>

          <form method="post" action="/admin/orders/${order.id}/status" class="aform-inline">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <label class="field">
              <span class="field__label">New status</span>
              <select name="status" required>
                ${Object.entries(STATUS_LABELS).map(
                  ([key, label]) => html`<option value="${key}" ${key === next ? 'selected' : ''}>${label}</option>`
                )}
              </select>
            </label>
            <label class="field field--grow">
              <span class="field__label">Customer-visible note (optional)</span>
              <input type="text" name="note" maxlength="300" placeholder="Parcel left our Dhaka warehouse" />
            </label>
            <label class="check check--inline">
              <input type="checkbox" name="internal" value="1" />
              <span>Internal note (hidden from customer)</span>
            </label>
            <button class="btn btn--primary" type="submit" data-submit>Update status</button>
          </form>

          <p class="field__hint">
            ${order.product_type === 'preorder'
              ? 'This is a pre-order. The China sourcing and shipping steps apply.'
              : 'This is a ready-stock order, so the China steps are skipped.'}
          </p>
        </section>

        <section class="card">
          <h2 class="card__title">Items (${items.length})</h2>
          <div class="atable-wrap">
            <table class="atable">
              <thead><tr><th>Product</th><th>Option</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
              <tbody>
                ${items.map(
                  (i) => html`<tr>
                    <td>${i.slug
                      ? html`<a href="/product/${i.slug}" target="_blank" rel="noopener">${i.title}</a>`
                      : i.title}</td>
                    <td><small>${i.variant_label || '—'}</small></td>
                    <td>${taka(i.unit_price)}</td>
                    <td>${i.qty}</td>
                    <td>${taka(i.line_total)}</td>
                  </tr>`
                )}
              </tbody>
              <tfoot>
                <tr><td colspan="4">Subtotal</td><td>${taka(order.subtotal)}</td></tr>
                <tr><td colspan="4">Delivery</td><td>${taka(order.delivery_fee)}</td></tr>
                <tr><td colspan="4"><strong>Total</strong></td><td><strong>${taka(order.total)}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section class="card">
          <h2 class="card__title">History</h2>
          <ol class="timeline timeline--admin">
            ${events
              .slice()
              .reverse()
              .map(
                (e) => html`<li class="timeline__step timeline__step--done">
                  <span class="timeline__marker">${icon('check', { size: 12 })}</span>
                  <div class="timeline__body">
                    <p class="timeline__label">${STATUS_LABELS[e.status] || e.status}</p>
                    ${e.note ? raw(`<p class="timeline__note">${esc(e.note)}</p>`) : ''}
                    <p class="timeline__time">${formatDateTime(e.created_at)}${e.visible ? '' : ' · internal'}</p>
                  </div>
                </li>`
              )}
          </ol>
        </section>
      </div>

      <aside class="agrid__side">
        <section class="card">
          <h2 class="card__title">Customer</h2>
          <dl class="deflist">
            <div><dt>Name</dt><dd>${order.customer_name}</dd></div>
            <div><dt>Phone</dt><dd><a href="tel:${order.phone}">${order.phone}</a></dd></div>
            ${order.whatsapp && order.whatsapp !== order.phone
              ? html`<div><dt>WhatsApp</dt><dd>${order.whatsapp}</dd></div>`
              : ''}
            <div><dt>Placed</dt><dd>${formatDateTime(order.created_at)}</dd></div>
            <div><dt>Payment</dt><dd>${order.paymentLabel} · ${order.payment_status}</dd></div>
          </dl>
        </section>

        <section class="card">
          <h2 class="card__title">Delivery Address</h2>
          <address class="address">
            ${order.area ? `${order.area}<br />` : ''}${order.address}<br />
            ${order.district}, Bangladesh
            ${order.note ? raw(`<br /><em>Note: ${esc(order.note)}</em>`) : ''}
          </address>
          <a class="btn btn--wa btn--block" target="_blank" rel="noopener"
            href="${whatsappLink(order.whatsapp || order.phone, `Hello, this is AWAJ about order ${order.order_code}.`)}">
            ${icon('whatsapp', { size: 16 })} Message customer
          </a>
        </section>

        <section class="card">
          <h2 class="card__title">Payment</h2>
          <form method="post" action="/admin/orders/${order.id}/payment" class="aform-inline">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <label class="field">
              <span class="field__label">Payment status</span>
              <select name="payment_status">
                ${['unpaid', 'pending', 'paid', 'failed', 'refunded'].map(
                  (s) => html`<option value="${s}" ${order.payment_status === s ? 'selected' : ''}>${s}</option>`
                )}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Transaction ID</span>
              <input type="text" name="payment_ref" value="${order.payment_ref || ''}" maxlength="80"
                placeholder="bKash / Nagad trx id" />
            </label>
            <button class="btn btn--ghost" type="submit">Save</button>
          </form>
        </section>
      </aside>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export function adminCategoriesPage({ data, csrf }) {
  const { categories } = data;

  return html`
    <h1 class="amain__title">Categories</h1>
    <p class="muted" style="margin-bottom:18px">Drag order changes the order of the category menu. The slug is the URL.</p>

    <div class="agrid">
      <div class="agrid__main">
        <section class="card">
          <h2 class="card__title">All categories (${categories.length})</h2>
          ${categories.length
            ? html`<div class="atable-wrap">
                <table class="atable">
                  <thead><tr><th>Order</th><th>Name</th><th>Slug</th><th>Products</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    ${categories.map(
                      (c) => html`<tr class="${c.is_active ? '' : 'is-dim'}">
                        <td><input class="order-input" type="number" value="${c.sort_order}" min="0"
                            form="catform-${c.id}" name="sort_order" aria-label="Sort order for ${c.name}" /></td>
                        <td>
                          <input class="inline-input" type="text" value="${c.name}" form="catform-${c.id}"
                            name="name" aria-label="Name" />
                          <input class="inline-input inline-input--sm" type="text" value="${c.tagline || ''}"
                            form="catform-${c.id}" name="tagline" placeholder="Tagline" aria-label="Tagline" />
                        </td>
                        <td><code class="mono">${c.slug}</code></td>
                        <td>${c.product_count}</td>
                        <td>
                          <span class="flag ${c.is_active ? 'flag--on' : ''}">${c.is_active ? 'Visible' : 'Hidden'}</span>
                        </td>
                        <td class="atd-actions">
                          <button class="btn btn--ghost btn--xs" type="submit" form="catform-${c.id}">Save</button>
                        </td>
                      </tr>
                      <tr hidden><td colspan="6">
                        <form id="catform-${c.id}" method="post" action="/admin/categories/${c.id}">
                          <input type="hidden" name="_csrf" value="${csrf}" />
                          <input type="hidden" name="is_active" value="${c.is_active ? 1 : 0}" />
                        </form>
                      </td></tr>`
                    )}
                  </tbody>
                </table>
              </div>`
            : emptyState({ title: 'No categories yet', message: 'Add your first category using the form on the right.', icon: 'tag' })}
        </section>
      </div>

      <aside class="agrid__side">
        <section class="card">
          <h2 class="card__title">Add category</h2>
          <form method="post" action="/admin/categories" class="aform-inline aform-inline--stack">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <label class="field">
              <span class="field__label">Name <em>*</em></span>
              <input type="text" name="name" required maxlength="60" placeholder="e.g. Home &amp; Kitchen" />
            </label>
            <label class="field">
              <span class="field__label">Tagline</span>
              <input type="text" name="tagline" maxlength="100" placeholder="Useful household products" />
            </label>
            <label class="field">
              <span class="field__label">Sort order</span>
              <input type="number" name="sort_order" value="${categories.length + 1}" min="0" step="1" />
            </label>
            <button class="btn btn--primary btn--block" type="submit">Add category</button>
          </form>
        </section>
      </aside>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export function adminSettingsPage({ data, csrf }) {
  const s = data.settings;
  const g = (key) => (s[key] === true || s[key] === false ? (s[key] ? '1' : '') : s[key] ?? '');

  return html`
    <h1 class="amain__title">Settings</h1>
    <p class="muted" style="margin-bottom:18px">Everything here changes the storefront immediately. Nothing is hard-coded.</p>

    ${data.saved ? alert('Settings saved.', 'success') : ''}

    <form method="post" action="/admin/settings" class="settings">
      <input type="hidden" name="_csrf" value="${csrf}" />
      <!-- Marks this as a full settings submission, so unticked checkboxes
           (payment methods, toggles) are correctly read as "off". -->
      <input type="hidden" name="settings_form" value="1" />

      <div class="agrid">
        <div class="agrid__main">
          <section class="card">
            <h2 class="card__title">Store identity</h2>
            <div class="field-grid">
              <label class="field">
                <span class="field__label">Store name</span>
                <input type="text" name="store.name" value="${s['store.name'] || ''}" />
              </label>
              <label class="field">
                <span class="field__label">Tagline</span>
                <input type="text" name="store.tagline" value="${s['store.tagline'] || ''}" />
              </label>
              <label class="field field--wide">
                <span class="field__label">Store description</span>
                <textarea name="store.description" rows="3">${s['store.description'] || ''}</textarea>
                <span class="field__hint">Used on the About page and as a fallback meta description.</span>
              </label>
            </div>
          </section>

          <section class="card">
            <h2 class="card__title">Delivery</h2>
            <div class="field-grid field-grid--3">
              <label class="field">
                <span class="field__label">Inside Dhaka (BDT)</span>
                <input type="number" name="delivery.inside_dhaka" value="${s['delivery.inside_dhaka']}" min="0" step="1" />
              </label>
              <label class="field">
                <span class="field__label">Outside Dhaka (BDT)</span>
                <input type="number" name="delivery.outside_dhaka" value="${s['delivery.outside_dhaka']}" min="0" step="1" />
              </label>
              <label class="field">
                <span class="field__label">Free delivery over (BDT)</span>
                <input type="number" name="delivery.free_threshold" value="${s['delivery.free_threshold']}" min="0" step="1" />
                <span class="field__hint">0 disables free delivery</span>
              </label>
            </div>
            <div class="field-grid field-grid--3">
              <label class="field">
                <span class="field__label">Ready stock min (days)</span>
                <input type="number" name="delivery.ready_stock_days_min" value="${s['delivery.ready_stock_days_min']}" min="0" />
              </label>
              <label class="field">
                <span class="field__label">Ready stock max (days)</span>
                <input type="number" name="delivery.ready_stock_days_max" value="${s['delivery.ready_stock_days_max']}" min="0" />
              </label>
              <label class="field">
                <span class="field__label">Pre-order min (days)</span>
                <input type="number" name="delivery.preorder_days_min" value="${s['delivery.preorder_days_min']}" min="0" />
              </label>
              <label class="field">
                <span class="field__label">Pre-order max (days)</span>
                <input type="number" name="delivery.preorder_days_max" value="${s['delivery.preorder_days_max']}" min="0" />
              </label>
            </div>
            <label class="field">
              <span class="field__label">Pre-order notice</span>
              <textarea name="delivery.preorder_note" rows="3">${s['delivery.preorder_note'] || ''}</textarea>
              <span class="field__hint">Shown on every pre-order product and on the pre-order page.</span>
            </label>
          </section>

          <section class="card">
            <h2 class="card__title">Payment methods</h2>
            <p class="muted small">Switch off a method to remove it from checkout immediately.</p>
            <div class="paygrid">
              <label class="payopt">
                <input type="checkbox" name="payment.cod.enabled" value="1" ${g('payment.cod.enabled') ? 'checked' : ''} />
                <span class="payopt__body"><span class="payopt__name">Cash on Delivery</span></span>
              </label>
              <label class="payopt">
                <input type="checkbox" name="payment.bkash.enabled" value="1" ${g('payment.bkash.enabled') ? 'checked' : ''} />
                <span class="payopt__body"><span class="payopt__name">bKash</span></span>
              </label>
              <label class="payopt">
                <input type="checkbox" name="payment.nagad.enabled" value="1" ${g('payment.nagad.enabled') ? 'checked' : ''} />
                <span class="payopt__body"><span class="payopt__name">Nagad</span></span>
              </label>
              <label class="payopt">
                <input type="checkbox" name="payment.bank.enabled" value="1" ${g('payment.bank.enabled') ? 'checked' : ''} />
                <span class="payopt__body"><span class="payopt__name">Bank Transfer</span></span>
              </label>
            </div>
            <div class="field-grid field-grid--2">
              <label class="field">
                <span class="field__label">bKash number</span>
                <input type="text" name="payment.bkash.number" value="${s['payment.bkash.number'] || ''}" placeholder="01XXXXXXXXX" />
              </label>
              <label class="field">
                <span class="field__label">Nagad number</span>
                <input type="text" name="payment.nagad.number" value="${s['payment.nagad.number'] || ''}" placeholder="01XXXXXXXXX" />
              </label>
            </div>
            <label class="field">
              <span class="field__label">Bank transfer details</span>
              <textarea name="payment.bank.details" rows="3" placeholder="Bank name, account number, routing">${s['payment.bank.details'] || ''}</textarea>
            </label>
            <label class="field">
              <span class="field__label">Payment instructions</span>
              <textarea name="payment.instructions" rows="2">${s['payment.instructions'] || ''}</textarea>
            </label>
          </section>

          <section class="card">
            <h2 class="card__title">Policies</h2>
            <label class="field">
              <span class="field__label">Shipping policy</span>
              <textarea name="content.shipping_policy" rows="5">${s['content.shipping_policy'] || ''}</textarea>
            </label>
            <label class="field">
              <span class="field__label">Return &amp; refund policy</span>
              <textarea name="content.return_policy" rows="5">${s['content.return_policy'] || ''}</textarea>
            </label>
            <label class="field">
              <span class="field__label">Privacy policy</span>
              <textarea name="content.privacy_policy" rows="4">${s['content.privacy_policy'] || ''}</textarea>
            </label>
            <label class="field">
              <span class="field__label">Terms &amp; conditions</span>
              <textarea name="content.terms" rows="4">${s['content.terms'] || ''}</textarea>
            </label>
          </section>
        </div>

        <aside class="agrid__side">
          <section class="card">
            <h2 class="card__title">Contact</h2>
            <p class="muted small">Only fill in the channels you actually use. Empty ones are hidden on the site.</p>
            <label class="field">
              <span class="field__label">WhatsApp number</span>
              <input type="text" name="contact.whatsapp" value="${s['contact.whatsapp'] || ''}" placeholder="8801XXXXXXXXX" />
              <span class="field__hint">Country code, no + sign</span>
            </label>
            <label class="field">
              <span class="field__label">Support phone</span>
              <input type="text" name="contact.support_phone" value="${s['contact.support_phone'] || ''}" placeholder="+8801XXXXXXXXX" />
            </label>
            <label class="field">
              <span class="field__label">Support email</span>
              <input type="email" name="contact.support_email" value="${s['contact.support_email'] || ''}" placeholder="hello@awaj.com" />
            </label>
          </section>

          <section class="card">
            <h2 class="card__title">Social media</h2>
            <p class="muted small">Facebook links appear in the header, footer and a follow banner. Leave blank to hide.</p>
            <label class="field">
              <span class="field__label">Facebook page URL</span>
              <input type="url" name="contact.facebook_url" value="${s['contact.facebook_url'] || ''}"
                placeholder="https://facebook.com/yourpage" />
            </label>
            <label class="field">
              <span class="field__label">Facebook follow text</span>
              <input type="text" name="social.facebook_follow_text" value="${s['social.facebook_follow_text'] || ''}" />
            </label>
            <label class="field">
              <span class="field__label">Facebook chat text</span>
              <input type="text" name="social.facebook_chat_text" value="${s['social.facebook_chat_text'] || ''}" />
            </label>
            <label class="field">
              <span class="field__label">Instagram URL</span>
              <input type="url" name="contact.instagram_url" value="${s['contact.instagram_url'] || ''}" />
            </label>
            <label class="field">
              <span class="field__label">TikTok URL</span>
              <input type="url" name="contact.tiktok_url" value="${s['contact.tiktok_url'] || ''}" />
            </label>
          </section>

          <section class="card">
            <h2 class="card__title">SEO</h2>
            <label class="field">
              <span class="field__label">Default page title</span>
              <input type="text" name="seo.default_title" value="${s['seo.default_title'] || ''}" />
            </label>
            <label class="field">
              <span class="field__label">Meta description</span>
              <textarea name="seo.default_description" rows="3">${s['seo.default_description'] || ''}</textarea>
            </label>
          </section>

          <section class="card">
            <h2 class="card__title">Display</h2>
            <label class="field">
              <span class="field__label">Products per page</span>
              <input type="number" name="site.products_per_page" value="${s['site.products_per_page']}" min="6" max="96" />
            </label>
            <label class="field">
              <span class="field__label">Ready Stock items on home</span>
              <input type="number" name="site.home_ready_stock_limit" value="${s['site.home_ready_stock_limit']}" min="0" max="24" />
            </label>
            <label class="field">
              <span class="field__label">Pre-Order items on home</span>
              <input type="number" name="site.home_preorder_limit" value="${s['site.home_preorder_limit']}" min="0" max="24" />
            </label>
            <label class="switch">
              <input type="checkbox" name="site.show_hot_deals" value="1" ${g('site.show_hot_deals') ? 'checked' : ''} />
              <span class="switch__track"></span><span class="switch__label">Show Hot Deals section</span>
            </label>
          </section>

          <div class="aform__save">
            <button class="btn btn--primary btn--block btn--lg" type="submit" data-submit>
              ${icon('check', { size: 18 })} Save settings
            </button>
          </div>
        </aside>
      </div>
    </form>

    <section class="card" style="margin-top:20px">
      <h2 class="card__title">Change your password</h2>
      <form method="post" action="/admin/settings/password" class="aform-inline aform-inline--stack">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <label class="field">
          <span class="field__label">New password</span>
          <input type="password" name="password" required minlength="8" autocomplete="new-password" />
          <span class="field__hint">At least 8 characters, including a number</span>
        </label>
        <label class="field">
          <span class="field__label">Confirm new password</span>
          <input type="password" name="confirm" required minlength="8" autocomplete="new-password" />
        </label>
        <button class="btn btn--ghost" type="submit">Update password</button>
      </form>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                      */
/* -------------------------------------------------------------------------- */

function pagination(result, filters, basePath) {
  if (result.pages <= 1) return '';
  const qs = { ...filters, page: '' };
  delete qs.page;

  const link = (n) => buildUrl(basePath, { ...qs, page: n > 1 ? n : '' });

  return html`
    <nav class="pager" aria-label="Pagination">
      ${result.page > 1
        ? html`<a class="pager__step" href="${link(result.page - 1)}" rel="prev">${icon('chevronLeft', { size: 15 })} Previous</a>`
        : html`<span class="pager__step is-disabled">${icon('chevronLeft', { size: 15 })} Previous</span>`}
      <span class="pager__info">Page ${result.page} of ${result.pages}</span>
      ${result.page < result.pages
        ? html`<a class="pager__step" href="${link(result.page + 1)}" rel="next">Next ${icon('chevronRight', { size: 15 })}</a>`
        : html`<span class="pager__step is-disabled">Next ${icon('chevronRight', { size: 15 })} Next</span>`}
    </nav>
  `;
}
