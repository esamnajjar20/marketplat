import type { ApiSuccessEnvelope, PaginationMeta } from '@marketplat/contracts';

/** All mobile API functions receive a successful envelope; apiRequest throws for HTTP errors. */
export type ApiEnvelope<T = unknown> = ApiSuccessEnvelope<T>;
export type Envelope<T = unknown> = ApiEnvelope<T>;
export type ApiPaginationMeta = PaginationMeta;
