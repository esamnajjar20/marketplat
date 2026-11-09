# Database Audit Patch Manifest — 2026-11-09

## الملفات

1. `apps/api/prisma/schema.prisma`
   - أضيف `@@index([userId, createdAt, id])` إلى `Report`.
   - أضيف `@@index([adId])` إلى `Report`.
2. `apps/api/prisma/migrations/20261109100000_add_report_lookup_and_fk_indexes/migration.sql`
   - Migration جديدة تضيف فهرسي B-tree باستخدام `CREATE INDEX CONCURRENTLY`.
   - لا تعدل بيانات أو أعمدة أو قيود، ولا تحذف فهارس موجودة.
3. `apps/api/prisma/diagnostics/marketplat-db-audit-readonly.sql`
   - تقرير PostgreSQL read-only لقاعدة البيانات والاتصالات وسجل Prisma وأحجام الجداول والفهارس وFK غير المغطاة.
4. `apps/api/prisma/diagnostics/rollback-report-indexes.sql`
   - تراجع يدوي للفهرسين الجديدين فقط.
5. `apps/api/prisma/diagnostics/DB-DEEP-AUDIT-2026-11-09-AR.md`
   - التقرير العربي الكامل.

## السلامة

- لم يتم تعديل أو حذف أي Migration من أصل 120.
- لم يتم تعديل Prisma Models أخرى أو علاقات/حقول/Enums.
- لا يوجد DML أو backfill أو DROP في Migration الجديدة.
- لم يتم الاتصال بقاعدة الإنتاج.
- يجب اختبار Prisma validate/migrate deploy/EXPLAIN على Staging قبل النشر.
