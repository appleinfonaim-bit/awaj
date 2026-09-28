/**
 * Page layout: the single HTML document shell.
 *
 * Renders a complete, SEO-correct document server-side. Pages are real HTML on
 * first paint (important for search engines and for Bangladeshi users on slow
 * mobile connections); JavaScript then progressively enhances search
 * suggestions, the cart and the drawer.
 */
import { html, raw, esc, escJson } from '../lib/utils.js';
import { config, BUILD_ID } from '../config.js';
import { header, bottomNav, drawer, floatingWhatsapp } from './components/header.js';
import { footer } from './components/footer.js';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {object} opts.ctx          { settings, categories, cart, stats, currentPath }
 * @param {string} [opts.body]       page HTML
 * @param {string} [opts.breadcrumb] pre-rendered breadcrumbs
 * @param {object[]} [opts.jsonLd]   structured data blocks
 * @param {string} [opts.canonical]  explicit canonical URL
 * @param {boolean} [opts.noindex]
 * @param {string} [opts.bodyClass]
 * @param {string} [opts.headExtra] extra <head> markup
 * @param {string} [opts.scripts]    extra <script> content
 */
export function layout({
  title,
  description = '',
  ctx,
  body,
  breadcrumb = '',
  jsonLd = [],
  canonical = '',
  noindex = false,
  bodyClass = '',
  headExtra = '',
  scripts = '',
}) {
  const { settings, categories, cart, stats, currentPath } = ctx;

  const fullTitle = title.includes('AWAJ') ? title : `${title} | AWAJ`;
  const canonicalUrl = canonical || `${config.siteUrl}${currentPath}`;

  // Image URLs must be absolute for Open Graph / Twitter cards.
  const ogImage = settings['seo.og_image']
    ? `${config.siteUrl}/uploads/${settings['seo.og_image']}`
    : `${config.siteUrl}/img/og-default.svg`;

  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || settings['seo.default_description'])}">
<link rel="canonical" href="${esc(canonicalUrl)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta name="theme-color" content="#4f46e5">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="AWAJ">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || settings['seo.default_description'])}">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:locale" content="en_GB">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description || settings['seo.default_description'])}">
<meta name="twitter:image" content="${esc(ogImage)}">

<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="manifest" href="/site.webmanifest">

<!-- Performance hints: preconnect the image CDN host used for product photos -->
<link rel="dns-prefetch" href="${esc(new URL(config.siteUrl).host)}">

<link rel="stylesheet" href="/css/app.css?v=${BUILD_ID}">
${headExtra}

${jsonLd
  .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
  .join('\n')}

<script>document.documentElement.classList.remove('no-js');</script>
</head>
<body class="${esc(bodyClass)}">
<a class="skiplink" href="#main">Skip to main content</a>

${header({ settings, categories, cart, stats, currentPath })}

<main id="main" class="main">
${breadcrumb}
${body}
</main>

${footer({ settings, categories })}
${bottomNav({ currentPath, cartCount: cart.itemCount })}
${floatingWhatsapp(settings)}
${drawer({ settings, categories, currentPath })}

<!-- Cart + wishlist are mirrored from a signed cookie for guests. -->
<script>
window.AWAJ = ${escJson({
    cart: { items: cart.items || [] },
    csrf: null,
    preorderNotice: settings['delivery.preorder_note'],
  })};
</script>
<script type="module" src="/js/app.js?v=${BUILD_ID}"></script>
${scripts}
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Structured data helpers                                                     */
/* -------------------------------------------------------------------------- */

export function organisationSchema(settings) {
  const sameAs = [
    settings['contact.facebook_url'],
    settings['contact.instagram_url'],
    settings['contact.tiktok_url'],
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: settings['store.name'] || 'AWAJ',
    description: settings['seo.default_description'],
    url: config.siteUrl,
    logo: `${config.siteUrl}/img/logo.svg`,
    sameAs,
    currenciesAccepted: 'BDT',
    paymentAccepted: 'Cash on Delivery, bKash, Nagad, Bank Transfer',
    areaServed: { '@type': 'Country', name: 'Bangladesh' },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'BD',
    },
    contactPoint: [
      settings['contact.whatsapp']
        ? {
            '@type': 'ContactPoint',
            telephone: `+${settings['contact.whatsapp']}`,
            contactType: 'customer service',
            areaServed: 'BD',
            availableLanguage: ['en', 'bn'],
          }
        : null,
      settings['contact.support_phone']
        ? {
            '@type': 'ContactPoint',
            telephone: settings['contact.support_phone'],
            contactType: 'sales',
            areaServed: 'BD',
          }
        : null,
    ].filter(Boolean),
  };
}

export function websiteSchema(settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings['store.name'] || 'AWAJ',
    url: config.siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${config.siteUrl}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: `${config.siteUrl}${item.href}` } : {}),
    })),
  };
}

/** Product structured data, including the stock type as availability. */
export function productSchema(product, settings) {
  const url = `${config.siteUrl}/product/${product.slug}`;
  const inStock =
    product.product_type === 'preorder' ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.subtitle || undefined,
    sku: product.sku,
    url,
    ...(product.image ? { image: [`${config.siteUrl}/uploads/${product.image}`] } : {}),
    brand: { '@type': 'Brand', name: 'AWAJ' },
    ...(product.category ? { category: product.category.name } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BDT',
      price: product.price,
      availability: product.in_stock ? inStock : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'AWAJ' },
      ...(product.delivery_min_days
        ? {
            deliveryLeadTime: {
              '@type': 'QuantitativeValue',
              minValue: product.delivery_min_days,
              maxValue: product.delivery_max_days,
              unitCode: 'DAY',
            },
          }
        : {}),
    },
    ...(product.rating_count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(product.rating_avg).toFixed(1),
            reviewCount: product.rating_count,
          },
        }
      : {}),
    ...(product.reviews?.length
      ? {
          review: product.reviews.slice(0, 3).map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.author },
            datePublished: r.created_at,
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
            reviewBody: r.body,
          })),
        }
      : {}),
  };
}

export function itemListSchema(products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${config.siteUrl}/product/${p.slug}`,
      name: p.title,
    })),
  };
}

export { html, raw, esc };
