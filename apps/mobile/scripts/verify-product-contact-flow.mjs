import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const detail = fs.readFileSync(path.join(root, 'app/products/[id].tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/features/messaging/messaging.api.ts'), 'utf8');
const commerce = fs.readFileSync(path.join(root, 'src/features/commerce/commerce.api.ts'), 'utf8');
const checks = [
  ['product contact button is no longer a placeholder alert', !detail.includes('ميزة التواصل المباشر مع المتجر غير مفعّلة')],
  ['product contact starts an authenticated conversation', detail.includes('startConversationWithUser') && detail.includes('accessToken')],
  ['product contact preserves product context', /startConversationWithUser\(sellerUserId, accessToken, \{\s*type: 'product',\s*id: item\.id\s*\}/.test(detail)],
  ['successful contact navigates to the conversation', /pathname: '\/messages\/\[id\]'[\s\S]*?params: \{ id: conversation\.id \}/.test(detail)],
  ['guest can discover contact and return to the product after sign-in', detail.includes('const canMessage = !!sellerUserId && sellerUserId !== user?.id') && /pathname: '\/login'[\s\S]*?redirect: `\/products\/\$\{encodeURIComponent\(item\.id\)\}`/.test(detail)],
  ['messaging API uses supported userId and context fields', api.includes('JSON.stringify({ userId, ...(context ? { context } : {}) })')],
  ['product response type exposes store seller user id', /store\?: \{[\s\S]*?sellerProfile\?: \{ userId\?: string;/.test(commerce)],
];
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`); if (!pass) process.exitCode = 1; }
