/**
 * مشاركة رابط/نص: Native Share plugin أو navigator.share أو الحافظة.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { nativeShare } from '@/lib/capacitor/nativeShare';

export async function shareContent(opts: {
  title?: string;
  text?: string;
  url: string;
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (await isNativePlatform()) {
    try {
      const ok = await nativeShare({
        title: opts.title ?? opts.text ?? 'MarketPlat',
        url: opts.url,
      });
      return ok ? 'shared' : 'cancelled';
    } catch {
      return 'failed';
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }

  const payload = [opts.title, opts.text, opts.url].filter(Boolean).join('\n');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return 'copied';
    }
  } catch {
    /* ignore */
  }
  return 'failed';
}
