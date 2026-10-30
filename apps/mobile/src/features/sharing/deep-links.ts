import * as Linking from 'expo-linking';
import { Share } from 'react-native';

export type ShareableResource = 'stories' | 'ads' | 'products' | 'stores' | 'services' | 'profile';
const allowedResources = new Set<ShareableResource>(['stories', 'ads', 'products', 'stores', 'services', 'profile']);
export function createMarketPlatDeepLink(resource: ShareableResource, id: string, extra?: Record<string, string | undefined>): string {
  if (!allowedResources.has(resource) || !id.trim() || id.length > 200) throw new Error('بيانات الرابط غير صالحة.');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(extra ?? {})) if (value && /^[a-zA-Z0-9_-]{1,80}$/.test(key)) query.set(key, value);
  const suffix = query.toString();
  return `${Linking.createURL(`${resource}/${encodeURIComponent(id)}`)}${suffix ? `?${suffix}` : ''}`;
}
export async function shareMarketPlatResource(resource: ShareableResource, id: string, title: string, extra?: Record<string, string | undefined>): Promise<void> {
  const url = createMarketPlatDeepLink(resource, id, extra);
  await Share.share({ message: `${title.trim() || 'شاهد هذا المحتوى على MarketPlat'}\n${url}`, url, title: 'مشاركة على MarketPlat' });
}

/** Shares the compact v1 offline QR payload through the native receiver route. */
export async function shareSharedPayload(encodedPayload: string, title: string): Promise<void> {
  if (!encodedPayload || encodedPayload.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) throw new Error('بيانات المشاركة غير صالحة.');
  const url = `${Linking.createURL('shared')}#d=${encodedPayload}`;
  await Share.share({ message: `${title.trim() || 'محتوى تمت مشاركته'}\n${url}`, url, title: 'مشاركة بدون إنترنت' });
}
