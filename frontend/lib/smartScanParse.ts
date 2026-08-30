/**
 * استخراج ذكي للاسم / الرقم / بيانات البطاقة من نص ممسوح (QR أو OCR).
 */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

// نفس مدى الأطوال المعتمد بـocrCardScan.ts (CARD_USER_LEN / CARD_PASS_LEN) —
// مكرَّر محليًا هنا عمدًا بدل الاستيراد المتبادل، لأن هذا الملف نص عادي
// (لا 'use client') وقد يُستخدم خارج سياق المتصفح.
const CARD_USER_LEN_MIN = 8;
const CARD_USER_LEN_MAX = 16;
const CARD_PASS_LEN_MIN = 4;
const CARD_PASS_LEN_MAX = 10;

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => EN_DIGITS[AR_DIGITS.indexOf(d)] ?? d);
}

/** جوال فلسطين: 059 أو 056 + 7 أرقام = 10 */
export function isValidPalMobile(value: string): boolean {
  return /^(059|056)\d{7}$/.test(value);
}

export function normalizePalMobile(raw: string): string {
  let n = normalizeDigits(raw).replace(/\D/g, '');
  if (/^5[69]\d{7}$/.test(n)) n = '0' + n;
  return n;
}

export function normalizePersonName(raw: string): string {
  return raw
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/** أرقام جوال فلسطين — يفضّل 059/056 بطول 10 */
export function extractPhone(text: string): string {
  const t = normalizeDigits(text).replace(/[\u00a0]/g, ' ');
  const digitsOnly = t.replace(/\D/g, ' ');
  // ابحث عن 059/056 صريح أولًا
  const strict = digitsOnly.match(/0?5[69]\d{7}/g);
  if (strict) {
    for (const m of strict) {
      const n = normalizePalMobile(m);
      if (isValidPalMobile(n)) return n;
    }
  }
  const patterns = [
    /(?:\+?970|00970)?[\s\-]?0?5[69][\s\-]?\d{3}[\s\-]?\d{4}/g,
    /0?5[69][\s\-]?\d{7}/g,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[0]) {
      const n = normalizePalMobile(m[0]);
      if (isValidPalMobile(n)) return n;
    }
  }
  return '';
}

function lineValue(line: string): string {
  // نأخذ أقرب فاصل فعلي بعد التسمية (أول ':'/'：'/'-' بالسطر)، لا الأبعد —
  // Math.max كانت تختار آخر فاصل، فإذا كانت القيمة نفسها تحتوي شرطة داخلية
  // (شائع بأرقام الحسابات/البطاقات مثل "059-1234567") كانت تُقصّ القيمة عند
  // تلك الشرطة الداخلية بدل الفاصل الحقيقي بعد التسمية.
  const indices = [line.indexOf(':'), line.indexOf('：'), line.indexOf('-')].filter(
    (i) => i >= 0,
  );
  if (indices.length > 0) return line.slice(Math.min(...indices) + 1).trim();
  return line.trim();
}

function findLabeled(text: string, labels: string[]): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const low = line.toLowerCase();
    for (const lab of labels) {
      if (low.includes(lab.toLowerCase()) || line.includes(lab)) {
        const v = lineValue(line);
        if (v && v.toLowerCase() !== lab.toLowerCase()) return v;
      }
    }
  }
  // نفس السطر بمسافات: "الاسم أحمد"
  for (const lab of labels) {
    const re = new RegExp(`${lab}\\s*[:：\\-]?\\s*(.+)`, 'i');
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().split(/\n/)[0]!.trim();
  }
  return '';
}

export interface PayParseResult {
  name: string;
  number: string;
  methodHint: 'jawwal' | 'palpay' | 'bank' | null;
  confidence: number;
  raw: string;
}

export function smartParsePay(text: string): PayParseResult {
  const raw = text.trim();
  let confidence = 0;

  let name = findLabeled(raw, [
    'الاسم',
    'اسم',
    'name',
    'المستفيد',
    'الحساب باسم',
    'account name',
    'beneficiary',
  ]);
  let number =
    findLabeled(raw, [
      'الرقم',
      'رقم',
      'number',
      'phone',
      'جوال',
      'موبايل',
      'mobile',
      'حساب',
      'account',
      'iban',
    ]) || extractPhone(raw);

  number = normalizeDigits(number).replace(/[^\d+]/g, '');
  if (number && !number.startsWith('+') && number.length > 15) {
    // ربما لصق زائد
    const phone = extractPhone(number);
    if (phone) number = phone;
  }

  // تلميح طريقة الدفع
  let methodHint: PayParseResult['methodHint'] = null;
  const low = raw.toLowerCase();
  if (/جوال\s*بي|jawwal/i.test(raw)) methodHint = 'jawwal';
  else if (/بال\s*بي|palpay|pal\s*pay/i.test(raw)) methodHint = 'palpay';
  else if (/بنك\s*فلسطين|bank.*palestin|bop/i.test(low)) methodHint = 'bank';

  if (name) confidence += 0.4;
  if (number && number.length >= 9) confidence += 0.5;
  if (methodHint) confidence += 0.1;

  // سطور بدون تسميات: السطر غير الرقمي = اسم، الرقمي = رقم
  if (!name || !number) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const digits = normalizeDigits(line).replace(/\D/g, '');
      if (!number && digits.length >= 9 && digits.length <= 14) {
        number = extractPhone(line) || digits;
        confidence += 0.2;
      } else if (
        !name &&
        digits.length < 6 &&
        line.length >= 2 &&
        !/طريقة|method|دفع|payment/i.test(line)
      ) {
        name = line.replace(/^[\-–—:：\s]+/, '');
        confidence += 0.15;
      }
    }
  }

  // تنظيف اسم عالق مع تسمية
  name = name.replace(/^(الاسم|name)\s*[:：]?\s*/i, '').trim();
  name = normalizePersonName(name);

  // جوال فلسطين: 059/056 + 7 أرقام
  const phoneNorm = normalizePalMobile(number || extractPhone(raw));
  if (isValidPalMobile(phoneNorm)) {
    number = phoneNorm;
    confidence = Math.min(1, confidence + 0.2);
  } else if (number) {
    number = phoneNorm || normalizeDigits(number).replace(/\D/g, '');
  }

  return {
    name,
    number,
    methodHint,
    confidence: Math.min(1, confidence),
    raw,
  };
}

