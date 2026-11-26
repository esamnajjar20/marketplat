import { z } from 'zod';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';

const parseJsonArray = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const directImagePublicIdSchema = z.string().regex(
  /^classifieds\/(?:ads|products|service-listings|requests)\/mp_[a-f0-9]{24}_[a-f0-9]{32}$/
);

export const directImagePublicIdsSchema = z.preprocess(
  parseJsonArray,
  z.array(directImagePublicIdSchema).max(MAX_IMAGES_PER_ENTITY).optional()
);

export const directImageIntentSchema = z.object({
  purpose: z.enum(['ads', 'products', 'service-listings', 'requests']),
  count: z.number().int().min(1).max(MAX_IMAGES_PER_ENTITY),
}).refine(input => input.purpose !== 'requests' || input.count <= 5, {
  message: 'Request attachments are limited to 5 images.',
  path: ['count'],
});

export const directImageVerifySchema = z.object({
  purpose: z.enum(['ads', 'products', 'service-listings', 'requests']),
  publicIds: z.array(directImagePublicIdSchema).min(1).max(MAX_IMAGES_PER_ENTITY),
});
