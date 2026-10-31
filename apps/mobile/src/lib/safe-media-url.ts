import { getConfiguredApiBaseUrl } from '@/lib/api-base-url';

/**
 * Message attachments originate from other users. Only HTTPS URLs served by
 * this API origin or Cloudinary's public delivery host may be opened externally.
 */
export function isAllowedMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return false;

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.port !== '' && parsed.port !== '443') ||
      parsed.hostname.length > 253
    ) return false;

    const allowedHosts = new Set(['res.cloudinary.com']);
    const apiOrigin = getConfiguredApiBaseUrl();
    if (apiOrigin) {
      const apiHost = new URL(apiOrigin).hostname.toLowerCase();
      allowedHosts.add(apiHost);
    }

    const configuredMediaOrigin = process.env.EXPO_PUBLIC_MEDIA_URL?.trim();
    if (configuredMediaOrigin) {
      const mediaUrl = new URL(configuredMediaOrigin);
      if (mediaUrl.protocol === 'https:' && !mediaUrl.username && !mediaUrl.password &&
          (mediaUrl.pathname === '/' || mediaUrl.pathname === '') && !mediaUrl.search && !mediaUrl.hash) {
        allowedHosts.add(mediaUrl.hostname.toLowerCase());
      }
    }

    return allowedHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
