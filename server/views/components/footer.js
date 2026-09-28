/** Site footer (Requirement 26). */
import { html, raw } from  '../../lib/utils.js';
import { icon } from './ui.js';
import { whatsappLink } from './header.js';

const QUICK_LINKS = [
  ['Home', '/'],
  ['All Products', '/products'],
  ['Ready Stock', '/ready-stock'],
  ['Pre-Order from China', '/pre-order'],
  ['Hot Deals', '/deals'],
  ['Track Order', '/track-order'],
  ['About AWAJ', '/about'],
  ['Contact Us', '/contact'],
];

export function footer({ settings, categories = [] }) {
  const year = new Date().getFullYear();
  const fb = settings['contact.facebook_url'];
  const supportLinks = [
    settings['contact.whatsapp']
      ? { href: whatsappLink(settings['contact.whatsapp'], 'Hello AWAJ, I need support.'), label: 'WhatsApp', icon: 'whatsapp' }
      : null,
    fb ? { href: fb, label: 'Facebook', icon: 'facebook', external: true } : null,
    settings['contact.support_phone']
      ? { href: `tel:${String(settings['contact.support_phone']).replace(/[^\d+]/g, '')}`, label: settings['contact.support_phone'], icon: 'phone' }
      : null,
    settings['contact.support_email']
      ? { href: `mailto:${settings['contact.support_email']}`, label: settings['contact.support_email'], icon: 'mail' }
      : null,
  ].filter(Boolean);

  return html`
    <footer class="footer">
      <div class="footer__cta">
        <div class="container footer__cta-inner">
          <div>
            <h2 class="footer__cta-title">China trends, delivered to your door</h2>
            <p class="footer__cta-text">
              Buy <strong>Ready Stock</strong> for delivery in 1-3 days, or <strong>Pre-Order</strong> from China in 7-10 days.
              Cash on Delivery available nationwide.
            </p>
          </div>
          <div class="footer__cta-actions">
            <a class="btn btn--primary" href="/ready-stock">${icon('box', { size: 17 })} Shop Ready Stock</a>
            <a class="btn btn--preorder" href="/pre-order">${icon('truck', { size: 17 })} Explore Pre-Order</a>
          </div>
        </div>
      </div>

      <div class="container footer__grid">
        <div class="footer__col footer__col--brand">
          <p class="footer__brand">AWAJ</p>
          <p class="footer__tagline">${settings['store.tagline']}</p>
          <p class="footer__about">${settings['store.description']}</p>
          <div class="footer__social">
            ${fb
              ? html`<a href="${fb}" target="_blank" rel="noopener noreferrer" aria-label="Follow AWAJ on Facebook" title="Facebook"
                  >${icon('facebook', { size: 19 })}</a
                >`
              : ''}
            ${settings['contact.instagram_url']
              ? html`<a
                  href="${settings['contact.instagram_url']}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AWAJ on Instagram"
                  title="Instagram"
                  >${icon('instagram', { size: 19 })}</a
                >`
              : ''}
            ${settings['contact.tiktok_url']
              ? html`<a
                  href="${settings['contact.tiktok_url']}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AWAJ on TikTok"
                  title="TikTok"
                  >${icon('tiktok', { size: 19 })}</a
                >`
              : ''}
            ${settings['contact.whatsapp']
              ? html`<a
                  href="${whatsappLink(settings['contact.whatsapp'], 'Hello AWAJ!')}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AWAJ on WhatsApp"
                  title="WhatsApp"
                  >${icon('whatsapp', { size: 19 })}</a
                >`
              : ''}
          </div>
        </div>

        <div class="footer__col">
          <h3 class="footer__heading">Quick Links</h3>
          <ul class="footer__links">
            ${QUICK_LINKS.map(([label, href]) => html`<li><a href="${href}">${label}</a></li>`)}
          </ul>
        </div>

        <div class="footer__col">
          <h3 class="footer__heading">Shop by Category</h3>
          <ul class="footer__links">
            ${categories.slice(0, 8).map((c) => html`<li><a href="/category/${c.slug}">${c.name}</a></li>`)}
          </ul>
        </div>

        <div class="footer__col">
          <h3 class="footer__heading">Customer Support</h3>
          <ul class="footer__links">
            ${supportLinks.map(
              (l) => html`<li>
                <a href="${l.href}" ${l.external ? raw('target="_blank" rel="noopener noreferrer"') : ''}>
                  ${icon(l.icon, { size: 15 })} ${l.label}
                </a>
              </li>`
            )}
            <li><a href="/track-order">${icon('package', { size: 15 })} Track Order</a></li>
            <li><a href="/contact">${icon('info', { size: 15 })} Send a message</a></li>
          </ul>
        </div>

        <div class="footer__col">
          <h3 class="footer__heading">Policies</h3>
          <ul class="footer__links">
            <li><a href="/p/shipping-policy">Shipping Policy</a></li>
            <li><a href="/p/return-policy">Return &amp; Refund</a></li>
            <li><a href="/p/privacy-policy">Privacy Policy</a></li>
            <li><a href="/p/terms">Terms &amp; Conditions</a></li>
          </ul>
        </div>
      </div>

      <div class="footer__bar">
        <div class="container footer__bar-inner">
          <p>© ${year} AWAJ. All rights reserved.</p>
          <p class="footer__pay">
            <span>Payment:</span>
            <span class="paychip">Cash on Delivery</span>
            <span class="paychip">bKash</span>
            <span class="paychip">Nagad</span>
            <span class="paychip">Bank</span>
          </p>
        </div>
      </div>
    </footer>
  `;
}
