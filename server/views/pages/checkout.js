/**
 * One-page guest checkout (Requirements 15-17, 25).
 * No account required, no multi-step wizard.
 */
import { html, raw, esc, taka, daysRange } from '../../lib/utils.js';
import { icon } from '../components/ui.js';
import { whatsappLink } from '../components/header.js';
import { DISTRICTS } from '../../config.js';

export function checkoutPage({ data, ctx }) {
  const { priced, values = {}, errors = {}, settings, stockError } = data;
  const { lines, subtotal, itemCount, hasPreorder, hasReadyStock, estimatedDays } = priced;

  if (!lines.length) {
    return html`
      <div class="container page">
        <h1 class="page__title">Checkout</h1>
        <div class="alert alert--warn">
          ${icon('cart', { size: 18 })}
          <div>Your cart is empty. <a href="/products">Browse products</a> to continue.</div>
        </div>
      </div>
    `;
  }

  // Live delivery preview: recomputed client-side as the district changes.
  const insideFee = Number(settings['delivery.inside_dhaka']) || 0;
  const outsideFee = Number(settings['delivery.outside_dhaka']) || 0;
  const freeThreshold = Number(settings['delivery.free_threshold']) || 0;

  return html`
    <div class="container page">
      <h1 class="page__title">Checkout</h1>
      <p class="page__sub">
        No account needed. Fill in your details and we will call to confirm your order.
      </p>

      ${stockError
        ? html`<div class="alert alert--error" role="alert">
            ${icon('alert', { size: 18 })}<div>${stockError}</div>
          </div>`
        : ''}

      <form class="checkout" method="post" action="/checkout" data-checkout novalidate>
        <div class="checkout__main">
          <!-- ============ CUSTOMER DETAILS ============ -->
          <section class="card" aria-labelledby="co-details">
            <h2 class="card__title" id="co-details">
              <span class="card__step">1</span> Your Details
            </h2>

            <div class="field-grid">
              <label class="field ${errors.name ? 'has-error' : ''}">
                <span class="field__label">Full Name <em>*</em></span>
                <input type="text" name="name" value="${values.name || ''}" required maxlength="80"
                  autocomplete="name" placeholder="e.g. Rahim Uddin" />
                ${errors.name ? raw(`<span class="field__err">${esc(errors.name)}</span>`) : ''}
              </label>

              <label class="field ${errors.phone ? 'has-error' : ''}">
                <span class="field__label">Mobile Number <em>*</em></span>
                <input type="tel" name="phone" value="${values.phone || ''}" required
                  inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" data-phone />
                ${errors.phone
                  ? raw(`<span class="field__err">${esc(errors.phone)}</span>`)
                  : raw('<span class="field__hint">We call this number to confirm your order</span>')}
              </label>

              <label class="field ${errors.whatsapp ? 'has-error' : ''}">
                <span class="field__label">WhatsApp Number</span>
                <input type="tel" name="whatsapp" value="${values.whatsapp || values.phone || ''}"
                  inputmode="numeric" placeholder="Same as mobile (optional)" data-whatsapp />
                ${errors.whatsapp ? raw(`<span class="field__err">${esc(errors.whatsapp)}</span>`) : ''}
              </label>

              <label class="field ${errors.district ? 'has-error' : ''}">
                <span class="field__label">District <em>*</em></span>
                <select name="district" required data-district>
                  <option value="">Select district</option>
                  ${DISTRICTS.map(
                    (d) => html`<option value="${d}" ${values.district === d ? 'selected' : ''}>${d}</option>`
                  )}
                </select>
                ${errors.district ? raw(`<span class="field__err">${esc(errors.district)}</span>`) : ''}
              </label>

              <label class="field">
                <span class="field__label">Area / Thana</span>
                <input type="text" name="area" value="${values.area || ''}" maxlength="80"
                  placeholder="e.g. Mirpur DOHS" autocomplete="address-level2" />
              </label>

              <label class="field field--wide ${errors.address ? 'has-error' : ''}">
                <span class="field__label">Full Address <em>*</em></span>
                <textarea name="address" rows="3" required maxlength="300"
                  placeholder="House / flat, road, landmark" autocomplete="street-address">${values.address || ''}</textarea>
                ${errors.address ? raw(`<span class="field__err">${esc(errors.address)}</span>`) : ''}
              </label>

              <label class="field field--wide">
                <span class="field__label">Additional Note</span>
                <textarea name="note" rows="2" maxlength="400"
                  placeholder="Landmark, preferred delivery time, or anything else">${values.note || ''}</textarea>
                <span class="field__hint">Optional</span>
              </label>
            </div>
          </section>

          <!-- ============ PAYMENT ============ -->
          <section class="card" aria-labelledby="co-pay">
            <h2 class="card__title" id="co-pay">
              <span class="card__step">2</span> Payment Method
            </h2>

            ${errors.payment ? raw(`<div class="alert alert--error">${esc(errors.payment)}</div>`) : ''}

            <div class="paylist">
              ${settings.paymentMethods.map(
                (m, i) => html`
                  <label class="payopt">
                    <input type="radio" name="payment" value="${m.id}"
                      ${(values.payment || 'cod') === m.id ? 'checked' : ''} required />
                    <span class="payopt__body">
                      <span class="payopt__name">${m.label}</span>
                      <span class="payopt__hint">${m.hint}</span>
                    </span>
                    ${m.id === 'cod' ? raw(`<span class="paychip paychip--on">Popular</span>`) : ''}
                  </label>
                `
              )}
            </div>

            ${(settings['payment.bkash.number'] || settings['payment.nagad.number'] || settings['payment.bank.details'])
              ? html`<p class="paynote">${icon('info', { size: 15 })} ${settings['payment.instructions']}</p>`
              : ''}
          </section>
        </div>

        <!-- ============ ORDER SUMMARY ============ -->
        <aside class="checkout__side">
          <div class="summary summary--sticky">
            <h2 class="summary__title">Your Order</h2>

            <ul class="checkout__items">
              ${lines.map(
                (l) => html`<li class="checkout__item">
                  <span class="checkout__thumb">
                    ${l.image ? html`<img src="/uploads/${l.image}" alt="" width="52" height="52" loading="lazy" />` : ''}
                    <span class="checkout__qty">${l.qty}</span>
                  </span>
                  <span class="checkout__info">
                    <span class="checkout__name">${l.title}</span>
                    ${l.variantLabel ? raw(`<span class="checkout__var">${esc(l.variantLabel)}</span>`) : ''}
                    <span class="badge badge--sm badge--${l.is_preorder ? 'preorder' : 'ready'}">
                      ${l.is_preorder ? 'Pre-Order' : 'Ready Stock'}
                    </span>
                  </span>
                  <span class="checkout__price">${taka(l.lineTotal)}</span>
                </li>`
              )}
            </ul>

            <dl class="summary__rows">
              <div class="summary__row">
                <dt>Product total (${itemCount})</dt>
                <dd data-sum-subtotal>${taka(subtotal)}</dd>
              </div>
              <div class="summary__row">
                <dt>Delivery</dt>
                <dd data-sum-delivery>Select district</dd>
              </div>
            </dl>

            <div class="summary__total">
              <span>Total</span>
              <strong data-sum-total>${taka(subtotal)}</strong>
            </div>

            <p class="summary__est">
              ${icon('truck', { size: 15 })}
              Estimated delivery: <strong>${daysRange(estimatedDays.min, estimatedDays.max)}</strong>
            </p>

            ${hasPreorder && hasReadyStock
              ? html`<p class="summary__mixed">${icon('info', { size: 14 })} Includes both ready stock and pre-order items, shipped together.</p>`
              : ''}

            <button class="btn btn--primary btn--block btn--lg" type="submit" data-submit>
              ${icon('checkCircle', { size: 18 })} Place Order
            </button>

            <p class="summary__legal">
              By placing this order you confirm your name, phone number and address are correct.
              We will call to confirm before dispatch.
            </p>

            <a class="btn btn--ghost btn--block" href="/cart">${icon('chevronLeft', { size: 15 })} Back to cart</a>
          </div>
        </aside>
      </form>

      <!-- Config the client script reads to recompute the delivery charge live -->
      <script>
        window.AWAJ_CHECKOUT = ${raw(
          JSON.stringify({
            subtotal,
            insideDhaka: insideFee,
            outsideDhaka: outsideFee,
            freeThreshold,
            insideDistricts: INSIDE_DHAKA_LIST,
          })
        )};
      </script>
    </div>
  `;
}

