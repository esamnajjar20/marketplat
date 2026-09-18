/**
 * سياسة كاش MarketPlat — مصدر واحد لحدود البيانات المحلية.
 *
 * القاعدة: الكاش يسرّع ويعطي offline، والسيرفر يبقى مصدر الحقيقة أونلاين.
 *
 * راجع: docs/OFFLINE_CACHE_ARCHITECTURE.md
 *
 * أرقام IMAGE/API في public/sw.js يجب أن تبقى متوافقة عند التغيير
 * (SW لا يستورد هذا الملف — انسخ القيم يدويًا هناك).
 */

/** حدود قوائم البيانات المحلية (localStorage / offlineListCache). */
export const OFFLINE_DATA_LIMITS = {
  adsBrowse: 24,
  myAds: 30,
  productsBrowse: 24,
  servicesBrowse: 24,
  storesBrowse: 24,
  categories: 80,
  activity: 40,
  savedSearches: 20,
  sellersRanking: 30,
  notifications: 30,
  conversations: 50,
  messagesPerConversation: 100,
  savedAdsExplicit: 30,
} as const;

/** حدود Cache Storage (معلوماتية — التنفيذ في sw.js). */
export const SW_CACHE_LIMITS = {
  apiEntries: 60,
  imageEntries: 80,
  // FIX CACHE-POLICY-SAVED-ADS: كان مفقوداً من هذه المرآة المعلوماتية.
  savedAdsEntries: 500,
  staticEntries: 250,
} as const;

/** أسماء كاشات مُصدَّرة (غير مرتبطة بإصدار) vs مُصدَّرة. */
export const UNVERSIONED_CACHES = [
  'market-saved-ads',
  // FIX AUTO-READ-CACHE-PRESERVE: نفس سياسة market-saved-ads — بدون
  // إصدار، يُحفظ عبر كل SW update.
  'market-auto-read-ads',
] as const;

export const VERSIONED_CACHE_PREFIXES = [
  'market-static-',
  'market-core-',
  'market-personal-shell-',
  'market-images-',
  'market-api-',
] as const;
