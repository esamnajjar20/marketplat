/**
 * مخططات تحقق خفيفة بـ zod — بدون مكتبات نماذج ثقيلة.
 * استخدم parse/safeParse عند إرسال النماذج (تسجيل، إعلان، بيع...).
 */
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'البريد مطلوب')
  .email('صيغة البريد غير صحيحة');

export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جدًا').max(80, 'الاسم طويل جدًا'),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  city: z.string().trim().max(60).optional().or(z.literal('')),
});

export const adDraftSchema = z.object({
  title: z.string().trim().min(3, 'العنوان قصير جدًا').max(120, 'العنوان طويل جدًا'),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  price: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'السعر غير صالح'),
  city: z.string().trim().max(60).optional().or(z.literal('')),
});

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message || 'تحقق من الحقول المدخلة';
}

/** safeParse مع رسالة عربية جاهزة للواجهة */
export function validate<T>(schema: z.ZodType<T>, data: unknown):
  | { ok: true; data: T }
  | { ok: false; message: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, message: firstZodError(result.error) };
}

export const adEditorSchema = z.object({
  title: z.string().trim().min(3, 'العنوان يجب ألا يقل عن 3 أحرف').max(120, 'العنوان طويل جدًا'),
  description: z.string().trim().min(10, 'الوصف يجب ألا يقل عن 10 أحرف').max(5000, 'الوصف طويل جدًا'),
  city: z.string().trim().min(2, 'أدخل مدينة صحيحة').max(60),
  price: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0),
      'السعر يجب أن يكون رقمًا موجبًا وبحد أقصى منزلتين عشريتين',
    ),
  categoryId: z.string().trim().optional().or(z.literal('')),
});

export const homeFilterSchema = z
  .object({
    city: z.string().trim().max(60).optional().or(z.literal('')),
    minPrice: z.string().trim().optional().or(z.literal('')),
    maxPrice: z.string().trim().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const min = data.minPrice ? Number(data.minPrice) : undefined;
    const max = data.maxPrice ? Number(data.maxPrice) : undefined;
    if (data.minPrice && (!Number.isFinite(min) || (min as number) < 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل أسعارًا رقمية صحيحة وغير سالبة.', path: ['minPrice'] });
    }
    if (data.maxPrice && (!Number.isFinite(max) || (max as number) < 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل أسعارًا رقمية صحيحة وغير سالبة.', path: ['maxPrice'] });
    }
    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأعلى.', path: ['minPrice'] });
    }
  });
