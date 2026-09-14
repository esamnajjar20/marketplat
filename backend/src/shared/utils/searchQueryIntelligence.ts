/**
 * SEARCH-INTEL-01: فهم قصد المستخدم قبل بناء استعلام Postgres FTS.
 *
 * plainto_tsquery + arabic_normalize يعطيان تطبيع أشكال الحروف فقط.
 * هذا الملف يضيف:
 *  1) توسيع مرادفات ولهجات (موبايل↔جوال↔هاتف، …)
 *  2) إزالة «ال» التعريفية من بداية الكلمة
 *  3) تنويعات ة/ه و ي/ى على مستوى الاستعلام فقط (بدون تغيير الفهرس)
 *  4) جمع صيغ الجمع/المفرد الشائعة الخفيفة
 *  5) أخطاء إملاء شائعة في السوق المحلي
 *  6) إشارة نية بسيطة (متجر / خدمة / منتج) يمكن للطبقة الأعلى استخدامها
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
    .replace(/[\u0640\u064B-\u0652]/g, '')
    .toLowerCase();
}

// ─── مرادفات (كل مجموعة تمثّل مفهوماً واحداً) ─────────────────────────
// كلمات مفردة فقط — العبارات متعددة الكلمات تُضاف كرموز منفصلة عند الحاجة.
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // هواتف (فئة عامة — العلامات التجارية مجموعات منفصلة)
  ['موبايل', 'جوال', 'هاتف', 'تلفون', 'mobile', 'phone', 'smartphone'],
  ['ايفون', 'iphone', 'آيفون'],
  ['سامسونج', 'samsung', 'جلاكسي', 'galaxy'],
  ['شاومي', 'xiaomi', 'ريدمي', 'redmi'],
  ['هواوي', 'huawei', 'هونر', 'honor'],
  // حاسب
  ['لابتوب', 'لاب', 'حاسوب', 'كمبيوتر', 'نوتبوك', 'laptop', 'notebook', 'pc', 'كمبيوترمحمول'],
  // سيارات
  ['سيارة', 'سياره', 'عربيه', 'عربية', 'اتومبيل', 'car', 'auto', 'مركبة', 'مركبه'],
  // عقارات
  ['شقة', 'شقه', '아파트', 'apartment', 'flat', 'بيت', 'منزل', 'دار', 'فيلا', 'villa', 'ارض', 'أرض', 'plot'],
  // أثاث
  ['اثاث', 'أثاث', 'furniture', 'كنب', 'sofa', 'طاولة', 'طاوله', 'مكتب', 'خزانة', 'خزانه'],
  // ملابس
  ['ملابس', 'لبسة', 'لبسه', 'قميص', 'بنطلون', 'حذاء', 'احذية', 'shoes', 'clothes'],
  // كهربائيات
  ['ثلاجة', 'ثلاجه', 'fridge', 'refrigerator', 'غسالة', 'غساله', 'washer', 'فرن', 'ميكروويف', 'تكييف', 'مكيف', 'ac'],
  // دراجات
  ['دراجة', 'دراجе', 'بسكليت', 'بسكليته', 'bike', 'bicycle', 'سكوتر', 'scooter'],
  // أطفال
  ['طفل', 'اطفال', 'أطفال', 'بيبي', 'bebe', 'baby', 'العاب', 'ألعاب', 'toys'],
  // خدمات شائعة
  ['تصليح', 'صيانة', 'اصلاح', 'إصلاح', 'repair', 'maintenance', 'سباكة', 'سباكه', 'كهرباء', 'نجار', 'دهان'],
  ['تنظيف', 'نظافة', 'cleaning', 'توصيل', 'دليفري', 'delivery', 'نقل', 'شحن'],
  // متاجر
  ['متجر', 'محل', 'دكان', 'دكانه', 'store', 'shop', 'market', 'سوق'],
  // أجهزة منزلية عامة
  ['جهاز', 'اداة', 'أداة', 'device', 'appliance'],
];

// أخطاء إملاء / اختصارات شائعة → الشكل الصحيح (أو الأقرب للفهرس)
const COMMON_TYPOS: Record<string, string> = {
  اديدس: 'اديداس',
  اديديس: 'اديداس',
  نايكي: 'نايك',
  nike: 'نايك',
  ابل: 'apple',
  ايفونن: 'ايفون',
  ايفوننر: 'ايفون',
  سامسنج: 'سامسونج',
  سامسونغ: 'سامسونج',
  لابتوو: 'لابتوب',
  موبايلل: 'موبايل',
  جواال: 'جوال',
  سيارهه: 'سياره',
  شقق: 'شقة',
  عقارت: 'عقارات',
  عقارات: 'عقار',
};

// كلمات تشير لنية نوع النتيجة (ليست مطلوبة في المطابقة الحرفية)
const INTENT_STORE = new Set(['متجر', 'محل', 'دكان', 'store', 'shop', 'market']);
const INTENT_SERVICE = new Set([
  'خدمة', 'خدمه', 'خدمات', 'تصليح', 'صيانة', 'اصلاح', 'إصلاح',
  'سباكة', 'كهرباء', 'تنظيف', 'توصيل', 'نقل', 'service', 'repair',
]);
const INTENT_PRODUCT = new Set(['منتج', 'سلعة', 'سلعه', 'product', 'جديد', 'مستعمل']);

const TOKEN_SEPARATORS = /[\s,،؛;/\\|+\-_]+/;

/** حروف عربية/لاتينية/أرقام فقط لـ to_tsquery */
function sanitizeToken(raw: string): string {
  return raw.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '');
}

