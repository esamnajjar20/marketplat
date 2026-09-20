/**
 * SEARCH-INTEL-02: فهم قصد المستخدم قبل بناء استعلام Postgres FTS.
 *
 * يبني على SEARCH-INTEL-01 ويوسّع:
 *  1) مرادفات ولهجات أوسع لسوق غزة (عربي + إنجليزي + عامية)
 *  2) تطبيع أرقام عربية-هندية وأخطاء إملاء محلية
 *  3) إزالة «ال» + كلمات ضجيج شائعة
 *  4) تنويعات صرفية خفيفة (ة/ه، جمع/مثنى، بادئات)
 *  5) نية النوع (متجر / خدمة / منتج / إعلان)
 *  6) بادئة :* للكلمات الأطول لدعم الإكمال الجزئي داخل FTS
 *
 * الناتج tsQueryString صالح لـ to_tsquery('simple', …) بعد arabic_normalize
 * في SQL — الشكل: (a|b|c) & (d|e) لكل مفهوم مطلوب.
 */

/** Local copy of normalizeSearchText — avoid circular import with searchTextMatch. */
function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
  // FIX SEARCH-TA-MARBUTA-01: removed the ة -> ه fold. SQL's
  // arabic_normalize (see migrations/20260805212538_arabic_search_
  // normalization) deliberately does NOT fold ta marbuta -> ha —
  // the two Arabic letters change gender and meaning often enough
  // that folding trades a small precision loss for a larger one.
  // The JS side folding it anyway meant 'سيارة' (the user's input,
  // folded to 'سياره') went to to_tsquery as 'سياره' while the
  // GIN index held the untouched 'سيارة' — every Arabic word
  // ending in ta marbuta was unsearchable via FTS: cars, schools,
  // stores, images, services, rooms, shirts, etc. Removing this
  // line makes JS normalization a strict subset of SQL's, which
  // is the invariant the query path requires.
    .replace(/[\u0640\u064B-\u0652]/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase();
}

