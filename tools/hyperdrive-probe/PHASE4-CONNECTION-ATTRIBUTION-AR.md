# المرحلة الرابعة — إسناد الاتصالات وقياس سعة PostgreSQL

## الهدف

تحدد هذه المرحلة بدقة أي الاتصالات تخص كل خدمة في MarketPlat، وتفصل جلسات العملاء عن عمليات PostgreSQL الداخلية، ثم تجمع أدلة صالحة لاتخاذ قرار بشأن Hyperdrive. لا تنقل هذه المرحلة أي مسار إنتاجي إلى Worker ولا تغيّر `DATABASE_URL` لخدمات Express أو Go.

## تصحيح مهم قبل التحليل

`COUNT(*) FROM pg_stat_activity` يحسب صفوف جميع أنواع عمليات PostgreSQL، وليس جلسات العملاء فقط. تتضمن النتيجة عمليات خلفية مثل `pg_cron`، وقد تتضمن عمليات أخرى مثل autovacuum وcheckpointer وwalwriter. لذلك يمكن أن يظهر العدد الكلي أكبر من `max_connections` دون أن يعني ذلك أن عدد اتصالات العملاء تجاوز حد الاتصال. استخدم `backend_type = 'client backend'` لعدّ جلسات العملاء.

الاستعلام السابق الذي أظهر `24 / 20 = 120%` لا يكفي وحده للحكم بوجود تجاوز. يجب أولاً تقسيم الـ24 بحسب `backend_type`. كذلك تبقى إعدادات Aiven وحدود الاتصالات المحجوزة ذات صلة، ولا تستنتج السعة المتاحة للمستخدم العادي من النسبة وحدها.

## ما تغيّر في المشروع

1. **Prisma / Express**
   - أضيف متغير `DB_APPLICATION_NAME`، وقيمته الافتراضية `marketplat-api`.
   - يمرر Prisma القيمة إلى PostgreSQL في معامل `application_name`.
   - عيّن قيمة مميزة لكل خدمة منشورة تستخدم حزمة API نفسها، مثل `marketplat-api-public` و`marketplat-api-admin` و`marketplat-api-worker`، بشرط أن تكون أسماء فعلية ومعروفة لديك. لا تستخدم الاسم نفسه لجميع الخدمات إذا كان هدفك التفريق بينها.
   - الحد الأقصى للاسم 63 محرف ASCII، ويقبل الحروف والأرقام والنقطة والشرطة والشرطة السفلية فقط.

2. **Go Worker**
   - يضيف `application_name=marketplat-go-worker` إذا لم يكن موجوداً في `GO_WORKER_DATABASE_URL`/`DIRECT_URL`/`DATABASE_URL`.
   - يمكن تخصيصه بوضع `application_name` صراحةً في عنوان اتصال Go.
   - لا يغيّر `DB_MAX_OPEN_CONNS` ولا سلوك التجميع أو إعدادات الاتصال.

3. **Hyperdrive Probe**
   - أضيف `scripts/phase4-connection-monitor.sql` لعرض ملخص إجمالي الجلسات وتفصيلها حسب `backend_type` واسم التطبيق وعنوان العميل والحالة.

## التحقق من أسماء التطبيقات

بعد نشر إصدار API الذي يتضمن `DB_APPLICATION_NAME` وإصدار Go Worker الذي يتضمن وسم التطبيق، نفّذ: 

```sql
SELECT
    backend_type,
    application_name,
    client_addr,
    state,
    count(*) AS connections
FROM pg_stat_activity
GROUP BY backend_type, application_name, client_addr, state
ORDER BY backend_type, application_name, client_addr, state;
```

يُفترض أن ترى أسماء مثل `marketplat-api-public` أو `marketplat-go-worker` أو `marketplat-hyperdrive-probe`. ظهور `<empty>` يعني أن العميل لم يحدد `application_name`، أو أنه لم يستخدم إصدار الكود الجديد/لم تُضبط قيمة التسمية لديه.

## تشغيل مراقبة المرحلة الرابعة

من جلسة `psql` المفتوحة على Aiven، شغّل من مجلد `tools/hyperdrive-probe`: 

