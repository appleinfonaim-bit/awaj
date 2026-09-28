/** Static-ish content pages: about, contact, policy, wishlist, 404. */
import { html, raw, esc, taka } from  '../../lib/utils.js';
import { icon, emptyState } from  '../components/ui.js';
import { productGrid } from '../components/product-card.js';
import { whatsappLink } from '../components/header.js';

/* -------------------------------------------------------------------------- */
/* About (Requirement 27)                                                      */
/* -------------------------------------------------------------------------- */

export function aboutPage({ ctx, data }) {
  const s = ctx.settings;
  const { stats } = data;

  return html`
    <div class="container page prose-page">
      <h1 class="page__title">About AWAJ</h1>
      <p class="page__lead">${s['store.description']}</p>

      <div class="statstrip">
        ${stat('Products', stats.total)}
        ${stat('Ready Stock items', stats.readyStock)}
        ${stat('Pre-Order items', stats.preorder)}
      </div>

      <h2>What we do</h2>
      <p>
        AWAJ imports products from China and sells them to customers across Bangladesh. We focus on
        gadgets, electronics, mobile accessories, fashion, bags, shoes, beauty, home and kitchen
        items, and the trending Chinese products that Bangladeshi shoppers keep asking for.
      </p>
      <p>
        Instead of running a traditional marketplace where sellers compete on price, we run a
        sourcing shop. You tell us what you want, and we either ship it to you from stock we
        already hold in Bangladesh, or we order it from our supplier in China for you.
      </p>

      <h2>Ready Stock vs Pre-Order</h2>
      <div class="compare">
        <div class="compare__col compare__col--ready">
          <p class="badge badge--lg badge--ready">Ready Stock</p>
          <h3>Available in Bangladesh</h3>
          <p>
            The product is already in our warehouse. Place your order and we dispatch within
            24-48 hours, usually reaching you in 1-3 days. No waiting, no customs.
          </p>
          <a class="btn btn--primary" href="/ready-stock">Shop Ready Stock</a>
        </div>
        <div class="compare__col compare__col--pre">
          <p class="badge badge--lg badge--preorder">Pre-Order</p>
          <h3>Ordered from China for you</h3>
          <p>
            We do not stock this yet. After you order, we purchase it from our supplier in China.
            Estimated delivery is 7-10 days depending on shipping and customs clearance.
          </p>
          <a class="btn btn--preorder" href="/pre-order">Explore Pre-Order</a>
        </div>
      </div>

      <h2>How we keep prices fair</h2>
      <p>
        As a sourcing business rather than a marketplace, we control the whole chain from supplier
        to your door. That means fewer middlemen, and it means we can show you the real price
        without a markup for advertising or platform fees.
      </p>
      <ul class="ticks">
        <li>Every product is checked before it is packed and sent</li>
        <li>Cash on Delivery available nationwide, so you do not pay upfront</li>
        <li>Delivery charge is shown before you confirm, never added later</li>
        <li>We reply on WhatsApp, usually within minutes during business hours</li>
      </ul>

      <h2>Our promise to you</h2>
      <p>
        We will always be clear about whether an item is Ready Stock or Pre-Order, and we will
        always tell you the delivery cost before you pay. If something is not as described,
        contact us and we will make it right.
      </p>

      <h2>Still have questions?</h2>
      <p>
        <a href="/contact">Send us a message</a>, or
        ${s['contact.whatsapp']
          ? html`<a href="${whatsappLink(s['contact.whatsapp'], 'Hello AWAJ, I have a question.')}" target="_blank" rel="noopener noreferrer">chat on WhatsApp</a>`
          : 'call us'} &mdash; we are happy to help.
      </p>
    </div>
  `;
}

const stat = (label, value) => html`
  <div class="statstrip__item">
    <p class="statstrip__value">${value}</p>
    <p class="statstrip__label">${label}</p>
  </div>
`;

/* -------------------------------------------------------------------------- */
/* Contact                                                                     */
/* -------------------------------------------------------------------------- */

