import fs from 'node:fs';
import assert from 'node:assert/strict';
const screen = fs.readFileSync(new URL('../app/orders/[id].tsx', import.meta.url), 'utf8');
const backend = fs.readFileSync(new URL('../../api/src/modules/marketplace-orders/marketplace-orders.service.ts', import.meta.url), 'utf8');
assert.match(screen, /\(order\.status==='PENDING'\|\|order\.status==='CONFIRMED'\)\?<Pressable[^>]*onPress=\{\(\)=>confirmChange\('CANCELLED'/);
assert.match(screen, /لا يمكن إلغاء الطلب من هذه المرحلة/);
assert.match(backend, /order\.status !== 'PENDING' && !\(order\.status === 'CONFIRMED' && order\.sellerId === userId\)/);
console.log('Order cancellation stage checks passed (mobile actions match backend cancellation rules).');
