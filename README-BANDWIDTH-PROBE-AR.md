# قياس استهلاك نطاق MarketPlat — دليل التشغيل

## المتطلبات
- Python 3
- مكتبة `requests` فقط
- لا يحتاج Node.js أو k6 أو أي حزم داخل المشروع.

## تشغيل سريع من Termux

```bash
python -m pip install requests
python marketplat_bandwidth_probe.py \
  --base-url https://marketplat.onrender.com \
  --repeat 3
```

> استخدم رابط **Express origin المباشر** الذي تستضيف عليه الـAPI. لا تستخدم `workers.dev` إذا كان هدفك قياس نقل Express دون Cloudflare Edge. إذا كان عنوان Origin الفعلي مختلفًا، مرره في `--base-url`.

## القياس المضغوط وغير المضغوط

```bash
# قياس الاستجابة المضغوطة (Gzip)
python marketplat_bandwidth_probe.py --base-url https://YOUR-API-ORIGIN --encoding gzip --repeat 5

# قياس حجم JSON دون ضغط، للمقارنة فقط
python marketplat_bandwidth_probe.py --base-url https://YOUR-API-ORIGIN --encoding identity --repeat 5
```

## إضافة مسار محدد

```bash
python marketplat_bandwidth_probe.py \
  --base-url https://YOUR-API-ORIGIN \
  --path '/api/v1/ads?limit=24&page=1' \
  --path '/api/v1/products?limit=24&page=1'
```

## قياس Home Feed الشخصي

يتطلب Token صالحًا:

```bash
export MARKETPLAT_TOKEN='YOUR_BEARER_TOKEN'
python marketplat_bandwidth_probe.py \
  --base-url https://YOUR-API-ORIGIN \
  --include-personal-feed
```

## المخرجات
ينشئ مجلد `marketplat-bandwidth-results` وفيه:
- `bandwidth-report.md`: تقرير مختصر وأكبر المسارات استهلاكًا.
- `bandwidth-results.json`: النتائج التفصيلية والتقديرات.
- `bandwidth-samples.csv`: كل عينة مع status والحجم والضغط والترويسات ومؤشرات الكاش.

## ما يقيسه وما لا يقيسه
- يقيس حجم جسم الاستجابة المنقول فعليًا وفق `Content-Encoding`، ويضيف تقديرًا لحجم ترويسات الاستجابة.
- يقيس GET فقط وبشكل متسلسل لتجنب إحداث ضغط على الخدمة.
- يرسل `Cache-Control: no-cache` و`Pragma: no-cache`، لكن هذه الترويسات لا تضمن تجاوز Redis أو أي كاش داخلي في التطبيق.
- تجاوز Cloudflare Edge يتحقق فقط إذا كان `--base-url` عنوان Express Origin المباشر فعلًا.
- لا يشمل Uploads أو أجسام الطلبات أو WebSocket/SSE أو إعادة المحاولات أو TLS framing.
- رقم الطلبات لكل 5GB إسقاط حسابي لمتوسط مزيج المسارات التي تم اختبارها، وليس عدد المستخدمين. يجب تعديل نسب المسارات حسب Analytics الإنتاجية.

**تنبيه:** لا تشغّل هذا الاختبار بمعدل مرتفع. هو اختبار قياس خفيف، وليس اختبار تحمل أو ضغط.
