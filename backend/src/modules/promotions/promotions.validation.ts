import { z } from 'zod';
import { DiscountType } from '@prisma/client';

export const createPromotionSchema = z.object({
  body: z
    .object({
      productId: z.string().min(1, 'productId is required'),
      title: z.string().min(2, 'Title must be at least 2 characters').max(200),
      description: z.string().max(500).optional(),
      discountType: z.nativeEnum(DiscountType),
      discountValue: z.coerce
        .number()
        .positive('discountValue must be a positive number')
        .multipleOf(0.01, 'discountValue cannot have more than 2 decimal places'),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      maxUses: z.coerce.number().int().positive().optional(),
    })
    .refine(data => data.endsAt > data.startsAt, {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    })
    // PROMO-1: a percentage above 100 is nonsensical (a "120% off"
    // coupon), same reasoning as products.validation.ts's discountPrice
    // < price check — catch it at the edge rather than let it produce
    // a negative effectivePrice downstream in promotions.service.ts's
    // computeEffectivePrice.
    .refine(
      data => data.discountType !== 'PERCENTAGE' || data.discountValue <= 100,
      {
        message: 'A percentage discount cannot exceed 100',
        path: ['discountValue'],
      }
    ),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>['body'];

export const updatePromotionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().min(2).max(200).optional(),
      description: z.string().max(500).nullable().optional(),
      discountType: z.nativeEnum(DiscountType).optional(),
      discountValue: z.coerce.number().positive().multipleOf(0.01).optional(),
      startsAt: z.coerce.date().optional(),
      endsAt: z.coerce.date().optional(),
      maxUses: z.coerce.number().int().positive().nullable().optional(),
      // CANCELLED is the only status a caller may set directly — DRAFT/
      // SCHEDULED/ACTIVE/EXPIRED are all driven by startsAt/endsAt and
      // assigned by the service layer (see promotions.service.ts's
      // resolveStatus), never chosen freely by the client.
      status: z.literal('CANCELLED').optional(),
    })
    .refine(
      data =>
        data.startsAt === undefined ||
        data.endsAt === undefined ||
        data.endsAt > data.startsAt,
      { message: 'endsAt must be after startsAt', path: ['endsAt'] }
    )
    .refine(
      data => data.discountType !== 'PERCENTAGE' || data.discountValue === undefined || data.discountValue <= 100,
      { message: 'A percentage discount cannot exceed 100', path: ['discountValue'] }
    ),
});

export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>['body'];

export const promotionIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Promotion ID is required') }),
});

export const getPromotionsSchema = z.object({
  query: z.object({
    storeId: z.string().optional(),
    productId: z.string().optional(),
  }),
});

export type GetPromotionsQuery = z.infer<typeof getPromotionsSchema>['query'];