export function contactPage({ ctx, data }) {
  const s = ctx.settings;
  const hasAny = s['contact.whatsapp'] || s['contact.support_phone'] || s['contact.support_email'] || s['contact.facebook_url'];

  return html`
    <div class="container page prose-page">
      <h1 class="page__title">Contact Us</h1>
      <p class="page__lead">
        The fastest way to reach us is WhatsApp. We usually reply within minutes during business hours.
      </p>

      ${hasAny
        ? html`<div class="contactgrid">
            ${s['contact.whatsapp']
              ? html`<a class="contactcard contactcard--wa" target="_blank" rel="noopener noreferrer"
                  href="${whatsappLink(s['contact.whatsapp'], 'Hello AWAJ, I need help.')}">
                  <span class="contactcard__icon">${icon('whatsapp', { size: 24 })}</span>
                  <h2>WhatsApp</h2>
                  <p>+${s['contact.whatsapp']}</p>
                  <span class="contactcard__cta">Open chat</span>
                </a>`
              : ''}
            ${s['contact.support_phone']
              ? html`<a class="contactcard" href="tel:${String(s['contact.support_phone']).replace(/[^\d+]/g, '')}">
                  <span class="contactcard__icon">${icon('phone', { size: 24 })}</span>
                  <h2>Phone</h2>
                  <p>${s['contact.support_phone']}</p>
                  <span class="contactcard__cta">Call now</span>
                </a>`
              : ''}
            ${s['contact.support_email']
              ? html`<a class="contactcard" href="mailto:${s['contact.support_email']}">
                  <span class="contactcard__icon">${icon('mail', { size: 24 })}</span>
                  <h2>Email</h2>
                  <p>${s['contact.support_email']}</p>
                  <span class="contactcard__cta">Send email</span>
                </a>`
              : ''}
            ${s['contact.facebook_url']
              ? html`<a class="contactcard" target="_blank" rel="noopener noreferrer" href="${s['contact.facebook_url']}">
                  <span class="contactcard__icon">${icon('facebook', { size: 24 })}</span>
                  <h2>Facebook</h2>
                  <p>${s['social.facebook_follow_text']}</p>
                  <span class="contactcard__cta">Open page</span>
                </a>`
              : ''}
          </div>`
        : html`<div class="alert alert--warn">
            ${icon('info', { size: 18 })}
            <div>
              Contact details have not been set yet. Add your WhatsApp number, phone and email in
              <strong>Admin &rarr; Settings</strong> and they will appear here.
            </div>
          </div>`}

      <h2>Frequently asked questions</h2>

      <div class="faq">
        ${faq('How long does delivery take?',
          'Ready Stock orders usually arrive in 1-3 days. Pre-Order products are sourced from China and normally take 7-10 days.')}
        ${faq('Do I pay online?',
          'No. Cash on Delivery is available nationwide. You can also pay by bKash, Nagad or bank transfer if you prefer.')}
        ${faq('What is the delivery charge?',
          `Delivery is charged once per order: ${taka(s['delivery.inside_dhaka'])} inside Dhaka and ${taka(s['delivery.outside_dhaka'])} outside Dhaka. The exact amount is shown at checkout based on your district.`)}
        ${faq('Do I need an account to order?',
          'No. Guest checkout is supported on purpose, so you can order without registering. Keep your order ID safe so you can track the parcel.')}
        ${faq('Can I exchange a product?',
          'Ready Stock items can be exchanged within 7 days if unused and in original packaging. Imported pre-order items can only be exchanged for defects, since they are sourced specifically for you.')}
        ${faq('How do I track my order?',
          `Use the Track Order page with your order ID (for example ${'AWAJ-7Q8R32'}) and the phone number you ordered with. No account needed.`)}
      </div>
    </div>
  `;
}

const faq = (q, a) => html`
  <details class="faq__item">
    <summary class="faq__q">${q} ${icon('chevronDown', { size: 16 })}</summary>
    <p class="faq__a">${a}</p>
  </details>
`;

/* -------------------------------------------------------------------------- */
/* Policy pages                                                                */
/* -------------------------------------------------------------------------- */

const POLICIES = {
  'shipping-policy': { title: 'Shipping Policy', key: 'content.shipping_policy' },
  'return-policy': { title: 'Return & Refund Policy', key: 'content.return_policy' },
  'privacy-policy': { title: 'Privacy Policy', key: 'content.privacy_policy' },
  terms: { title: 'Terms & Conditions', key: 'content.terms' },
};

export function policyPage({ ctx, data }) {
  const policy = POLICIES[data.policy];
  const body = ctx.settings[policy.key] || '';

  return html`
    <div class="container page prose-page">
      <h1 class="page__title">${policy.title}</h1>
      <div class="prose">${raw(paragraphs(body))}</div>
      <p class="muted small">Last updated ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}</p>
      <p>
        Need something clarified? <a href="/contact">Contact us</a>${ctx.settings['contact.whatsapp'] ? ' or message us on WhatsApp' : ''}.
      </p>
    </div>
  `;
}

