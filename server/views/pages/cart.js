/** Cart page (Requirement 24). */
import { html, raw, esc, taka, daysRange } from '../../lib/utils.js';
import { icon, emptyState } from '../components/ui.js';
import { productRail } from '../components/product-card.js';
import { whatsappLink } from '../components/header.js';

export function cartPage({ data, ctx }) {
  const { priced, settings } = data;
  const { lines, subtotal, deliveryFee, total, itemCount, issues } = priced;

  if (!lines.length) {
    return html`
      <div class="container page">
        <h1 class="page__title">Your Cart</h1>
        ${emptyState({
          title: 'Your cart is empty',
          message: 'Browse Ready Stock for fast delivery, or pre-order something trending from China.',
          action: `<a class="btn btn--primary" href="/products">Start shopping</a>`,
          icon: 'cart',
        })}
        ${data.suggestions?.length
          ? html`<section class="section">
              <h2 class="section__title">Trending right now</h2>
              ${productRail(data.suggestions, { label: 'trending products' })}
            </section>`
          : ''}
      </div>
    `;
  }

  const threshold = Number(settings['delivery.free_threshold']) || 0;
  const toFree = threshold > subtotal ? threshold - subtotal : 0;

  return html`
    <div class="container page">
      <h1 class="page__title">
        Your Cart
        <span class="page__count">${itemCount} item${itemCount === 1 ? '' : 's'}</span>
      </h1>

      ${issues.length
        ? html`<div class="alert alert--warn" role="status">
            ${icon('alert', { size: 18 })}
            <div>
              <strong>Your cart was updated</strong>
              <ul class="alert__list">
                ${issues.map((i) => html`<li>${i.message}</li>`)}
              </ul>
            </div>
          </div>`
        : ''}

      ${priced.hasPreorder && priced.hasReadyStock
        ? html`<div class="notice notice--pre">
            ${icon('info', { size: 18 })}
            <div>
              Your cart mixes Ready Stock and Pre-Order items. They ship together, so delivery is
              estimated at <strong>${daysRange(priced.estimatedDays.min, priced.estimatedDays.max)}</strong>.
            </div>
          </div>`
        : priced.hasPreorder
          ? html`<div class="notice notice--pre">
              ${icon('truck', { size: 18 })}
              <div>${settings['delivery.preorder_note']}</div>
            </div>`
          : ''}

      <div class="cart">
        <div class="cart__items">
          <ul class="cartlist" data-cart-list>
            ${lines.map((line) => cartLine(line))}
          </ul>

          <div class="cart__foot">
            <a class="btn btn--ghost" href="/products">${icon('chevronLeft', { size: 16 })} Continue shopping</a>
            <button class="btn btn--text" type="button" data-cart-clear>Clear cart</button>
          </div>
        </div>

        <aside class="summary" aria-labelledby="sum-h">
          <h2 class="summary__title" id="sum-h">Order Summary</h2>

          <dl class="summary__rows">
            <div class="summary__row">
              <dt>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</dt>
              <dd>${taka(subtotal)}</dd>
            </div>
            <div class="summary__row">
              <dt>Delivery</dt>
              <dd>${deliveryFee === 0 ? html`<span class="free">FREE</span>` : taka(deliveryFee)}</dd>
            </div>
            <div class="summary__row summary__row--note">
              <dt colspan="2">
                <small>Final delivery charge is calculated from your district at checkout.</small>
              </dt>
            </div>
          </dl>

          ${toFree > 0
            ? html`<div class="summary__progress">
                <p>Add ${taka(toFree)} more for free delivery</p>
                <div class="bar"><span style="width:${Math.min(100, Math.round((subtotal / threshold) * 100))}%"></span></div>
              </div>`
            : threshold > 0
              ? html`<p class="summary__freegoal">${icon('checkCircle', { size: 15 })} You qualify for free delivery</p>`
              : ''}

          <div class="summary__total">
            <span>Total</span>
            <strong>${taka(total)}</strong>
          </div>

          <a class="btn btn--primary btn--block btn--lg" href="/checkout">
            ${icon('checkCircle', { size: 18 })} Proceed to Checkout
          </a>

          <p class="summary__est">
            ${icon('truck', { size: 15 })}
            Estimated delivery: <strong>${daysRange(priced.estimatedDays.min, priced.estimatedDays.max)}</strong>
          </p>

          <ul class="summary__pay">
            ${settings.paymentMethods.map((m) => html`<li>${m.label}</li>`)}
          </ul>

          <a class="btn btn--wa btn--block" target="_blank" rel="noopener noreferrer"
            href="${whatsappLink(settings['contact.whatsapp'], 'Hello AWAJ, I need help with my cart order.')}">
            ${icon('whatsapp', { size: 17 })} Order on WhatsApp
          </a>
        </aside>
      </div>
    </div>
  `;
}

function cartLine(line) {
  const pre = line.is_preorder;
  return html`
    <li class="cartline" data-line="${line.id}" data-variant="${line.variantId || ''}">
      <a class="cartline__media" href="/product/${line.slug}">
        ${line.image
          ? html`<img src="/uploads/${line.image}" alt="${line.title}" width="96" height="96" loading="lazy" decoding="async" />`
          : html`<span class="cartline__ph">${icon('image', { size: 22 })}</span>`}
      </a>

      <div class="cartline__info">
        <p class="cartline__type">
          <span class="badge badge--${pre ? 'preorder' : 'ready'}">${pre ? 'Pre-Order' : 'Ready Stock'}</span>
          <span class="cartline__sku">${line.sku}</span>
        </p>
        <h3 class="cartline__title"><a href="/product/${line.slug}">${line.title}</a></h3>
        ${line.variantLabel ? raw(`<p class="cartline__variant">${esc(line.variantLabel)}</p>`) : ''}
        <p class="cartline__eta">
          ${icon(pre ? 'truck' : 'box', { size: 13 })}
          ${pre ? 'Estimated 7-10 days' : 'Ships in 1-3 days'}
        </p>

        <div class="cartline__controls">
          <span class="qty qty--sm">
            <button type="button" data-line-minus aria-label="Decrease quantity">${icon('minus', { size: 13 })}</button>
            <input type="number" value="${line.qty}" min="1" max="${line.maxQty}"
              data-line-qty inputmode="numeric" aria-label="Quantity for ${line.title}" />
            <button type="button" data-line-plus aria-label="Increase quantity">${icon('plus', { size: 13 })}</button>
          </span>
          <button class="cartline__remove" type="button" data-line-remove aria-label="Remove ${line.title}">
            ${icon('trash', { size: 15 })}<span>Remove</span>
          </button>
        </div>
      </div>

      <div class="cartline__price">
        <span class="cartline__unit">${taka(line.unitPrice)}</span>
        <strong class="cartline__total" data-line-total>${taka(line.lineTotal)}</strong>
      </div>
    </li>
  `;
}
