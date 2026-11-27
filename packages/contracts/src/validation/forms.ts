import { z } from 'zod';
import { loginCredentialsSchema, registerFormSchema } from './auth';

export const loginFormSchema = loginCredentialsSchema;
export { registerFormSchema };

export const adDraftSchema = z.object({
  title: z.string().trim().min(3, 'العنوان قصير جدًا').max(200, 'العنوان طويل جدًا'),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  price: z.string().trim().optional().or(z.literal('')).refine(
    value => !value || (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0),
    'السعر غير صالح',
  ),
  city: z.string().trim().max(100).optional().or(z.literal('')),
});

export const adEditorSchema = z.object({
  title: z.string().trim().min(3, 'العنوان يجب ألا يقل عن 3 أحرف').max(200, 'العنوان طويل جدًا'),
  description: z.string().trim().min(10, 'الوصف يجب ألا يقل عن 10 أحرف').max(5000, 'الوصف طويل جدًا'),
  city: z.string().trim().min(2, 'أدخل مدينة صحيحة').max(100),
  price: z.string().trim().optional().or(z.literal('')).refine(
    value => !value || (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0),
    'السعر يجب أن يكون رقماً موجباً وبحد أقصى منزلتين عشريتين',
  ),
  categoryId: z.string().trim().optional().or(z.literal('')),
});



/** Static fields for the ad composer; file/image handling remains in the UI. */
export const adComposerFieldsSchema = z.object({
  title: z.string()
    .refine(value => value.trim().length > 0, 'عنوان الإعلان مطلوب')
    .refine(value => value.length >= 5, 'العنوان قصير جداً (5 أحرف على الأقل)'),
  description: z.string()
    .refine(value => value.trim().length > 0, 'وصف الإعلان مطلوب')
    .refine(value => value.length >= 20, 'الوصف قصير جداً (20 حرفاً على الأقل)'),
  city: z.string().refine(value => Boolean(value), 'المدينة مطلوبة'),
});

/** Static product form validation. Dynamic store-type attributes and image files stay local. */
export const productComposerFieldsSchema = z.object({
  categoryId: z.string().refine(value => Boolean(value.trim()), 'اختر فئة المنتج'),
  name: z.string().refine(value => value.trim().length >= 2, 'اسم المنتج قصير جداً'),
  description: z.string().refine(value => value.trim().length >= 10, 'الوصف قصير جداً (10 أحرف على الأقل)'),
  price: z.string().refine(value => {
    const amount = Number(value);
    return value.trim().length > 0 && Number.isFinite(amount) && amount > 0;
  }, 'أدخل سعراً صحيحاً'),
  discountPrice: z.string(),
  wholesalePrice: z.string(),
  wholesaleMinQty: z.string(),
}).superRefine((value, context) => {
  if (value.discountPrice.trim()) {
    const discount = Number(value.discountPrice);
    const price = Number(value.price);
    if (!Number.isFinite(discount) || discount <= 0 || !Number.isFinite(price) || discount >= price) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'يجب أن يكون سعر الخصم أقل من السعر الأصلي', path: ['discountPrice'] });
    }
  }
  const hasWholesalePrice = value.wholesalePrice.trim().length > 0;
  const hasWholesaleMinQty = value.wholesaleMinQty.trim().length > 0;
  if (hasWholesalePrice !== hasWholesaleMinQty) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل سعر الجملة والحد الأدنى للكمية معاً', path: ['wholesalePrice'] });
  } else if (hasWholesalePrice) {
    const wholesalePrice = Number(value.wholesalePrice);
    const minQty = Number(value.wholesaleMinQty);
    if (!Number.isFinite(wholesalePrice) || wholesalePrice <= 0 || !Number.isInteger(minQty) || minQty <= 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'سعر الجملة والحد الأدنى للكمية غير صالحين', path: ['wholesalePrice'] });
    }
  }
});

/** Static service-listing fields; service-type-dependent attributes/images remain domain-specific. */
export const serviceListingComposerFieldsSchema = z.object({
  serviceTypeId: z.string().refine(value => Boolean(value), 'اختر مجال الخدمة'),
  categoryId: z.string().refine(value => Boolean(value), 'اختر تخصص الخدمة'),
  title: z.string().refine(value => value.trim().length >= 3, 'العنوان قصير جداً (3 أحرف على الأقل)'),
  description: z.string().refine(value => value.trim().length >= 10, 'الوصف قصير جداً (10 أحرف على الأقل)'),
  pricingType: z.enum(['FIXED', 'STARTING_FROM', 'NEGOTIABLE']),
  price: z.string(),
}).superRefine((value, context) => {
  if (value.pricingType !== 'NEGOTIABLE') {
    const price = Number(value.price);
    if (!value.price.trim() || !Number.isFinite(price) || price <= 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل سعراً صحيحاً', path: ['price'] });
    }
  }
});

export const homeFilterSchema = z.object({
  city: z.string().trim().max(100).optional().or(z.literal('')),
  minPrice: z.string().trim().optional().or(z.literal('')),
  maxPrice: z.string().trim().optional().or(z.literal('')),
}).superRefine((data, context) => {
  const min = data.minPrice ? Number(data.minPrice) : undefined;
  const max = data.maxPrice ? Number(data.maxPrice) : undefined;

  if (data.minPrice && (!Number.isFinite(min) || (min as number) < 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل سعراً أدنى رقمياً صحيحاً وغير سالب.', path: ['minPrice'] });
  }
  if (data.maxPrice && (!Number.isFinite(max) || (max as number) < 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل سعراً أعلى رقمياً صحيحاً وغير سالب.', path: ['maxPrice'] });
  }
  if (min !== undefined && max !== undefined && Number.isFinite(min) && Number.isFinite(max) && min > max) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأعلى.', path: ['minPrice'] });
  }
});

export const requestFieldsSchema = z.object({
  categoryId: z.string().trim().min(1, 'اختر تصنيفاً للطلب.'),
  title: z.string().trim().min(5, 'العنوان يجب أن يكون 5 أحرف على الأقل.').max(150, 'العنوان طويل جداً.'),
  description: z.string().trim().min(10, 'التفاصيل يجب أن تكون 10 أحرف على الأقل.').max(1000, 'التفاصيل طويلة جداً.'),
});

export const createRequestFormSchema = requestFieldsSchema;
export type RequestFormFieldId = 'req-cat' | 'req-title' | 'req-desc';

export function getFirstInvalidRequestField(values: {
  categoryId: string;
  title: string;
  description: string;
}): RequestFormFieldId | null {
  const result = createRequestFormSchema.safeParse(values);
  if (result.success) return null;
  const firstPath = result.error.issues[0]?.path[0];
  if (firstPath === 'categoryId') return 'req-cat';
  if (firstPath === 'title') return 'req-title';
  if (firstPath === 'description') return 'req-desc';
  return null;
}

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message || 'تحقق من الحقول المدخلة';
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };
export function validate<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  return result.success ? { ok: true, data: result.data } : { ok: false, message: firstZodError(result.error) };
}