/** Districts charged at the "inside Dhaka" rate. Mirrors server/config.js. */
const INSIDE_DHAKA_LIST = [
  'Dhaka', 'Gazipur', 'Narayanganj', 'Narsingdi', 'Munshiganj', 'Manikganj', 'Faridpur', 'Tongi',
];

/* -------------------------------------------------------------------------- */
/* Order confirmation (Requirement 15)                                         */
/* -------------------------------------------------------------------------- */

export function orderConfirmationPage({ data, ctx }) {
  const { order, items, settings } = data;

  return html`
    <div class="container page confirm">
      <div class="confirm__hero">
        <span class="confirm__icon">${icon('checkCircle', { size: 34 })}</span>
        <h1 class="confirm__title">Order placed successfully</h1>
        <p class="confirm__sub">
          Thank you, ${order.customer_name}. We have received your order and will call you shortly to confirm.
        </p>
      </div>

      <div class="confirm__code">
        <p class="confirm__code-label">Your Order ID</p>
        <p class="confirm__code-value">${order.order_code}</p>
        <p class="confirm__code-hint">
          Save this ID. You can use it with your phone number to <a href="/track-order">track your order</a>.
        </p>
        <button class="btn btn--ghost btn--sm" type="button" data-copy="${order.order_code}">
          ${icon('copy', { size: 15 })} Copy ID
        </button>
      </div>

      <div class="confirm__grid">
        <div class="card">
          <h2 class="card__title">Order Details</h2>
          <dl class="deflist">
            <div><dt>Order ID</dt><dd>${order.order_code}</dd></div>
            <div><dt>Date</dt><dd>${new Date(order.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</dd></div>
            <div><dt>Payment</dt><dd>${order.paymentLabel}</dd></div>
            <div>
              <dt>Status</dt>
              <dd><span class="badge badge--info">${order.statusLabel}</span></dd>
            </div>
            ${order.product_type === 'preorder'
              ? html`<div><dt>Type</dt><dd><span class="badge badge--preorder">Pre-Order from China</span></dd></div>`
              : html`<div><dt>Type</dt><dd><span class="badge badge--ready">Ready Stock</span></dd></div>`}
          </dl>
        </div>

        <div class="card">
          <h2 class="card__title">Delivery Address</h2>
          <address class="address">
            <strong>${order.customer_name}</strong><br />
            ${order.phone}${order.whatsapp && order.whatsapp !== order.phone ? raw(`<br />WhatsApp: ${esc(order.whatsapp)}`) : ''}<br />
            ${order.area ? `${order.area}, ` : ''}${order.address}<br />
            ${order.district}, Bangladesh
            ${order.note ? raw(`<br /><em>Note: ${esc(order.note)}</em>`) : ''}
          </address>
        </div>
      </div>

      <div class="card">
        <h2 class="card__title">Items</h2>
        <ul class="checkout__items">
          ${items.map(
            (i) => html`<li class="checkout__item">
              <span class="checkout__thumb">
                ${i.image ? html`<img src="/uploads/${i.image}" alt="" width="52" height="52" loading="lazy" />` : ''}
                <span class="checkout__qty">${i.qty}</span>
              </span>
              <span class="checkout__info">
                <span class="checkout__name">${i.title}</span>
                ${i.variant_label ? raw(`<span class="checkout__var">${esc(i.variant_label)}</span>`) : ''}
              </span>
              <span class="checkout__price">${taka(i.line_total)}</span>
            </li>`
          )}
        </ul>
        <dl class="summary__rows">
          <div class="summary__row"><dt>Subtotal</dt><dd>${taka(order.subtotal)}</dd></div>
          <div class="summary__row"><dt>Delivery</dt><dd>${order.delivery_fee === 0 ? html`<span class="free">FREE</span>` : taka(order.delivery_fee)}</dd></div>
        </dl>
        <div class="summary__total"><span>Total</span><strong>${taka(order.total)}</strong></div>
      </div>

      <div class="confirm__actions">
        <a class="btn btn--primary" href="/track-order?code=${order.order_code}">
          ${icon('package', { size: 17 })} Track this order
        </a>
        <a class="btn btn--wa" target="_blank" rel="noopener noreferrer"
          href="${whatsappLink(settings['contact.whatsapp'], `Hello AWAJ, I have placed order ${order.order_code}.`)}">
          ${icon('whatsapp', { size: 17 })} Send confirmation on WhatsApp
        </a>
        <a class="btn btn--ghost" href="/products">Continue shopping</a>
      </div>

      <p class="confirm__note">
        ${icon('info', { size: 15 })}
        ${order.product_type === 'preorder'
          ? settings['delivery.preorder_note']
          : 'Keep your phone nearby. Our delivery agent will call before handing over your parcel.'}
      </p>
    </div>
  `;
}

