/**
 * AWAJ admin client script.
 * Auto-submitting filters, variant rows, image upload previews, confirmations.
 */

const csrf = window.AWAJ_ADMIN?.csrf || '';

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */
let toastEl = null;
let toastTimer = null;

function toast(message, kind = 'info') {
  if (!toastEl) {
    toastEl = document.querySelector('[data-toast]');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('data-toast', '');
      document.body.append(toastEl);
    }
  }
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.hidden = false;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    setTimeout(() => {
      if (toastEl) toastEl.hidden = true;
    }, 200);
  }, 3000);
}

/* --------------------------------------------------------------------------
   Auto-submit filter forms
   -------------------------------------------------------------------------- */
document.querySelectorAll('[data-autosubmit]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    // Let the explicit Filter button work as a normal GET navigation.
    if (e.submitter && e.submitter.value === 'Filter') return;
    e.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    for (const [k, v] of [...params]) if (!v) params.delete(k);
    window.location.search = params.toString();
  });
});

/* --------------------------------------------------------------------------
   Destructive-action confirmations
   -------------------------------------------------------------------------- */
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-confirm]');
  if (!form) return;
  if (!confirm(form.dataset.confirm)) {
    e.preventDefault();
    e.stopPropagation();
  }
});

/* --------------------------------------------------------------------------
   Slug preview
   -------------------------------------------------------------------------- */
const slugSource = document.querySelector('[data-slug-source]');
const slugPreview = document.querySelector('[data-slug-preview]');
if (slugSource && slugPreview) {
  slugSource.addEventListener('input', () => {
    const base = slugSource.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    slugPreview.textContent = base || 'your-product';
  });
}

/* --------------------------------------------------------------------------
   Discount percentage hint
   -------------------------------------------------------------------------- */
const priceInput = document.querySelector('[data-price-input]');
const compareInput = priceInput?.closest('.card')?.querySelector('input[name="compare_price"]');
const discountHint = document.querySelector('[data-discount-hint]');
if (priceInput && compareInput && discountHint) {
  const update = () => {
    const price = Number(priceInput.value);
    const compare = Number(compareInput.value);
    if (!price || !compare || compare <= price) {
      discountHint.textContent = 'Leave empty if not discounted';
      return;
    }
    const pct = Math.round(((compare - price) / compare) * 100);
    discountHint.textContent = `Customers will see ${pct}% OFF`;
  };
  priceInput.addEventListener('input', update);
  compareInput.addEventListener('input', update);
}

/* --------------------------------------------------------------------------
   Stock type: show/hide the fields that do not apply
   -------------------------------------------------------------------------- */
const typeRadios = document.querySelectorAll('[data-type-radio]');
const stockField = document.querySelector('[data-stock-field]');
const lowStockField = document.querySelector('[data-lowstock-field]');
const deliveryHint = document.querySelector('[data-delivery-hint]');
const minDays = document.querySelector('input[name="delivery_min_days"]');
const maxDays = document.querySelector('input[name="delivery_max_days"]');

function syncTypeFields() {
  const pre = document.querySelector('[data-type-radio]:checked')?.value === 'preorder';
  if (stockField) {
    stockField.hidden = pre;
    stockField.querySelector('input')?.toggleAttribute('disabled', pre);
  }
  if (lowStockField) lowStockField.hidden = pre;
  if (deliveryHint) {
    deliveryHint.textContent = pre
      ? 'Pre-order items are made to order, so local stock is not tracked. The estimate is shown to customers.'
      : 'Ready stock ships from Bangladesh. The estimate is shown to customers.';
  }
  if (!pre && minDays && !minDays.value) minDays.value = '1';
  if (!pre && maxDays && !maxDays.value) maxDays.value = '3';
}
typeRadios.forEach((r) => r.addEventListener('change', syncTypeFields));
syncTypeFields();

/* --------------------------------------------------------------------------
   Hot deal fields toggle
   -------------------------------------------------------------------------- */