const paragraphs = (text) =>
  String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join('\n');

/* -------------------------------------------------------------------------- */
/* Wishlist                                                                    */
/* -------------------------------------------------------------------------- */

export function wishlistPage({ data, ctx }) {
  return html`
    <div class="container page">
      <h1 class="page__title">Your Wishlist</h1>
      <p class="page__sub">Saved on this device. Sign-in is not required.</p>

      <div data-wishlist-root data-empty-message="Your wishlist is empty. Tap the heart on any product to save it here.">
        ${data.products.length
          ? productGrid(data.products, { priorityCount: 0 })
          : emptyState({
              title: 'Your wishlist is empty',
              message: 'Tap the heart on any product to save it for later.',
              action: `<a class="btn btn--primary" href="/products">Browse products</a>`,
              icon: 'heart',
            })}
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Image search results                                                        */
/* -------------------------------------------------------------------------- */

export function imageSearchPage({ data, ctx }) {
  const { result, provider, uploadedImage, query, error } = data;

  return html`
    <div class="container page">
      <h1 class="page__title">${icon('camera', { size: 22 })} Search by Image</h1>
      <p class="page__sub">
        Upload a photo of a product and AWAJ will show you items that look similar.
      </p>

      <form class="imgsearch" method="post" action="/image-search" enctype="multipart/form-data" data-imgsearch>
        <div class="imgsearch__drop" data-drop>
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/avif" required data-file />
          <div class="imgsearch__preview" data-preview>
            ${uploadedImage
              ? html`<img src="${uploadedImage}" alt="Uploaded product photo" />`
              : html`<span class="imgsearch__ph">${icon('image', { size: 30 })}<span>Tap to choose a photo</span></span>`}
          </div>
          <p class="imgsearch__hint">JPG, PNG, WebP or AVIF. Max 8 MB. The photo is used for matching only.</p>
        </div>
        <div class="imgsearch__fields">
          <label class="field">
            <span class="field__label">Describe what you are looking for (optional)</span>
            <input type="text" name="q" value="${query || ''}" placeholder="e.g. wireless charger, blue bag" />
            <span class="field__hint">Adding a description makes the results much more accurate.</span>
          </label>
          <button class="btn btn--primary btn--lg" type="submit">
            ${icon('search', { size: 17 })} Find Similar Products
          </button>
        </div>
      </form>

      ${provider?.note
        ? html`<div class="notice notice--info">
            ${icon('info', { size: 18 })}<div>${provider.note}</div>
          </div>`
        : ''}

      ${error
        ? html`<div class="alert alert--error" role="alert">${icon('alert', { size: 18 })}<div>${error}</div></div>`
        : ''}

      ${result
        ? html`<section class="section">
            <h2 class="section__title">
              ${result.total} similar product${result.total === 1 ? '' : 's'}
            </h2>
            ${result.items.length
              ? productGrid(result.items, { priorityCount: 0 })
              : emptyState({
                  title: 'No close matches yet',
                  message: 'Try a different photo, or describe the product so we can search by name instead.',
                  icon: 'camera',
                })}
          </section>`
        : ''}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export function notFoundPage({ ctx }) {
  return html`
    <div class="container page">
      <div class="empty empty--page">
        <p class="empty__code">404</p>
        <h1 class="empty__title">We could not find that page</h1>
        <p class="empty__msg">
          The link may be old or the product may have sold out and been removed.
        </p>
        <div class="empty__actions">
          <a class="btn btn--primary" href="/">Back to home</a>
          <a class="btn btn--ghost" href="/products">Browse products</a>
          <a class="btn btn--ghost" href="/contact">Contact support</a>
        </div>
      </div>
    </div>
  `;
}

export function errorPage({ ctx, data }) {
  return html`
    <div class="container page">
      <div class="empty empty--page">
        <p class="empty__code">${data.status || 500}</p>
        <h1 class="empty__title">${data.title || 'Something went wrong'}</h1>
        <p class="empty__msg">${data.message || 'We hit an unexpected problem. Please try again.'}</p>
        <div class="empty__actions">
          <a class="btn btn--primary" href="/">Back to home</a>
          <a class="btn btn--wa" target="_blank" rel="noopener noreferrer"
            href="${whatsappLink(ctx.settings['contact.whatsapp'], 'Hello AWAJ, I hit an error on your website.')}">
            ${icon('whatsapp', { size: 17 })} Report on WhatsApp
          </a>
        </div>
      </div>
    </div>
  `;
}