function stripDefiniteArticle(token: string): string {
  if (token.length >= 4 && token.startsWith('ال')) return token.slice(2);
  return token;
}

/** تنويعات إملائية خفيفة على الاستعلام (ة↔ه، جمع خفيف) */
function morphologicalVariants(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.endsWith('ة')) out.add(token.slice(0, -1) + 'ه');
  if (token.endsWith('ه') && token.length > 2) out.add(token.slice(0, -1) + 'ة');
  if (token.endsWith('ات') && token.length > 3) out.add(token.slice(0, -2));
  if (token.endsWith('ون') && token.length > 3) out.add(token.slice(0, -2));
  if (token.endsWith('ين') && token.length > 3) out.add(token.slice(0, -2));
  if (token.endsWith('ان') && token.length > 3) out.add(token.slice(0, -2));
  // إن لم تنتهِ بعلامة جمع، جرّب إضافة ات الشائعة للبحث عن الجمع
  if (!/(ات|ون|ين|ان)$/.test(token) && token.length >= 3) {
    out.add(token + 'ات');
  }
  return [...out];
}

function synonymExpand(token: string): string[] {
  const out = new Set<string>([token]);
  const typoFix = COMMON_TYPOS[token];
  if (typoFix) {
    out.add(typoFix);
    token = typoFix;
  }
  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map((g) => normalizeSearchText(g));
    if (normalizedGroup.includes(token)) {
      for (const g of normalizedGroup) out.add(g);
    }
  }
  return [...out];
}

function expandToken(rawToken: string): string[] {
  let t = sanitizeToken(normalizeSearchText(rawToken));
  if (!t) return [];
  t = stripDefiniteArticle(t);
  if (!t) return [];

  const variants = new Set<string>();
  for (const base of morphologicalVariants(t)) {
    for (const syn of synonymExpand(base)) {
      const s = sanitizeToken(syn);
      if (s.length >= 1) variants.add(s);
      // بادئة للأسماء الأطول (≥4) لتحسين الإكمال الجزئي داخل FTS
      if (s.length >= 4) variants.add(`${s}:*`);
    }
  }
  return [...variants];
}

export type SearchIntentType = 'ad' | 'product' | 'store' | 'service';

