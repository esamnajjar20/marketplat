import { z } from 'zod';

/** Shared primitive validators used by API, web and mobile. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'البريد الإلكتروني مطلوب')
  .email('صيغة البريد غير صحيحة')
  .max(255, 'البريد الإلكتروني طويل جداً');

/** Optional nullable email used by customer/contact records (legacy API limit: 320). */
export const optionalNullableEmailSchema = z.string().email().max(320).optional().nullable();

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'الاسم يجب أن يتكون من حرفين على الأقل')
  .max(100, 'الاسم طويل جداً');

export const phoneE164Schema = z
  .string()
  .regex(/^\+?[0-9]{9,15}$/, 'رقم الهاتف غير صالح');

export const storePhoneSchema = z
  .string()
  .trim()
  .min(7, 'رقم الهاتف قصير جداً')
  .max(20, 'رقم الهاتف طويل جداً');

export const latitudeSchema = z.coerce.number().finite().min(-90).max(90);
export const longitudeSchema = z.coerce.number().finite().min(-180).max(180);
export const latitudeNumberSchema = z.number().finite().min(-90).max(90);
export const longitudeNumberSchema = z.number().finite().min(-180).max(180);
export const contactPhoneSchema = z.string().min(6, 'contactPhone is required').max(30);

/** Money is represented as a number at the API boundary with at most 2 decimals. */
export const positiveMoneySchema = z.coerce.number().finite().positive().multipleOf(0.01);
export const nonNegativeMoneySchema = z.coerce.number().finite().nonnegative().multipleOf(0.01);

/**
 * Query coercion shared by all list endpoints. Undefined remains undefined;
 * malformed values become NaN and are rejected by the supplied Zod number.
 */
export const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

/**
 * Parse explicit boolean representations without JavaScript truthiness.
 * Unknown values are passed through so the downstream Zod boolean rejects them.
 */
export function parseBooleanInput(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
}

/** Multipart/form-data booleans must not use Boolean(value): Boolean('false') is true. */
export const parseFormBoolean = parseBooleanInput;

/** Query booleans accept explicit true/false and 1/0 spellings; unknown values are rejected. */
export function parseQueryBooleanInput(value: unknown): unknown {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}

export const queryBooleanSchema = z.preprocess(parseQueryBooleanInput, z.boolean());
export const optionalQueryBooleanSchema = queryBooleanSchema.optional();

/** Convert empty multipart text fields to undefined before validating optional values. */
export function emptyStringToUndefined(value: unknown): unknown {
  return value === '' || value === null || value === undefined ? undefined : value;
}

export const optionalCitySchema = z.string().trim().max(100).optional();
export const nonEmptyIdSchema = z.string().trim().min(1);
