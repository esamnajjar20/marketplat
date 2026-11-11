# المرحلة 2 — توحيد نواة الـ Outbox

## الهدف

إزالة تكرار منطق الـ lease / retry / claim بين طوابير العمليات دون اتصال، مع الإبقاء على الواجهة العامة لـ `mutation-outbox.ts` كما هي (لا كسر للمستدعين).

## الملفات الجديدة

```
apps/mobile/src/storage/outbox/
  constants.ts   — MAX_PENDING, MAX_ATTEMPTS, backoff, …
  types.ts       — LeaseOutboxItem / Row + mapLeaseRow
  core.ts        — buildLeaseTableSql, claim, ack, fail, recover, list…
  index.ts       — تصدير موحّد
```

## الملفات المعدّلة

```
apps/mobile/src/storage/mutation-outbox.ts  — يستخدم النواة، نفس الـ exports
```

## خطوات الدمج

```bash
cp -R path/to/mobile_phase2/src/storage/outbox apps/mobile/src/storage/
cp path/to/mobile_phase2/src/storage/mutation-outbox.ts apps/mobile/src/storage/mutation-outbox.ts
```

ثم:

```bash
cd apps/mobile && npx tsc --noEmit
# واختبارات التخزين إن وُجدت:
npm run test:sqlite
```

## ملاحظات

- `outbox-sync.ts` و `OutboxSyncLifecycleBridge` و `favorites.store` **لم تتغيّر** — تستورد نفس الدوال من `mutation-outbox`.
- طوابير chat / order / entity-create ما زالت مستقلة (مخطط مختلف). يمكن لاحقًا ترحيلها تدريجيًا لنفس النواة حيث يناسب الـ lease model.
- الثوابت أصبحت مركزية: غيّر `OUTBOX_MAX_PENDING` مرة واحدة في `outbox/constants.ts`.
