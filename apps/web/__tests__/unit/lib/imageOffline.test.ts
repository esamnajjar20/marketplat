/**
 * __tests__/unit/lib/imageOffline.test.ts
 *
 * هذا الملف كان بلا أي caller (كود ميت) ثم
 * حُذف، ثم أُعيدت كتابته ووُصل فعليًا بـ useAdMutations.ts. اختبارات
 * shouldCacheImageResponse كاملة (دالة نقية). اختبارات
 * compressImageForOffline محدودة عمدًا: jsdom لا يوفّر Canvas 2D حقيقي
 * ولا createImageBitmap فعليًا — هنا نتحقق من سلوك الحماية (رفض ملف
 * غير صورة، ورمي خطأ واضح ببيئة بلا دعم) بدل محاكاة كامل لمحرّك رسم لا
 * قيمة حقيقية لاختباره بهذه البيئة.
 */
import { describe, it, expect } from 'vitest';
import { compressImageForOffline, shouldCacheImageResponse } from '@/lib/imageOffline';

describe('shouldCacheImageResponse', () => {
  it('returns false for a non-ok response', () => {
    const res = new Response(null, { status: 404 });
    expect(shouldCacheImageResponse(res)).toBe(false);
  });

  it('returns true for an ok response under the 2.5MB threshold', () => {
    const res = new Response(null, { status: 200, headers: { 'content-length': String(1024 * 1024) } });
    expect(shouldCacheImageResponse(res)).toBe(true);
  });

  it('returns false for an ok response over the 2.5MB threshold', () => {
    const res = new Response(null, {
      status: 200,
      headers: { 'content-length': String(3 * 1024 * 1024) },
    });
    expect(shouldCacheImageResponse(res)).toBe(false);
  });

  it('returns true when content-length is missing (cannot prove it is too large)', () => {
    const res = new Response(null, { status: 200 });
    expect(shouldCacheImageResponse(res)).toBe(true);
  });
});

describe('compressImageForOffline', () => {
  it('rejects a non-image file before touching Canvas', async () => {
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    await expect(compressImageForOffline(file)).rejects.toThrow('الملف ليس صورة');
  });

  it('fails safely (rejects, does not throw synchronously / crash) in an environment without Canvas support', async () => {
    // jsdom في هذا المشروع لا يوفّر createImageBitmap فعليًا — هذا يتحقق
    // من نفس المسار الذي يعتمد عليه useAdMutations.ts's try/catch: فشل
    // نظيف بـ reject، لا استثناء غير متوقَّع يكسر الاستدعاء المحيط.
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await expect(compressImageForOffline(file)).rejects.toThrow();
  });
});
