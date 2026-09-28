/**
 * Listing page used for: /products, /search, /category/:slug,
 * /ready-stock, /pre-order, /deals  (Requirements 4, 7, 8, 11, 31)
 */
import { html, raw, esc, taka, url as buildUrl } from '../../lib/utils.js';
import { icon, emptyState, breadcrumbs } from  '../components/ui.js';
import { productCard } from '../components/product-card.js';
import { itemListSchema, breadcrumbSchema } from '../layout.js';

const SORTS = [
  ['relevance', 'Best match'],
  ['newest', 'Newest first'],
  ['popular', 'Most popular'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['discount', 'Biggest discount'],
];

/**
 * @param {object} data
 * @param {string} data.heading
 * @param {string} [data.subheading]
 * @param {object[]} data.trail        breadcrumbs
 * @param {object} data.result         searchProducts() output
 * @param {object} data.categories
 * @param {object} data.filters        current filter values
 * @param {object} [data.basePath]     e.g. '/category/gadgets'
 * @param {boolean} [data.showFilters]
 */
export function listingPage({ data, ctx }) {
  const { result, filters, basePath = '/products', categories, showFilters = true } = data;
  const { items, total, page, pages } = result;
  const settings = ctx.settings;

  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.category?.length ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.isNew ? 1 : 0) +
    (filters.discounted ? 1 : 0) +
    (filters.inStock ? 1 : 0);

  const pageUrl = (n) =>
    buildUrl(basePath, {
      q: filters.q,
      cat: filters.category,
      type: filters.type,
      min: filters.minPrice,
      max: filters.maxPrice,
      new: filters.isNew ? 1 : '',
      off: filters.discounted ? 1 : '',
      stock: filters.inStock ? 1 : '',
      sort: filters.sort && filters.sort !== 'relevance' ? filters.sort : '',
      page: n > 1 ? n : '',
    });

  return html`
    <div class="container listing">
      ${breadcrumbs(data.trail)}

      <header class="listing__head">
        <div>
          <h1 class="listing__title">${data.heading}</h1>
          ${data.subheading ? raw(`<p class="listing__sub">${esc(data.subheading)}</p>`) : ''}
          <p class="listing__count">
            ${total} product${total === 1 ? '' : 's'}
            ${filters.q ? raw(` for &ldquo;<strong>${esc(filters.q)}</strong>&rdquo;`) : ''}
          </p>
        </div>
        <form class="listing__sort" method="get" action="${basePath}" data-autosubmit>
          ${hiddenFilters(filters, basePath)}
          <label for="sort">Sort by</label>
          <select id="sort" name="sort">
            ${SORTS.map(
              ([value, label]) =>
                html`<option value="${value}" ${filters.sort === value ? 'selected' : ''}>${label}</option>`
            )}
          </select>
          <noscript><button class="btn btn--sm" type="submit">Apply</button></noscript>
        </form>
      </header>

      ${data.notice ? raw(`<div class="notice notice--${data.notice.kind || 'info'}">${icon('info', { size: 18 })}<div>${data.notice.text}</div></div>`) : ''}

      <div class="listing__body">
        ${showFilters
          ? html`<aside class="filters" data-filters>
              <div class="filters__mobile-head">
                <h2>${icon('filter', { size: 17 })} Filters</h2>
                <button class="iconbtn" type="button" data-filters-close aria-label="Close filters">${icon('close', { size: 20 })}</button>
              </div>
              <form method="get" action="${basePath}" class="filters__form">
                ${hiddenFilters(filters, basePath, ['cat'])}

                <fieldset class="filters__group">
                  <legend>Category</legend>
                  <div class="filters__checks">
                    <label class="check">
                      <input type="checkbox" name="cat" value="" ${!filters.category?.length ? 'checked' : ''} data-clear-cat />
                      <span>All categories</span>
                    </label>
                    ${categories.map(
                      (c) => html`<label class="check">
                        <input type="checkbox" name="cat" value="${c.slug}"
                          ${filters.category?.includes(c.slug) ? 'checked' : ''}
                          data-autosubmit-change />
                        <span>${c.name} <em>(${c.product_count})</em></span>
                      </label>`
                    )}
                  </div>
                </fieldset>

                <fieldset class="filters__group">
                  <legend>Availability</legend>
                  <label class="check">
                    <input type="radio" name="type" value="" ${!filters.type ? 'checked' : ''} data-autosubmit-change />
                    <span>All products</span>
                  </label>
                  <label class="check">
                    <input type="radio" name="type" value="ready_stock" ${filters.type === 'ready_stock' ? 'checked' : ''} data-autosubmit-change />
                    <span><span class="dot dot--ready"></span> Ready Stock</span>
                  </label>
                  <label class="check">
                    <input type="radio" name="type" value="preorder" ${filters.type === 'preorder' ? 'checked' : ''} data-autosubmit-change />
                    <span><span class="dot dot--pre"></span> Pre-Order</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" name="stock" value="1" ${filters.inStock ? 'checked' : ''} data-autosubmit-change />
                    <span>In stock only</span>
                  </label>
                </fieldset>

                <fieldset class="filters__group">
                  <legend>Price (BDT)</legend>
                  <div class="filters__price">
                    <input type="number" name="min" placeholder="Min" value="${filters.minPrice || ''}" min="0" step="50" data-price-input aria-label="Minimum price" />
                    <span>–</span>
                    <input type="number" name="max" placeholder="Max" value="${filters.maxPrice || ''}" min="0" step="50" data-price-input aria-label="Maximum price" />
                  </div>
                  ${data.priceBounds
                    ? raw(`<p class="filters__hint">Range: ${esc(taka(data.priceBounds.min))} – ${esc(taka(data.priceBounds.max))}</p>`)
                    : ''}
                </fieldset>

                <fieldset class="filters__group">
                  <legend>Offers</legend>
                  <label class="check">
                    <input type="checkbox" name="new" value="1" ${filters.isNew ? 'checked' : ''} data-autosubmit-change />
                    <span>New arrivals</span>
                  </label>
                  <label class="check">
                    <input type="checkbox" name="off" value="1" ${filters.discounted ? 'checked' : ''} data-autosubmit-change />
                    <span>Discounted only</span>
                  </label>
                </fieldset>

                <div class="filters__actions">
                  <button class="btn btn--primary btn--block btn--sm" type="submit">Apply filters</button>
                  ${activeFilterCount
                    ? html`<a class="btn btn--ghost btn--block btn--sm" href="${basePath}">Clear all</a>`
                    : ''}
                </div>
              </form>
            </aside>
            <div class="filters__scrim" data-filters-close></div>`
          : ''}

        <div class="listing__main">
          <div class="listing__chips">
            ${filters.q ? raw(`<a class="chip" href="${esc(pageUrl(1))}">Search: ${esc(filters.q)} ${icon('close', { size: 13 })}</a>`) : ''}
            ${(filters.category || []).map(
              (slug) => {
                const c = categories.find((x) => x.slug === slug);
                const rest = filters.category.filter((x) => x !== slug);
                return raw(
                  `<a class="chip" href="${esc(buildUrl(basePath, { ...filters, category: rest, page: '' }))}">${esc(c?.name || slug)} ${icon('close', { size: 13 })}</a>`
                );
              }
            )}
            ${filters.type
              ? raw(
                  `<a class="chip" href="${esc(buildUrl(basePath, { ...filters, type: '', page: '' }))}">${filters.type === 'preorder' ? 'Pre-Order' : 'Ready Stock'} ${icon('close', { size: 13 })}</a>`
                )
              : ''}
            ${filters.minPrice || filters.maxPrice
              ? raw(
                  `<a class="chip" href="${esc(buildUrl(basePath, { ...filters, minPrice: '', maxPrice: '', page: '' }))}">${esc(taka(filters.minPrice || 0))} – ${esc(taka(filters.maxPrice || data.priceBounds?.max || 0))} ${icon('close', { size: 13 })}</a>`
                )
              : ''}
            ${filters.isNew ? raw(`<a class="chip" href="${esc(buildUrl(basePath, { ...filters, isNew: false, page: '' }))}">New ${icon('close', { size: 13 })}</a>`) : ''}
            ${filters.discounted ? raw(`<a class="chip" href="${esc(buildUrl(basePath, { ...filters, discounted: false, page: '' }))}">Discounted ${icon('close', { size: 13 })}</a>`) : ''}
            ${showFilters
              ? html`<button class="chip chip--btn" type="button" data-filters-open>
                  ${icon('filter', { size: 14 })} Filters${activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>`
              : ''}
          </div>

          ${items.length
            ? html`
                <div class="pgrid pgrid--4">${items.map((p, i) => productCard(p, { priority: i < 4 }))}</div>
                ${pagination(page, pages, pageUrl)}
              `
            : emptyState({
                title: filters.q ? `No products match "${filters.q}"` : 'No products here yet',
                message: 'Try a different search, remove some filters, or browse our categories.',
                action: `<a class="btn btn--primary" href="/products">Browse all products</a>`,
                icon: 'search',
              })}
        </div>
      </div>
    </div>
  `;
}

function hiddenFilters(filters, basePath, skip = []) {
  const keep = [
    ['q', filters.q],
    ['type', filters.type],
    ['min', filters.minPrice],
    ['max', filters.maxPrice],
    ['new', filters.isNew ? '1' : ''],
    ['off', filters.discounted ? '1' : ''],
    ['stock', filters.inStock ? '1' : ''],
  ].filter(([k]) => !skip.includes(k));

  return keep
    .map(([k, v]) => (v ? `<input type="hidden" name="${k}" value="${esc(v)}">` : ''))
    .join('');
}

function pagination(page, pages, pageUrl) {
  if (pages <= 1) return '';
  const nums = [];
  const push = (n) => nums.push(n);

  push(1);
  for (let n = page - 2; n <= page + 2; n += 1) if (n > 1 && n < pages) push(n);
  if (pages > 1) push(pages);

  const unique = [...new Set(nums)].sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const n of unique) {
    if (prev && n - prev > 1) items.push(html`<span class="pager__gap">…</span>`);
    items.push(
      n === page
        ? html`<span class="pager__num is-active" aria-current="page">${n}</span>`
        : html`<a class="pager__num" href="${pageUrl(n)}">${n}</a>`
    );
    prev = n;
  }

  return html`
    <nav class="pager" aria-label="Pagination">
      ${page > 1
        ? html`<a class="pager__step" href="${pageUrl(page - 1)}" rel="prev">${icon('chevronLeft', { size: 16 })} Previous</a>`
        : html`<span class="pager__step is-disabled">${icon('chevronLeft', { size: 16 })} Previous</span>`}
      <div class="pager__nums">${items}</div>
      ${page < pages
        ? html`<a class="pager__step" href="${pageUrl(page + 1)}" rel="next">Next ${icon('chevronRight', { size: 16 })}</a>`
        : html`<span class="pager__step is-disabled">Next ${icon('chevronRight', { size: 16 })}</span>`}
    </nav>
  `;
}

export { itemListSchema, breadcrumbSchema };
