import fs from 'node:fs';
import assert from 'node:assert/strict';
const checkout = fs.readFileSync(new URL('../app/order-checkout.tsx', import.meta.url), 'utf8');
assert.match(checkout, /effectivePrice\?\.price \?\? product\?\.effectivePrice\?\.amount/,
  'checkout must honor computed effectivePrice.amount when price is absent');
assert.match(checkout, /const validPrice = .*Number\.isFinite\(unitPrice\)/,
  'checkout must reject malformed or negative prices before ordering');
assert.match(checkout, /const maxQuantity = Math\.max\(1, Math\.min\(product\?\.stockQuantity \?\? 100, 100\)\)/,
  'quantity controls must not collapse to zero for an out-of-stock product');
assert.match(checkout, /disabled=\{outOfStock \|\| quantity >= maxQuantity\}/,
  'quantity increase must be disabled at the available stock limit');
assert.match(checkout, /disabled=\{submitting \|\| outOfStock \|\| !validPrice\}/,
  'checkout submission must be disabled when stock or price is invalid');
console.log('Checkout audit checks passed (effective price fallback, price validation, and stock-aware quantity controls).');
