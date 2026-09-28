/** Order tracking (Requirement 19). */
import { html, raw, esc, taka, formatDateTime, formatDate } from '../../lib/utils.js';
import { icon, emptyState } from '../components/ui.js';
import { whatsappLink } from '../components/header.js';

export function trackOrderPage({ data, ctx }) {
  const { result, code = '', phone = '', error = '' } = data;
  const settings = ctx.settings;

  return html`
    <div class="container page track">
      <h1 class="page__title">Track Your Order</h1>
      <p class="page__sub">Enter your order ID and the phone number you ordered with.</p>

      <form class="trackform" method="get" action="/track-order" data-track-form>
        <label class="field">
          <span class="field__label">Order ID <em>*</em></span>
          <input type="text" name="code" value="${code}" placeholder="AWAJ-XXXXXX" required
            autocomplete="off" spellcheck="false" data-track-code />
          <span class="field__hint">Shown on your confirmation, e.g. AWAJ-7Q8R32</span>
        </label>
        <label class="field">
          <span class="field__label">Phone Number <em>*</em></span>
          <input type="tel" name="phone" value="${phone}" placeholder="01XXXXXXXXX" required
            inputmode="numeric" data-phone />
        </label>
        <button class="btn btn--primary" type="submit">
          ${icon('search', { size: 17 })} Track Order
        </button>
      </form>

      ${error
        ? html`<div class="alert alert--error" role="alert">
            ${icon('alert', { size: 18 })}<div>${error}</div>
          </div>`
        : ''}

      ${result ? orderResult(result, settings) : !error ? emptyState({
          title: 'Where is my order?',
          message: 'Your tracking timeline will appear here once you enter your order ID and phone number.',
          icon: 'package',
        }) : ''}
    </div>
  `;
}

function orderResult({ order, items, timeline }, settings) {
  return html`
    <div class="orderview" data-order-view>
      <div class="orderview__head">
        <div>
          <p class="orderview__label">Order</p>
          <p class="orderview__code">${order.order_code}</p>
          <p class="orderview__date">Placed ${formatDate(order.created_at)}</p>
        </div>
        <div class="orderview__status">
          <span class="badge badge--lg badge--${order.status === 'cancelled' ? 'danger' : order.status === 'delivered' ? 'success' : 'info'}">
            ${order.statusLabel}
          </span>
          <p class="orderview__pay">${order.paymentLabel} · ${order.total ? taka(order.total) : ''}</p>
        </div>
      </div>

      ${order.status === 'cancelled'
        ? html`<div class="alert alert--warn">
            ${icon('info', { size: 18 })}
            <div>This order was cancelled. If that was not expected, please contact us on WhatsApp.</div>
          </div>`
        : ''}

      <!-- ============ TIMELINE ============ -->
      <ol class="timeline" aria-label="Order progress">
        ${timeline.map(
          (step, i) => html`
            <li class="timeline__step timeline__step--${step.state}">
              <span class="timeline__marker" aria-hidden="true">
                ${step.state === 'done' ? icon('check', { size: 14 }) : step.state === 'cancelled' ? icon('close', { size: 14 }) : ''}
              </span>
              <div class="timeline__body">
                <p class="timeline__label">${step.label}</p>
                ${step.note ? raw(`<p class="timeline__note">${esc(step.note)}</p>`) : ''}
                ${step.at ? raw(`<p class="timeline__time">${esc(formatDateTime(step.at))}</p>`) : ''}
              </div>
            </li>
          `
        )}
      </ol>

      ${order.product_type === 'preorder'
        ? html`<div class="notice notice--pre">
            ${icon('truck', { size: 18 })}
            <div>
              This is a <strong>Pre-Order</strong> product, so it travels from China. The
              China sourcing and shipping steps above apply, and delivery normally takes
              ${esc(String(settings['delivery.preorder_days_min']))}-${esc(String(settings['delivery.preorder_days_max']))} days.
            </div>
          </div>`
        : ''}

      <!-- ============ ITEMS ============ -->
      <div class="orderview__items">
        <h2 class="orderview__h2">Items in this order</h2>
        <ul class="checkout__items">
          ${items.map(
            (i) => html`<li class="checkout__item">
              <span class="checkout__thumb">
                ${i.image ? html`<img src="/uploads/${i.image}" alt="" width="52" height="52" loading="lazy" />` : ''}
                <span class="checkout__qty">${i.qty}</span>
              </span>
              <span class="checkout__info">
                <span class="checkout__name">
                  ${i.slug ? html`<a href="/product/${i.slug}">${i.title}</a>` : i.title}
                </span>
                ${i.variant_label ? raw(`<span class="checkout__var">${esc(i.variant_label)}</span>`) : ''}
              </span>
              <span class="checkout__price">${taka(i.line_total)}</span>
            </li>`
          )}
        </ul>
      </div>

      <div class="orderview__foot">
        <div class="orderview__total">
          <span>Total paid on delivery</span>
          <strong>${taka(order.total)}</strong>
        </div>
        <a class="btn btn--wa" target="_blank" rel="noopener noreferrer"
          href="${whatsappLink(settings['contact.whatsapp'], `Hello AWAJ, I am asking about order ${order.order_code}.`)}">
          ${icon('whatsapp', { size: 17 })} Ask about this order
        </a>
      </div>
    </div>
  `;
}
