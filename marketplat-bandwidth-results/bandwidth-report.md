# MarketPlat API Bandwidth Probe

- Target: `https://marketplat.onrender.com`
- Generated: 2026-11-07T12:53:23.996193+00:00
- Attempted requests: 60
- Responses: 58 | Errors: 2
- Mean transferred response estimate: **3,956 bytes/request**
- Estimated requests per decimal 5 GB: **1,263,919**
- Estimated requests per 5 GiB: **1,357,123**

## Endpoint breakdown

| Endpoint | Avg wire body | Avg response incl. header estimate | Avg latency | Status |
|---|---:|---:|---:|---|
| `home_static` | 14,645 B | 16,061 B | 4163.3 ms | [200] |
| `home_root` | 8,725 B | 10,142 B | 328.1 ms | [200] |
| `stores_list` | 2,154 B | 3,558 B | 210.4 ms | [200] |
| `ads_list` | 2,059 B | 3,463 B | 285.7 ms | [200] |
| `services_list` | 1,815 B | 3,219 B | 165.3 ms | [200] |
| `service_types` | 1,742 B | 3,133 B | 166.1 ms | [200] |
| `service_categories` | 1,579 B | 2,970 B | 163.9 ms | [200] |
| `products_list` | 1,485 B | 2,889 B | 220.1 ms | [200] |
| `store_types` | 676 B | 2,067 B | 149.5 ms | [200] |
| `product_categories` | 231 B | 1,638 B | 124.4 ms | [200] |
| `categories` | 212 B | 1,618 B | 140.3 ms | [200] |
| `cross_search` | 136 B | 1,555 B | 204.1 ms | [200] |

## Interpretation and limitations

The 5 GB request count is a projection using the mean of the sampled endpoint mix. It is not a user count and should be recalculated with production traffic proportions.

- Sequential GET samples only; not a concurrency/load test.
- 5GB estimates extrapolate the measured endpoint mix equally; change mix to match real usage.
- Response header bytes are approximate; HTTP/2/3 HPACK/QPACK and TLS framing are excluded.
- Direct-origin targeting bypasses Cloudflare edge cache only if the supplied host is truly the origin.
- Cache-Control request headers do not guarantee bypass of internal Redis/application caches.
- Upload traffic, request bodies, response streaming, retries and connection overhead are not included.