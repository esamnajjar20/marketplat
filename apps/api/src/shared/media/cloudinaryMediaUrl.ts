import { URL } from 'node:url';

const CLOUDINARY_DELIVERY_HOST = 'res.cloudinary.com';
const CLOUDINARY_ASSET_TYPES = new Set(['image', 'video', 'raw']);
const CLOUDINARY_DELIVERY_TYPES = new Set(['upload', 'private', 'authenticated']);

/**
 * Accept only canonical Cloudinary delivery URLs for this account.
 * Arbitrary hosts, subdomains, ports, credentials, query strings and redirects
 * are intentionally unsupported to keep the media proxy from becoming an SSRF
 * primitive.
 */
export function parseTrustedCloudinaryMediaUrl(raw: string, cloudName: string): URL | null {
  if (!raw || !cloudName || !/^[a-zA-Z0-9_-]{1,128}$/.test(cloudName)) return null;

  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean);
    const isCanonicalPath =
      segments.length >= 4 &&
      segments[0] === cloudName &&
      CLOUDINARY_ASSET_TYPES.has(segments[1] ?? '') &&
      CLOUDINARY_DELIVERY_TYPES.has(segments[2] ?? '');

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== CLOUDINARY_DELIVERY_HOST ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      !isCanonicalPath
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}