export interface IntelligentSearchQuery {
  /** النص بعد التطبيع الأساسي */
  normalized: string;
  /** مفاهيم: كل مصفوفة = بدائل OR لنفس المعنى */
  concepts: string[][];
  /** سلسلة to_tsquery('simple', ...) بدون استدعاء arabic_normalize هنا — يُطبَّق في SQL */
  tsQueryString: string | null;
  /** تلميح نوع اختياري من كلمات النية */
  preferredTypes: SearchIntentType[];
  /** هل وُسّع الاستعلام فعلياً بمرادفات/تنويعات */
  expanded: boolean;
}

/**
 * يحلّل نص البحث الخام إلى مفاهيم موسَّعة + سلسلة tsquery آمنة.
 */
export function analyzeSearchQuery(raw: string | null | undefined): IntelligentSearchQuery {
  const normalized = normalizeSearchText(raw ?? '');
  if (!normalized.trim()) {
    return { normalized: '', concepts: [], tsQueryString: null, preferredTypes: [], expanded: false };
  }

  const rawTokens = normalized
    .split(TOKEN_SEPARATORS)
    .map((t) => t.trim())
    .filter(Boolean);

  const concepts: string[][] = [];
  const preferredTypes = new Set<SearchIntentType>();
  let expanded = false;

  for (const rawTok of rawTokens) {
    const clean = sanitizeToken(rawTok);
    if (!clean) continue;

    // نية النوع — لا تُحذف من المطابقة إن كانت جزءاً من استعلام حقيقي قصير
    const withoutAl = stripDefiniteArticle(clean);
    if (INTENT_STORE.has(withoutAl) || INTENT_STORE.has(clean)) preferredTypes.add('store');
    if (INTENT_SERVICE.has(withoutAl) || INTENT_SERVICE.has(clean)) preferredTypes.add('service');
    if (INTENT_PRODUCT.has(withoutAl) || INTENT_PRODUCT.has(clean)) preferredTypes.add('product');

    const variants = expandToken(rawTok);
    if (variants.length === 0) continue;
    if (variants.length > 1) expanded = true;
    // إن كان التوكن الأصلي وحده بدون توسيع حقيقي، variants قد تحتوي prefix فقط
    const baseOnly = variants.filter((v) => !v.endsWith(':*'));
    if (baseOnly.length > 1) expanded = true;
    concepts.push(variants);
  }

  if (concepts.length === 0) {
    return { normalized, concepts: [], tsQueryString: null, preferredTypes: [], expanded: false };
  }

  // (a|b|c) & (d|e) — أقواس لكل مفهوم
  const tsQueryString = concepts
    .map((alts) => {
      const unique = [...new Set(alts)];
      if (unique.length === 1) return unique[0];
      return `(${unique.join(' | ')})`;
    })
    .join(' & ');

  return {
    normalized,
    concepts,
    tsQueryString,
    preferredTypes: [...preferredTypes],
    expanded,
  };
}

/**
 * يبني Prisma.Sql لـ to_tsquery مع arabic_normalize على السلسلة الكاملة.
 * إن فشل التحليل يُرجع null (لا فلتر نصي).
 */
export function buildIntelligentTsQuerySql(
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown },
  raw: string | undefined | null,
): unknown | null {
  const { tsQueryString } = analyzeSearchQuery(raw ?? undefined);
  if (!tsQueryString) return null;
  // arabic_normalize على السلسلة كاملة يطوي أ/إ/آ داخل المرادفات أيضاً
  return Prisma.sql`to_tsquery('simple', arabic_normalize(${tsQueryString}))`;
}

/**
 * توسيع كلمات الاستعلام لاستخدام matchesSearchQuery (المحفوظات) —
 * نمرّر كل المرادفات كـ OR ضمنياً عبر استدعاءات متعددة أو دمج haystack.
 * هنا نعيد قائمة «أي من هذه الرموز يكفي» لكل مفهوم مطلوب.
 */
export function expandedRequiredConcepts(rawQuery: string): string[][] {
  const { concepts } = analyzeSearchQuery(rawQuery);
  // أزل صيغ البادئة :* من المطابقة في Node
  return concepts.map((c) => c.map((x) => x.replace(/:\*$/, '')).filter(Boolean));
}