// ─── مرادفات (كل مجموعة = مفهوم واحد) ────────────────────────────────
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // هواتف
  ['موبايل', 'جوال', 'هاتف', 'تلفون', 'تليفون', 'mobile', 'phone', 'smartphone', 'سمارتفون'],
  ['ايفون', 'iphone', 'آيفون', 'اي فون'],
  ['سامسونج', 'samsung', 'جلاكسي', 'galaxy', 'galxy'],
  ['شاومي', 'xiaomi', 'ريدمي', 'redmi', 'بوكو', 'poco'],
  ['هواوي', 'huawei', 'هونر', 'honor'],
  ['اوبو', 'oppo', 'ريلمي', 'realme', 'فيفو', 'vivo'],
  ['نوكيا', 'nokia'],
  // حاسب وتقنية
  ['لابتوب', 'لاب', 'حاسوب', 'كمبيوتر', 'نوتبوك', 'laptop', 'notebook', 'pc', 'كمبيوترمحمول'],
  ['تابلت', 'tablet', 'ايباد', 'ipad', 'لوحة'],
  ['سماعة', 'سماعات', 'هيدفون', 'headset', 'headphones', 'ايربودز', 'airpods', 'سماعاتبلوتوث'],
  ['شاحن', 'charger', 'باوربانك', 'powerbank', 'بطارية'],
  ['راوتر', 'راوترات', 'router', 'وايفاي', 'wifi', 'انترنت', 'نت'],
  ['شاشة', 'مونيتور', 'monitor', 'تلفزيون', 'تلفاز', 'tv', 'flat'],
  ['كاميرا', 'camera', 'تصوير', 'كانون', 'nikon', 'sony'],
  ['طابعة', 'printer', 'سكانر', 'scanner'],
  // سيارات ومركبات
  ['سيارة', 'سياره', 'عربيه', 'عربية', 'اتومبيل', 'car', 'auto', 'مركبة', 'مركبه', 'عربية'],
  ['براد', 'بكب', 'بيك اب', 'pickup', 'وانيت', 'شاحنة', 'truck'],
  ['موتور', 'دراجةنارية', 'موتوسيكل', 'motorcycle', 'scooter', 'سكوتر'],
  ['قطع', 'قطعغيار', 'spare', 'parts', 'ميكانيك'],
  // عقارات
  ['شقة', 'شقه', 'apartment', 'flat', 'بيت', 'منزل', 'دار', 'فيلا', 'villa', 'ارض', 'أرض', 'plot', 'عقار', 'عقارات'],
  ['ايجار', 'إيجار', 'rent', 'مستأجر', 'للايجار'],
  ['بيع', 'sale', 'للبيع'],
  // أثاث ومنزل
  ['اثاث', 'أثاث', 'furniture', 'كنب', 'sofa', 'طاولة', 'طاوله', 'مكتب', 'خزانة', 'خزانه', 'سرير', 'غرفةنوم'],
  ['مطبخ', 'kitchen', 'اجهزةمطبخ'],
  // ملابس
  ['ملابس', 'لبسة', 'لبسه', 'قميص', 'بنطلون', 'حذاء', 'احذية', 'shoes', 'clothes', 'كوتشي', 'جزمة'],
  ['ساعة', 'ساعات', 'watch', 'smartwatch', 'ساعةذكية'],
  ['شنطة', 'حقيبة', 'bag', 'backpack'],
  // كهربائيات
  ['ثلاجة', 'ثلاجه', 'fridge', 'refrigerator', 'غسالة', 'غساله', 'washer', 'فرن', 'ميكروويف', 'تكييف', 'مكيف', 'ac'],
  ['مروحة', 'fan', 'دفاية', 'heater', 'سخان'],
  // دراجات وأطفال
  ['دراجة', 'دراجе', 'بسكليت', 'بسكليته', 'bike', 'bicycle', 'سكوتر'],
  ['طفل', 'اطفال', 'أطفال', 'بيبي', 'bebe', 'baby', 'العاب', 'ألعاب', 'toys', 'حضانة'],
  // أغذية ومواد
  ['طعام', 'اكل', 'مأكولات', 'food', 'خضار', 'فاكهة', 'لحمة', 'دجاج'],
  // خدمات شائعة في غزة
  ['تصليح', 'صيانة', 'اصلاح', 'إصلاح', 'repair', 'maintenance'],
  ['سباكة', 'سباكه', 'سباك', 'plumbing'],
  ['كهرباء', 'كهربائي', 'electric', 'electrical'],
  ['نجار', 'نجارة', 'woodwork', 'carpentry'],
  ['دهان', 'صباغ', 'طلاء', 'paint'],
  ['تنظيف', 'نظافة', 'cleaning'],
  ['توصيل', 'دليفري', 'delivery', 'نقل', 'شحن', 'سائق'],
  ['دروس', 'تدريس', 'معلم', 'تعليم', 'tutor', 'teacher'],
  ['حلاقة', 'صالون', 'كوافير', 'barber', 'salon'],
  ['خياطة', 'خياط', 'تعديلملابس'],
  // متاجر وتجارة
  ['متجر', 'محل', 'دكان', 'دكانه', 'store', 'shop', 'market', 'سوق', 'بقالة', 'سوبرماركت'],
  ['جهاز', 'اداة', 'أداة', 'device', 'appliance'],
  // صحة
  ['دواء', 'ادوية', 'صيدلية', 'pharmacy', 'طبي', 'عيادة'],
  // حيوانات
  ['قطة', 'قط', 'كلب', 'حيوانات', 'pet', 'cat', 'dog'],
  // ألعاب وترفيه
  ['بلايستيشن', 'playstation', 'ps5', 'ps4', 'xbox', 'نينتندو', 'العابفيديو'],
];

/** أخطاء إملاء / اختصارات / كتابة صوتية شائعة */
const COMMON_TYPOS: Record<string, string> = {
  اديدس: 'اديداس',
  اديديس: 'اديداس',
  نايكي: 'نايك',
  nike: 'نايك',
  ابل: 'apple',
  ايفونن: 'ايفون',
  ايفوننر: 'ايفون',
  اييفون: 'ايفون',
  سامسنج: 'سامسونج',
  سامسونغ: 'سامسونج',
  سامسونق: 'سامسونج',
  لابتوو: 'لابتوب',
  لابtob: 'لابتوب',
  موبايلل: 'موبايل',
  جواال: 'جوال',
  جوالل: 'جوال',
  سيارهه: 'سياره',
  سياره: 'سيارة',
  شقق: 'شقة',
  عقارت: 'عقارات',
  تلفونن: 'تلفون',
  كمبيتر: 'كمبيوتر',
  حاسوبب: 'حاسوب',
  غسالهه: 'غسالة',
  ثلاجهه: 'ثلاجة',
  سكوترر: 'سكوتر',
  توصيلل: 'توصيل',
  صيانه: 'صيانة',
  اصلااح: 'اصلاح',
  كهربا: 'كهرباء',
  سباكه: 'سباكة',
};

