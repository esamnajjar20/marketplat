# توحيد .mjs → TypeScript

## الملفات المحوَّلة في المرحلة 6
| قديم | جديد |
|------|------|
| outbox-sync-policy.mjs + .d.ts | outbox-sync-policy.ts |
| outbox-transport-contract.mjs | outbox-transport-contract.ts (كامل) |
| draft-operation-queue.mjs + .d.mts | draft-operation-queue.ts |

## بعد الدمج
1. احذف الملفات القديمة `.mjs` / `.d.ts` / `.d.mts` المقابلة.
2. تأكد أن الاستيرادات تشير لـ `.ts` بدون امتداد:
   `from './outbox-sync-policy'`
3. شغّل:
   ```bash
   npx tsc --noEmit
   npx vitest run src/storage
   ```
