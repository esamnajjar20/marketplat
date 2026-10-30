export type SharedKind = 'ad' | 'product' | 'service' | 'store';
export type SharedPayload = { kind: SharedKind; title: string; price: string | null; city: string; extra: string; desc: string };
const MAX_ENCODED = 12000;
export function encodeSharedPayload(input: SharedPayload): string {
  const packed = { v: 1, k: input.kind, t: input.title.slice(0,60), p: input.price ?? '', c: input.city.slice(0,30), x: input.extra.slice(0,40), d: input.desc.slice(0,300) };
  const bytes = new TextEncoder().encode(JSON.stringify(packed));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function decodeSharedPayload(encoded: string): SharedPayload | null {
  if (!encoded || encoded.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = globalThis.atob(base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (parsed.v !== 1 || !['ad','product','service','store'].includes(String(parsed.k)) || typeof parsed.t !== 'string') return null;
    const bounded = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0,max) : '';
    return { kind: parsed.k as SharedKind, title: bounded(parsed.t,60), price: bounded(parsed.p,40) || null, city: bounded(parsed.c,30), extra: bounded(parsed.x,40), desc: bounded(parsed.d,300) };
  } catch { return null; }
}
export function sharedPayloadFromUrl(url: string | null): string | null {
  if (!url) return null;
  const hash = url.split('#',2)[1] ?? '';
  if (!hash.startsWith('d=')) return null;
  return hash.slice(2).split('&',1)[0] || null;
}