const dealToggle = document.querySelector('[data-deal-toggle]');
const dealFields = document.querySelector('[data-deal-fields]');
function syncDeal() {
  if (dealFields) dealFields.hidden = !dealToggle?.checked;
}
dealToggle?.addEventListener('change', syncDeal);
syncDeal();

/* --------------------------------------------------------------------------
   Variant rows
   -------------------------------------------------------------------------- */
const variantRows = document.querySelector('[data-variant-rows]');
if (variantRows) {
  document.querySelector('[data-add-variant]')?.addEventListener('click', () => {
    const first = variantRows.querySelector('.varrow');
    if (!first) return;
    const clone = first.cloneNode(true);
    clone.querySelectorAll('input').forEach((i) => {
      if (i.name === 'variant_id') i.value = '';
      if (i.type === 'number') i.value = '0';
    });
    variantRows.append(clone);
    clone.querySelector('input')?.focus();
  });

  variantRows.addEventListener('click', (e) => {
    if (!e.target.closest('[data-remove-variant]')) return;
    const row = e.target.closest('.varrow');
    if (variantRows.querySelectorAll('.varrow').length <= 1) {
      row.querySelectorAll('input').forEach((i) => (i.value = i.name === 'variant_delta' || i.name === 'variant_stock' ? '0' : ''));
      return;
    }
    row.remove();
  });
}

/* --------------------------------------------------------------------------
   Image upload previews + image actions
   -------------------------------------------------------------------------- */
const imageInput = document.querySelector('[data-image-input]');
const previews = document.querySelector('[data-image-previews]');
if (imageInput && previews) {
  imageInput.addEventListener('change', () => {
    previews.innerHTML = '';
    [...imageInput.files].slice(0, 8).forEach((file) => {
      const url = URL.createObjectURL(file);
      const wrap = document.createElement('div');
      wrap.className = 'uploader__preview';
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name;
      const label = document.createElement('span');
      label.textContent = `${(file.size / 1024).toFixed(0)} KB`;
      wrap.append(img, label);
      previews.append(wrap);
    });
    toast(`${imageInput.files.length} image(s) ready to upload on save`, 'success');
  });
}

document.addEventListener('click', async (e) => {
  const moveBtn = e.target.closest('[data-move-image]');
  if (moveBtn) {
    e.preventDefault();
    await imageAction(moveBtn.dataset.moveImage, 'move', { dir: moveBtn.dataset.dir });
    return;
  }
  const delBtn = e.target.closest('[data-delete-image]');
  if (delBtn) {
    e.preventDefault();
    if (!confirm('Delete this image? The product keeps its other images.')) return;
    await imageAction(delBtn.dataset.deleteImage, 'delete');
  }
});

async function imageAction(imageId, action, extra = {}) {
  try {
    const res = await fetch('/admin/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ imageId, action, _csrf: csrf, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'Could not update the image', 'error');
      return;
    }
    toast(action === 'delete' ? 'Image deleted' : 'Image order updated', 'success');
    setTimeout(() => window.location.reload(), 500);
  } catch {
    toast('Network error while updating the image', 'error');
  }
}

/* --------------------------------------------------------------------------
   Submit guards
   -------------------------------------------------------------------------- */
document.querySelectorAll('form').forEach((form) => {
  form.addEventListener('submit', () => {
    const btn = form.querySelector('[data-submit]');
    if (!btn) return;
    // A file upload can take a moment, so give feedback rather than freezing.
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Saving…';
    btn.disabled = true;
    // Re-enable if the browser restores the page from bfcache.
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText;
    }, 12000);
  });
});

/* --------------------------------------------------------------------------
   Warn before leaving a dirty product form
   -------------------------------------------------------------------------- */
const productForm = document.querySelector('[data-product-form]');
if (productForm) {
  let dirty = false;
  productForm.addEventListener('input', () => { dirty = true; });
  productForm.addEventListener('submit', () => { dirty = false; });
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