/** كلمات ضجيج — لا تُحسب كمفاهيم مطلوبة في FTS */
const STOP_WORDS = new Set(
  [
    'في',
    'من',
    'على',
    'الى',
    'إلى',
    'عن',
    'مع',
    'هذا',
    'هذه',
    'ذلك',
    'او',
    'أو',
    'و',
    'يا',
    'سعر',
    'ثمن',
    'رخيص',
    'رخيصه',
    'رخيصة',
    'غالي',
    'جديد',
    'جديده',
    'جديدة',
    'مستعمل',
    'مستعمله',
    'مستعملة',
    'ممتاز',
    'حلو',
    'كويس',
    'قريب',
    'قريبة',
    'ابي',
    'أبي',
    'ابغى',
    'أبغى',
    'ابحث',
    'اريد',
    'أريد',
    'بدي',
    'بدي',
    'عايز',
    'عاوز',
    'للبيع',
    'مطلوب',
    'the',
    'a',
    'an',
    'and',
    'or',
    'for',
    'in',
    'of',
    'to',
  ].map((w) => normalizeSearchText(w)),
);

const INTENT_STORE = new Set(
  ['متجر', 'محل', 'دكان', 'store', 'shop', 'market', 'سوق', 'بقالة'].map(normalizeSearchText),
);
const INTENT_SERVICE = new Set(
  [
    'خدمة',
    'خدمه',
    'خدمات',
    'تصليح',
    'صيانة',
    'اصلاح',
    'إصلاح',
    'سباكة',
    'كهرباء',
    'تنظيف',
    'توصيل',
    'نقل',
    'service',
    'repair',
    'دروس',
    'تدريس',
  ].map(normalizeSearchText),
);
const INTENT_PRODUCT = new Set(
  ['منتج', 'سلعة', 'سلعه', 'product', 'جديد', 'مستعمل'].map(normalizeSearchText),
);
const INTENT_AD = new Set(['اعلان', 'إعلان', 'ads', 'ad', 'post'].map(normalizeSearchText));

const TOKEN_SEPARATORS = /[\s,،؛;/\\|+\-_]+/;

function sanitizeToken(raw: string): string {
  return raw.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '');
}

function stripDefiniteArticle(token: string): string {
  if (token.length >= 4 && token.startsWith('ال')) return token.slice(2);
  return token;
}

/**
 * تنويعات صرفية خفيفة على مستوى الاستعلام فقط.
 * ليست stemming كامل — تغطي أكثر الحالات الشائعة في عناوين الإعلانات.
 */
function morphologicalVariants(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.length < 2) return [...out];

  // ة ↔ ه (بعد التطبيع غالبًا ه، لكن نبقي الاثنين)
  if (token.endsWith('ة')) out.add(token.slice(0, -1) + 'ه');
  if (token.endsWith('ه') && token.length > 2) out.add(token.slice(0, -1) + 'ة');

  // جمع سالم شائع
  if (token.endsWith('ات') && token.length > 3) {
    out.add(token.slice(0, -2));
    out.add(token.slice(0, -2) + 'ه');
    out.add(token.slice(0, -2) + 'ة');
  }
  if (token.endsWith('ون') && token.length > 3) out.add(token.slice(0, -2));
  if (token.endsWith('ين') && token.length > 3) out.add(token.slice(0, -2));
  if (token.endsWith('ان') && token.length > 3) out.add(token.slice(0, -2)); // مثنى

  // مفرد → جمع خفيف
  if (!/(ات|ون|ين|ان)$/.test(token) && token.length >= 3) {
    out.add(token + 'ات');
    out.add(token + 'ين');
  }

  // همزة وصل شائعة: ا ↔ بدون
  if (token.startsWith('ا') && token.length >= 4) {
    out.add(token.slice(1));
  }

  return [...out];
}

