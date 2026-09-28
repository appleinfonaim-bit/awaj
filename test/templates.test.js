/**
 * Template + escaping tests.
 *
 * The `html` tag escapes by default and returns a marked String, so
 * interpolating a component's output never double-escapes it. Getting this
 * wrong renders pages as visible source text, which is easy to miss visually
 * but breaks the site completely for customers and search engines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc, escJson, cx, slugify, taka, compactCount, orderCode, plainText, daysRange, url } from '../server/lib/utils.js';

/** html`` returns a marked String object; compare on its primitive form. */
const s = (value) => String(value);

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

test('plain strings are escaped', () => {
  assert.equal(s(html`<p>${'<script>alert(1)</script>'}</p>`), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(esc('" onload="x'), '&quot; onload=&quot;x');
  assert.equal(esc("it's"), 'it&#39;s');
  assert.equal(esc('a & b'), 'a &amp; b');
});

test('attribute injection is neutralised', () => {
  const out = s(html`<a href="${'javascript:alert(1)'}" title="${'x" onclick="evil()'}">click</a>`);
  assert.ok(!out.includes('onclick="evil"'), 'must not break out of the attribute');
  assert.ok(out.includes('&quot;'));
});

test('raw() bypasses escaping for trusted markup', () => {
  assert.equal(s(html`<div>${raw('<b>ok</b>')}</div>`), '<div><b>ok</b></div>');
  assert.equal(s(raw('<b>x</b>')), '<b>x</b>');
});

test('null, undefined and booleans render as empty', () => {
  assert.equal(s(html`<p>${null}${undefined}${false}${true}</p>`), '<p></p>');
});

test('escJson is safe inside a script tag', () => {
  const out = escJson({ evil: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.ok(out.includes('\\u003c'));
});

/* -------------------------------------------------------------------------- */
/* Nesting: the regression that broke the whole storefront                     */
/* -------------------------------------------------------------------------- */

test('an array of rendered markup is NOT escaped again', () => {
  const rows = ['<li>a</li>', '<li>b</li>'];
  const out = s(html`<ul>${rows}</ul>`);
  assert.equal(out, '<ul><li>a</li><li>b</li></ul>');
  assert.ok(!out.includes('&lt;li&gt;'), 'double-escaped output would break rendering');
});

test("a component's output is safe to interpolate directly", () => {
  // This is the shape every view uses: component output nested in a page.
  const badge = html`<span class="badge">Ready Stock</span>`;
  const card = html`<article>${badge}</article>`;
  const page = html`<main>${card}</main>`;

  assert.equal(s(page), '<main><article><span class="badge">Ready Stock</span></article></main>');
  assert.ok(!s(page).includes('&lt;'));
});

test('a component nested inside an array is also safe', () => {
  const item = (n) => html`<li>${n}</li>`;
  const out = s(html`<ul>${[item(1), item(2), item(3)]}</ul>`);
  assert.equal(out, '<ul><li>1</li><li>2</li><li>3</li></ul>');
});

test('user data inside a component is still escaped', () => {
  const userTitle = '<img src=x onerror=alert(1)>';
  const item = (t) => html`<li>${t}</li>`;
  const out = s(html`<ul>${[item(userTitle)]}</ul>`);
  assert.ok(!out.includes('<img'), 'user input must never become live markup');
  assert.ok(out.includes('&lt;img'));
});

test('deep nesting does not accumulate escaping', () => {
  let out = html`${'x'}`;
  for (let i = 0; i < 5; i += 1) out = html`<div>${out}</div>`;
  const text = s(out);
  assert.equal(text, '<div><div><div><div><div>x</div></div></div></div></div>');
  assert.ok(!text.includes('&amp;'), 'escaping must not compound with depth');
});

test('arrays of nulls do not produce the string "null"', () => {
  assert.equal(s(html`<ul>${[null, undefined, false]}</ul>`), '<ul></ul>');
});

test('numbers inside arrays are rendered', () => {
  assert.equal(s(html`<b>${[1, 2, 3]}</b>`), '<b>123</b>');
});

test('marked output stringifies safely in JSON and concatenation', () => {
  const marked = html`<b>ok</b>`;
  assert.equal(`x${marked}y`, 'x<b>ok</b>y');
  assert.equal(marked + 'z', '<b>ok</b>z');
  assert.equal(JSON.stringify({ body: marked }), '{"body":"<b>ok</b>"}');
  assert.equal(marked.length, 9);
});

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                          */
/* -------------------------------------------------------------------------- */

test('taka formats Bangladeshi Taka with western digits', () => {
  assert.equal(taka(0), '৳0');
  assert.equal(taka(1850), '৳1,850');
  assert.equal(taka(1234567), '৳1,234,567');
  assert.equal(taka('nonsense'), '৳0');
});

test('compactCount abbreviates large numbers', () => {
  assert.equal(compactCount(2300), '2.3k');
  assert.equal(compactCount(1500000), '1.5M');
  assert.equal(compactCount(999), '999');
});

test('slugify produces URL-safe ASCII slugs', () => {
  assert.equal(slugify('Mini Portable Thermal Printer'), 'mini-portable-thermal-printer');
  assert.equal(slugify('  Bags & Accessories!  '), 'bags-accessories');
  assert.equal(slugify('Café Ñoño'), 'cafe-nono');
  assert.equal(slugify('!!!'), 'item', 'never returns an empty slug');
  assert.equal(slugify('LED Strip Lights 5m'), 'led-strip-lights-5m');
});

test('orderCode matches the AWAJ-XXXXXX format and avoids ambiguous characters', () => {
  const code = orderCode();
  assert.match(code, /^AWAJ-[A-Z0-9]{6}$/);
  assert.ok(!/[IO01]/.test(code), 'no I/O/0/1 to avoid customer misreading');
  assert.notEqual(orderCode(), orderCode());
});

test('plainText strips tags and truncates', () => {
  assert.equal(plainText('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.ok(plainText(`<p>${'x'.repeat(300)}</p>`, 50).length <= 50);
});

test('daysRange reads naturally', () => {
  assert.equal(daysRange(7, 10), '7-10 days');
  assert.equal(daysRange(1, 3), '1-3 days');
  assert.equal(daysRange(2, 2), '2 days');
  assert.equal(daysRange(1, 1), '1 day');
});

test('url() drops empty values and expands arrays', () => {
  assert.equal(url('/p', { a: 1, b: '', c: null, d: undefined, e: false }), '/p?a=1');
  assert.equal(url('/p', { cat: ['a', 'b'] }), '/p?cat=a&cat=b');
  assert.equal(url('/p', {}), '/p');
});

test('cx joins only truthy class parts', () => {
  assert.equal(cx('a', false, null, undefined, '', 'b'), 'a b');
  assert.equal(cx(['a', 'b'], 'c'), 'a b c');
});