```sql
\i scripts/phase4-connection-monitor.sql
\watch 1
```

يعيد `\watch 1` تنفيذ الاستعلام مرة كل ثانية. أوقفه بـ `Ctrl+C`. إذا كنت تستخدم SQL Console لا يدعم أوامر `psql` التي تبدأ بشرطة مائلة، افتح ملف SQL ونفّذ الاستعلام نفسه يدوياً على فترات متقاربة؛ لا تلصق أوامر `\i` أو `\watch` في محرر SQL عادي.

التقط قياسات في ثلاث نوافذ منفصلة: قبل الحمل، وأثناء تشغيل واحد من اختبارات Hyperdrive، وبعده مباشرة. لا تشغّل أكثر من Benchmark في الوقت نفسه. دوّن `client_backend_count` منفصلاً عن `non_client_backend_count`، واحتفظ بأسماء التطبيقات وعناوين العملاء لتحديد مصدر الاتصالات. جلسة المراقبة نفسها تُحسب ضمن اتصالات العملاء.

## كيف نقرأ النتائج

- `client_backend_count`: جلسات العملاء التي تهم مقارنة اتصالات التطبيقات مع `max_connections`.
- `non_client_backend_count`: عمليات PostgreSQL غير المصنفة كجلسات عملاء، مثل العمليات الخلفية.
- `visible_activity_rows`: عدد صفوف `pg_stat_activity` المرئية؛ لا تساوه بعدد اتصالات التطبيقات.
- `application_name`: أفضل إشارة أولية لإسناد اتصال إلى تطبيق، بشرط أن يضبطها العميل.
- `client_addr`: عنوان المصدر؛ مفيد للمطابقة لكنه لا يكفي وحده لتحديد اسم الخدمة.
- `state`: يميز active وidle وidle in transaction. ارتفاع `idle in transaction` يستحق التحقيق منفصلاً.

لا تعتبر حد `origin connection limit` في Hyperdrive سقفاً صارماً دائماً؛ توثيق Cloudflare يصفه بأنه حد مرن وقد تظهر اتصالات إضافية في ظروف استعادة الاتصال. يجب أن يبقى إعداد Hyperdrive أقل من سعة قاعدة البيانات مع هامش احتياطي.

## بوابة قبول المرحلة الرابعة

- معرفة عدد `client backend` بدلاً من الاعتماد على `COUNT(*)` فقط.
- ظهور أسماء تطبيقات مستقرة لـ API وGo Worker وHyperdrive Probe.
- معرفة عدد الاتصالات الفعلي لكل خدمة/نسخة تشغيلية في وقت العينة.
- عدم وجود `idle in transaction` غير مفسر أو نمو مستمر بعد انتهاء الحمل.
- أخذ عينات قبل الحمل وأثناءه وبعده، وتكرار القياس مرتين على الأقل في أوقات متقاربة.
- عدم تغيير مسارات الإنتاج أو أسرار الاتصال أو حدود التجميع خلال هذه المرحلة.

## ما لم تنفذه هذه المرحلة

- لم يتم تحويل اتصالات Prisma أو Go إلى Hyperdrive.
- لم يتم تعديل حدود مجمعات الاتصالات.
- لم يتم تشغيل استعلامات بيانات MarketPlat أو أي عمليات كتابة.
- لم يتم الادعاء بأن Hyperdrive خفّض اتصالات الإنتاج؛ يلزم جمع baseline متزامن من كل خدمة ثم مقارنته بحمل مماثل.

## الملفات ذات الصلة

- `scripts/phase4-connection-monitor.sql`
- `PHASE4-CONNECTION-ATTRIBUTION-AR.md`
- `apps/api/src/config/env.ts`
- `apps/api/src/shared/db/prismaPoolConfig.ts`
- `apps/api/src/config/prisma.ts`
- `apps/go-worker/cmd/server/database.go`

## مراجع تقنية

- [PostgreSQL — `pg_stat_activity` و`backend_type`](https://www.postgresql.org/docs/current/monitoring-stats.html)
- [Prisma — PostgreSQL connection URLs (`application_name`)](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql)
- [Cloudflare — Tune Hyperdrive connection pooling](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/)