function synonymExpand(token: string): string[] {
  const out = new Set<string>([token]);
  let t = token;
  const typoFix = COMMON_TYPOS[t];
  if (typoFix) {
    const fixed = normalizeSearchText(typoFix);
    out.add(fixed);
    t = fixed;
  }
  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map((g) => normalizeSearchText(g));
    if (normalizedGroup.includes(t)) {
      for (const g of normalizedGroup) out.add(g);
    }
  }
  return [...out];
}

function expandToken(rawToken: string): string[] {
  const cleaned = sanitizeToken(normalizeSearchText(rawToken));
  if (!cleaned || cleaned.length < 1) return [];

  const base = stripDefiniteArticle(cleaned);
  if (STOP_WORDS.has(base) || STOP_WORDS.has(cleaned)) return [];

  const out = new Set<string>();

  for (const seed of new Set([cleaned, base])) {
    for (const morph of morphologicalVariants(seed)) {
      for (const syn of synonymExpand(morph)) {
        const s = sanitizeToken(syn);
        if (s.length >= 1) out.add(s);
      }
    }
  }

  // بادئة FTS للكلمات الأطول (≥4) — إكمال جزئي
  const result: string[] = [];
  for (const t of out) {
    result.push(t);
    if (t.length >= 4) result.push(`${t}:*`);
  }
  return [...new Set(result)];
}

function detectIntent(tokens: string[]): Array<'store' | 'service' | 'product' | 'ad'> {
  const preferred: Array<'store' | 'service' | 'product' | 'ad'> = [];
  for (const t of tokens) {
    const n = normalizeSearchText(stripDefiniteArticle(t));
    if (INTENT_STORE.has(n)) preferred.push('store');
    if (INTENT_SERVICE.has(n)) preferred.push('service');
    if (INTENT_PRODUCT.has(n)) preferred.push('product');
    if (INTENT_AD.has(n)) preferred.push('ad');
  }
  return [...new Set(preferred)];
}

export interface IntelligentSearchQuery {
  normalized: string;
  concepts: string[][];
  /** سلسلة to_tsquery('simple', ...) — arabic_normalize يُطبَّق في SQL */
  tsQueryString: string | null;
  preferredTypes: Array<'store' | 'service' | 'product' | 'ad'>;
  expanded: boolean;
}

export function analyzeSearchQuery(raw: string | null | undefined): IntelligentSearchQuery {
  const normalized = normalizeSearchText(raw ?? '');
  if (!normalized.trim()) {
    return { normalized: '', concepts: [], tsQueryString: null, preferredTypes: [], expanded: false };
  }

  const rawTokens = normalized
    .split(TOKEN_SEPARATORS)
    .map((t) => t.trim())
    .filter(Boolean);

  const preferredTypes = detectIntent(rawTokens);
  const concepts: string[][] = [];
  let expanded = false;

  for (const rawTok of rawTokens) {
    const variants = expandToken(rawTok);
    if (variants.length === 0) continue;
    if (variants.length > 1) expanded = true;

    const baseOnly = variants.map((v) => v.replace(/:\*$/, ''));
    if (baseOnly.length > 1) expanded = true;

    concepts.push(variants);
  }

  if (concepts.length === 0) {
    return { normalized, concepts: [], tsQueryString: null, preferredTypes, expanded: false };
  }

  // (a|b|c) & (d|e)
  const tsQueryString = concepts
    .map((alts) => {
      const cleaned = [...new Set(alts.filter(Boolean))];
      if (cleaned.length === 0) return null;
      if (cleaned.length === 1) return cleaned[0];
      return `(${cleaned.join(' | ')})`;
    })
    .filter((x): x is string => Boolean(x))
    .join(' & ');

  return {
    normalized,
    concepts,
    tsQueryString,
    preferredTypes,
    expanded,
  };
}

export function buildIntelligentTsQuerySql(
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown },
  raw: string | undefined | null,
): unknown | null {
  const { tsQueryString } = analyzeSearchQuery(raw ?? undefined);
  if (!tsQueryString) return null;
  return Prisma.sql`to_tsquery('simple', arabic_normalize(${tsQueryString}))`;
}

/**
 * توسيع للاستدعاء من matchesSearchQuery — بدون لاحقات :*
 */
export function expandedRequiredConcepts(rawQuery: string): string[][] {
  const { concepts } = analyzeSearchQuery(rawQuery);
  return concepts.map((c) =>
    c.map((x) => x.replace(/:\*$/, '')).filter(Boolean),
  );
}
