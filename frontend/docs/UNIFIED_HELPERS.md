# Canonical helpers (do not hand-roll)

| Need | Use | Never |
|---|---|---|
| Listing price (0 decimals) | `formatPrice` — `lib/formatters.ts` | `toLocaleString` + `₪` |
| Sales/receipt money (2 decimals) | `formatMoney` — `lib/formatters.ts` | `.toFixed(2) + ' ₪'` |
| Counts / stats | `formatNumber` | `.toLocaleString('ar')` |
| Date+time / date / clock in Gaza TZ | `formatTimestamp` / `formatShortDate` / `formatClockTime` | `new Date(x).toLocaleString('ar-PS')` |
| WhatsApp links / phone normalisation | `buildWhatsAppUrl`, `toWaPhone` — `lib/whatsapp.ts` | `https://wa.me/...` strings |
| Copy to clipboard | `copyToClipboard` — `lib/copyToClipboard.ts` | `navigator.clipboard.writeText` |
| User feedback | `toast` (sonner) | `alert()` |
| `tel:` / `mailto:` links | `buildTelUrl`, `buildMailtoUrl` — `lib/contactLinks.ts` | `` `tel:${phone}` ``, `` `mailto:${email}` `` |
| Open URL in new tab | `openExternal` — `lib/openExternal.ts` | `window.open(url, '_blank', ...)` |
| Clock time with milliseconds (diagnostics) | `formatClockTimeMs` — `lib/formatters.ts` | `Intl.DateTimeFormat` with `fractionalSecondDigits` |
| Client calls to `/api/admin/*` Next routes | `adminRouteFetch` — `lib/adminRouteFetch.ts` | `fetch('/api/admin/...')` |
