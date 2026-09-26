'use client';

/**
 * lib/shareQr.ts
 *
 * QR-based sharing for ads, products, services, and stores — works
 * with NO network on either side.
 *
 * The whole payload is packed into the URL *fragment* after `#d=`, so
 * the receiving device opens `/shared` — a route already in
 * CORE_ROUTES warming — and the client reads the payload from
 * `location.hash`, never touching the network for the data itself.
 *
 * Encoding: base64url(UTF-8(JSON)).
 * Why base64url and not percent-encoding: Arabic text is 2 UTF-8 bytes
 * per glyph; percent-encoding expands each of those bytes to 3 chars
 * ("%XX"), so 400 Arabic chars becomes ~2400 URL chars and overflows a
 * scannable QR. base64url keeps it at ~1.37× the byte count — the same
 * 400 glyphs land at ~1100 chars, comfortably inside QR version 40
 * error correction level M (~2331 chars).
 *
 * Field size caps keep the payload bounded; longer inputs are
 * truncated on the sender side so the receiving device always gets a
 * well-formed QR.
 */

export type SharedKind = 'ad' | 'product' | 'service' | 'store';

export interface SharedPayload {
  kind: SharedKind;
  title: string;
  price: string | null;
  city: string;
  /** Free-form single-line detail: 'مستعمل · تفاوض' for ads,
   *  'متوفر · محدود' for products, 'منزلي · يبدأ من' for services,
   *  'موثّق · 4.5★' for stores. Kept as a plain string so the QR
   *  doesn't need a per-kind schema. */
  extra: string;
  /** Truncated — full description only exists on the server. */
  desc: string;
}

/** @deprecated use SharedPayload. Kept as an alias so older imports
 *  don't break in a single commit. */
export type SharedAdPayload = SharedPayload;

const VERSION = 1;
const MAX_TITLE = 60;
const MAX_DESC = 300;
const MAX_CITY = 30;
const MAX_EXTRA = 40;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function isKind(v: unknown): v is SharedKind {
  return v === 'ad' || v === 'product' || v === 'service' || v === 'store';
}

export function encodeSharedPayload(input: SharedPayload): string {
  const payload = {
    v: VERSION,
    k: input.kind,
    t: truncate(input.title, MAX_TITLE),
    p: input.price ?? '',
    c: truncate(input.city, MAX_CITY),
    x: truncate(input.extra ?? '', MAX_EXTRA),
    d: truncate(input.desc, MAX_DESC),
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** @deprecated use encodeSharedPayload */
export const encodeSharedAd = encodeSharedPayload;

export function decodeSharedPayload(encoded: string): SharedPayload | null {
  if (!encoded) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(encoded));
    const parsed = JSON.parse(json) as {
      v?: number;
      k?: string;
      t?: string;
      p?: string;
      c?: string;
      x?: string;
      d?: string;
    };
    // Version gate: a future payload shape won't be silently misread
    // by today's decoder — it'll simply be rejected and the page can
    // show "this code was made with a newer app".
    if (parsed.v !== VERSION) return null;
    if (typeof parsed.t !== 'string') return null;
    if (!isKind(parsed.k)) return null;
    return {
      kind: parsed.k,
      title: parsed.t,
      price: parsed.p && parsed.p.length > 0 ? parsed.p : null,
      city: parsed.c ?? '',
      extra: parsed.x ?? '',
      desc: parsed.d ?? '',
    };
  } catch {
    return null;
  }
}

/** @deprecated use decodeSharedPayload */
export const decodeSharedAd = decodeSharedPayload;

/** The route the receiving device will open. Must be in CORE_ROUTES
 *  (see offlineRouteShells.ts) so it warms offline for every user. */
export const SHARED_PATH = '/shared';

export function buildSharedUrl(origin: string, encoded: string): string {
  return `${origin}${SHARED_PATH}#d=${encoded}`;
}

/** @deprecated use buildSharedUrl */
export const buildSharedAdUrl = buildSharedUrl;

/** Extract the payload string from `location.hash` ("#d=xxx"). */
export function readEncodedFromHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith('d=')) return null;
  const v = h.slice(2);
  return v.length > 0 ? v : null;
}

/** Human-readable Arabic label per kind — used by the receiver page. */
export const KIND_LABEL: Record<SharedKind, string> = {
  ad: 'إعلان',
  product: 'منتج',
  service: 'خدمة',
  store: 'متجر',
};
