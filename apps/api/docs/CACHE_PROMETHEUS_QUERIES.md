# Prometheus queries — MarketPlat cache health

هذه الاستعلامات تستخدم المقاييس الحالية في API. لا تفترض وجود Grafana أو Prometheus deployment؛ أضفها إلى لوحة Grafana بعد ربط Prometheus بمسار `/metrics` وتأمينه بـ `METRICS_TOKEN` أو بقيد شبكة خاص بالبنية التحتية.

## 1. Cache hit ratio

```promql
sum by (cache) (rate(app_cache_events_total{event=~"hit|stale"}[5m]))
/
clamp_min(sum by (cache) (rate(app_cache_events_total{event=~"hit|stale|miss|bypass"}[5m])), 1e-9)
```

`stale` محسوب كاستجابة مخدومة من الكاش لأنها تُرجع payload السابق بينما يبدأ تحديث بالخلفية.

## 2. Cache read traffic by outcome

```promql
sum by (cache, event) (rate(app_cache_events_total{event=~"hit|stale|miss|bypass"}[5m]))
```

## 3. Redis/cache bypass rate

```promql
sum by (cache) (rate(app_cache_events_total{event="bypass"}[5m]))
/
clamp_min(sum by (cache) (rate(app_cache_events_total{event=~"hit|stale|miss|bypass"}[5m])), 1e-9)
```

ارتفاعها يعني أن الطلبات تتجاوز Redis، غالباً بسبب تعطل/بطء القراءة أو أن الاستعلام غير قابل للكاش حسب السياسة.

## 4. Background refresh failures

```promql
sum by (cache) (increase(app_cache_events_total{event="refresh_fail"}[15m]))
```

## 5. Generation invalidation failures

```promql
increase(app_cache_events_total{cache="generation",event="generation_bump_fail"}[15m])
```

يجب التعامل مع أي قيمة أكبر من صفر كتنبيه correctness؛ قد تبقى بيانات قديمة حتى hard TTL أو حتى نجاح إعادة المحاولة من outbox.

## 6. Generation invalidation volume

```promql
sum by (event) (rate(app_cache_events_total{cache="generation",event=~"generation_bump_ok|generation_bump_fail"}[5m]))
```

## 7. p95 cache operation duration

```promql
histogram_quantile(
  0.95,
  sum by (le, cache, event) (rate(app_cache_operation_duration_seconds_bucket[5m]))
)
```

## 8. API 304 rate (includes private profile revalidation)

```promql
sum by (route) (rate(http_requests_total{status_code="304"}[5m]))
```

هذا يوضح 304 على مستوى route، لكنه ليس مقياس cache HIT لطبقة Redis. استخدم `app_cache_events_total{cache="users:profile"}` لقياس Redis profile cache.

## 9. Redis cache memory

```promql
redis_cache_memory_used_bytes / clamp_min(redis_cache_memory_max_bytes, 1)
```

## Labels and privacy

`cache` قيمة ثابتة محددة داخل التطبيق. لا تضف user IDs، أسماء متاجر/منتجات، cache keys، مسارات URL الخام، قيم بحث أو أي بيانات شخصية إلى Prometheus labels. Labels ذات cardinality عالية قد ترفع استهلاك الذاكرة بشكل كبير، ولا تساعد في تتبع مستخدم بعينه.
