/**
 * استخراج ذكي للاسم / الرقم / بيانات البطاقة من نص ممسوح (QR أو OCR).
 */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => EN_DIGITS[AR_DIGITS.indexOf(d)] ?? d);
}

/** أرقام جوال فلسطين/إسرائيل شائعة */
export function extractPhone(text: string): string {
  const t = normalizeDigits(text).replace(/[\u00a0]/g, ' ');
  const patterns = [
    /(?:\+?970|00970)?[\s\-]?0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}/g,
    /(?:\+?972|00972)?[\s\-]?0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}/g,
    /0?5[0-9][\s\-]?\d{7}/g,
    /\b\d{9,10}\b/g,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[0]) {
      let n = m[0].replace(/[\s\-]/g, '');
      if (n.startsWith('970') && n.length >= 12) n = '0' + n.slice(3);
      if (n.startsWith('972') && n.length >= 12) n = '0' + n.slice(3);
      if (n.startsWith('5') && n.length === 9) n = '0' + n;
      return n;
    }
  }
  return '';
}

function lineValue(line: string): string {
  const idx = Math.max(line.indexOf(':'), line.indexOf('：'), line.indexOf('-'));
  if (idx >= 0) return line.slice(idx + 1).trim();
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

  let username = findLabeled(raw, [
    'اسم المستخدم',
    'المستخدم',
    'username',
    'user',
    'login',
    'الرقم السري للمستخدم',
    'id',
  ]);
  let password = findLabeled(raw, [
    'كلمة السر',
    'كلمة المرور',
    'password',
    'pass',
    'pin',
    'الرقم السري',
    'سر',
  ]);
  let label = findLabeled(raw, ['البطاقة', 'بطاقة', 'label', 'نوع', 'الباقة', 'package']);

  if (username) confidence += 0.4;
  if (password) confidence += 0.4;
  if (label) confidence += 0.1;

  if (!username || !password) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // user:pass في سطر واحد
    for (const line of lines) {
      const m = line.match(/^([^:\s]{2,40})\s*[:|/]\s*(\S{2,40})$/);
      if (m && !username && !password) {
        username = m[1]!;
        password = m[2]!;
        confidence += 0.35;
      }
    }
    if (!username && lines[0] && !extractPhone(lines[0])) {
      username = lines[0]!;
      confidence += 0.1;
    }
    if (!password && lines[1]) {
      password = lines[1]!.split(/\s+/)[0]!;
      confidence += 0.1;
    }
  }

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
