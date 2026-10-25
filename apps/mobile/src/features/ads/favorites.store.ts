import * as SecureStore from 'expo-secure-store';

const FAVORITES_KEY = 'marketplat.mobile.favorite-ad-ids.v1';

/** Device-local favorites; this is not a server-synced account feature. */
export async function readFavoriteAdIds(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(FAVORITES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

export async function writeFavoriteAdIds(ids: string[]): Promise<void> {
  const normalized = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  await SecureStore.setItemAsync(FAVORITES_KEY, JSON.stringify(normalized));
}
