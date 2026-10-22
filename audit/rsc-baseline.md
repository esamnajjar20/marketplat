# RSC migration baseline

Captured from `cd frontend && npm run build` on `audit/refactor-20261022`
before any migration changes (Next.js 15.5.27). Values are Next.js build
output's **First Load JS** per route; the shared bundle was 105 kB.

| Route | First Load JS |
|---|---:|
| `/` | 271 kB |
| `/_not-found` | 105 kB |
| `/about` | 108 kB |
| `/account/customers` | 207 kB |
| `/account/sales` | 259 kB |
| `/account/sales/[id]/receipt` | 212 kB |
| `/account/sales/debts` | 205 kB |
| `/account/sales/installments` | 204 kB |
| `/activity` | 269 kB |
| `/admin` | 340 kB |
| `/admin/debug/warming` | 146 kB |
| `/ads` | 119 kB |
| `/ads/[id]` | 299 kB |
| `/ads/create` | 274 kB |
| `/api/admin/debug-toggle` | 105 kB |
| `/api/v1/[...path]` | 105 kB |
| `/categories` | 214 kB |
| `/categories/[slug]` | 285 kB |
| `/complete-profile` | 242 kB |
| `/contact` | 108 kB |
| `/dashboard` | 222 kB |
| `/favorites` | 278 kB |
| `/following` | 214 kB |
| `/for-you` | 238 kB |
| `/forgot-password` | 212 kB |
| `/icon` | 105 kB |
| `/icon-192` | 105 kB |
| `/icon-512` | 105 kB |
| `/icon-512-maskable` | 105 kB |
| `/login` | 214 kB |
| `/manifest.webmanifest` | 105 kB |
| `/messages` | 105 kB |
| `/messages/[id]` | 278 kB |
| `/my-ads/[id]/edit` | 276 kB |
| `/my-services` | 297 kB |
| `/my-services/[id]/edit` | 273 kB |
| `/my-services/new` | 274 kB |
| `/my-store` | 309 kB |
| `/my-store/collections/[id]` | 218 kB |
| `/my-store/followed` | 228 kB |
| `/my-store/products/[id]/edit` | 276 kB |
| `/my-store/products/new` | 275 kB |
| `/notifications` | 238 kB |
| `/offline` | 280 kB |
| `/privacy` | 108 kB |
| `/products` | 119 kB |
| `/products/[id]` | 299 kB |
| `/profile/[id]` | 304 kB |
| `/profile/[id]/followers` | 215 kB |
| `/profile/[id]/following` | 215 kB |
| `/promoted` | 230 kB |
| `/register` | 247 kB |
| `/requests` | 107 kB |
| `/requests/[id]` | 240 kB |
| `/requests/me` | 215 kB |
| `/requests/new` | 229 kB |
| `/requests/offers` | 237 kB |
| `/reset-password` | 212 kB |
| `/robots.txt` | 105 kB |
| `/saved-payments` | 153 kB |
| `/saved-searches` | 211 kB |
| `/search` | 107 kB |
| `/sellers/[id]` | 140 kB |
| `/sellers/ranking` | 106 kB |
| `/service-providers` | 110 kB |
| `/service-providers/[id]` | 140 kB |
| `/service-requests/[id]` | 219 kB |
| `/services` | 107 kB |
| `/services/[id]` | 294 kB |
| `/settings` | 295 kB |
| `/shared` | 125 kB |
| `/store/[slug]/stats` | 209 kB |
| `/stores` | 116 kB |
| `/stores/[id]` | 323 kB |
| `/stories` | 213 kB |
| `/suggestions` | 238 kB |
| `/terms` | 108 kB |
| `/trending` | 238 kB |
| `/update` | 204 kB |
| `/verify-email` | 202 kB |

| Shared bundle | First Load JS |
|---|---:|
| All routes | 105 kB |
