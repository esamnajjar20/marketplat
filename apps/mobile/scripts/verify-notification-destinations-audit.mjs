import fs from 'node:fs';
import assert from 'node:assert/strict';

const screen = fs.readFileSync(new URL('../app/notifications.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../api/src/modules/notifications/notifications.service.ts', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../../api/prisma/schema.prisma', import.meta.url), 'utf8');

assert.match(screen, /function destination\(item: AppNotification\)/);
for (const [type, route] of [
  ['NEW_FOLLOWER', '`/profile/${followerId}`'],
  ['FAV_AD_PRICE_CHANGED', '`/ads/${adId}`'],
  ['SAVED_SEARCH_MATCH', '`/products/${productId}`'],
  ['STORE_NEW_PRODUCT', '`/stores/${storeId}`'],
  ['NEW_REQUEST_OFFER', '`/requests/${requestId}`'],
  ['SERVICE_REQUEST_NEW', "'/service-requests'"],
  ['APPOINTMENT_UPDATE', "'/appointments'"],
  ['SALES_OVERDUE_INSTALLMENT', "'/installments'"],
  ['SALES_DEBT_REMINDER', "'/debts'"],
  ['SALES_LOW_STOCK', "'/my-sales'"],
]) {
  assert.ok(screen.includes(`case '${type}'`), `Missing destination handling for ${type}`);
  assert.ok(screen.includes(route), `Missing expected route ${route} for ${type}`);
}
assert.match(screen, /url\?\.startsWith\('\/messages\/'\) && !url\.startsWith\('\/\/'\)/);
for (const type of ['NEW_FOLLOWER', 'FAV_AD_PRICE_CHANGED', 'STORE_NEW_PRODUCT', 'NEW_REQUEST_OFFER', 'SERVICE_REQUEST_NEW', 'APPOINTMENT_UPDATE', 'SALES_OVERDUE_INSTALLMENT']) {
  assert.ok(schema.includes(type), `Notification type ${type} is absent from Prisma schema`);
}
for (const type of ['NEW_FOLLOWER', 'FAV_AD_PRICE_CHANGED', 'STORE_NEW_PRODUCT', 'NEW_REQUEST_OFFER', 'SERVICE_REQUEST_NEW', 'APPOINTMENT_UPDATE']) {
  assert.ok(api.includes(type), `Notification type ${type} is absent from notification service`);
}
console.log('Notification destination checks passed (entity notifications route to supported mobile screens).');
