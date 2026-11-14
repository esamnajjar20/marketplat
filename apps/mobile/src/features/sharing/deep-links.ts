import { getConfiguredHttpsUrl } from '@/lib/web-links';
import { Share } from 'react-native';

export type ShareableResource = 'stories' | 'ads' | 'products' | 'stores' | 'services' | 'profile';
const allowedResources = new Set<ShareableResource>(['stories', 'ads', 'products', 'stores', 'services', 'profile']);
export function createMarketPlatDeepLink(resource: ShareableResource, id: string, extra?: Record<string, string | undefined>): string {
  if (!allowedResources.has(resource) || !id.trim() || id.length > 200) throw new Error('بيانات الرابط غير صالحة.');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(extra ?? {})) if (value && /^[a-zA-Z0-9_-]{1,80}$/.test(key)) query.set(key, value);
  // Stories do not have a public web detail route. Share the public author
  // profile instead and retain the story id as a hint for a capable receiver.
  const routeResource = resource === 'stories' ? 'profile' : resource;
  const routeId = resource === 'stories' ? (extra?.userId || '') : id;
  if (!routeId.trim() || routeId.length > 200) throw new Error('رابط المشاركة يفتقد معرّفًا صالحًا.');
  if (resource === 'stories') query.set('storyId', id);
  const finalSuffix = query.toString();
  const path = `/${routeResource}/${encodeURIComponent(routeId)}`;
  return `${getConfiguredHttpsUrl(path)}${finalSuffix ? `?${finalSuffix}` : ''}`;
}
export async function shareMarketPlatResource(resource: ShareableResource, id: string, title: string, extra?: Record<string, string | undefined>): Promise<void> {
  const url = createMarketPlatDeepLink(resource, id, extra);
  await Share.share({ message: `${title.trim() || 'شاهد هذا المحتوى على MarketPlat'}\n${url}`, url, title: 'مشاركة على MarketPlat' });
}

/** Plain-text share through the native sheet (sale/receipt summaries). */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
}

/** Shares the compact v1 offline QR payload through the native receiver route. */
export async function shareSharedPayload(encodedPayload: string, title: string): Promise<void> {
  if (!encodedPayload || encodedPayload.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) throw new Error('بيانات المشاركة غير صالحة.');
  // Fragment payload stays client-side and is intentionally labelled unverified
  // by the receiving screen; it is not an authenticated record.
  const url = `${getConfiguredHttpsUrl('/shared')}#d=${encodedPayload}`;
  await Share.share({ message: `${title.trim() || 'محتوى تمت مشاركته'}\n${url}`, url, title: 'مشاركة بدون إنترنت' });
}