export interface CardParseResult {
  username: string;
  password: string;
  label: string;
  confidence: number;
  raw: string;
}

export function smartParseCard(text: string): CardParseResult {
  const raw = text.trim();
  let confidence = 0;

  // بطاقات النت في هذا المشروع: اسم المستخدم وكلمة السر أرقام فقط.
  const toDigits = (s: string) =>
    normalizeDigits(s)
      .replace(/[OoD]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb]/g, '8')
      .replace(/[^\d]/g, '');

  let username = toDigits(
    findLabeled(raw, ['اسم المستخدم', 'المستخدم', 'username', 'user', 'رقم المستخدم']),
  );
  let password = toDigits(
    findLabeled(raw, ['كلمة السر', 'كلمة المرور', 'السر', 'password', 'pass', 'pin']),
  );
  if (username) confidence += 0.35;
  if (password) confidence += 0.35;

  const label = findLabeled(raw, ['النوع', 'الباقة', 'الخطة', 'plan', 'package']) || '';

  if (!username || !password) {
    // شكل شائع جدًا: نص خام بلا تسميات على هيئة "اسم_المستخدم\nكلمة_السر"
    // بالضبط (هذا هو ناتج ocrCardFieldsFromGuide نفسه، الذي يحدد الترتيب
    // فعليًا بالموضع الفيزيائي على البطاقة — اسم المستخدم دائمًا يسبق كلمة
    // السر). فرز كل الأرقام حسب الطول تنسيًا "الأطول = مستخدم" كان يقلب
    // هذا الترتيب الصحيح أصلًا كلما كانت كلمة السر (مصادفة) أطول رقميًا من
    // اسم المستخدم على بطاقة معيّنة — تخمين بلا أساس يُبطل تحديدًا موضعيًا
    // موثوقًا تم بالفعل قبل وصول النص لهنا. لذلك نتحقق أولًا من هذا الشكل
    // بالضبط ونحافظ على ترتيب الأسطر كما هو، قبل أي فرز حسب الطول.
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 2) {
      const [first, second] = lines.map(toDigits);
      if (
        first && second && first !== second &&
        first.length >= CARD_USER_LEN_MIN && first.length <= CARD_USER_LEN_MAX &&
        second.length >= CARD_PASS_LEN_MIN && second.length <= CARD_PASS_LEN_MAX
      ) {
        if (!username) { username = first; confidence += 0.25; }
        if (!password) { password = second; confidence += 0.25; }
      }
    }
  }

  if (!username || !password) {
    // لا نفرز حسب الطول — لو تساوى طول اسم المستخدم وكلمة السر (حالة واقعية
    // مؤكدة)، الفرز التنازلي كان يعطي ترتيبًا عشوائيًا فعليًا بينهما. بدلها:
    // اعتماد ترتيب الظهور بالنص الخام (الموضع الفيزيائي الحقيقي على البطاقة)
    // — نفس المبدأ المعتمد بـocrCardScan.ts.
    const runs = (raw.match(/\d{4,}/g) ?? [])
      .map(toDigits)
      .filter(Boolean);
    if (!username) {
      const longRun = runs.find((r) => r.length >= 8 && r.length <= 16);
      if (longRun) {
        username = longRun;
        confidence += 0.25;
      }
    }
    if (!password) {
      const usernameIdx = username ? runs.indexOf(username) : -1;
      const shortRun =
        runs.find((r, i) => r !== username && r.length >= 4 && r.length <= 10 && i > usernameIdx) ??
        runs.find((r) => r !== username && r.length >= 4 && r.length <= 10);
      if (shortRun) {
        password = shortRun;
        confidence += 0.25;
      }
    }
  }

  // تنظيف نهائي — أرقام فقط
  username = toDigits(username);
  password = toDigits(password);
  if (username && password && username === password) {
    password = '';
    confidence = Math.max(0, confidence - 0.2);
  }
  if (username.length >= 8 && username.length <= 16) confidence += 0.1;
  if (password.length >= 4 && password.length <= 10) confidence += 0.1;

  return {
    username: username.trim(),
    password: password.trim(),
    label: label.trim(),
    confidence: Math.min(1, confidence),
    raw,
  };
}

/** هل النص يشبه بطاقة نت أكثر من دفع؟ */
export function looksLikeCard(text: string): boolean {
  return /كلمة\s*السر|password|username|اسم\s*المستخدم|بطاقة\s*نت|wifi|user\s*[:：]/i.test(
    text,
  );
}
