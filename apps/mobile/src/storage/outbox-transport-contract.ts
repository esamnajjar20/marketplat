/** Typed application façade for the pure request contract in outbox-transport-contract.mjs. */
import { toOutboxCreateAdRequest as buildRequest } from './outbox-transport-contract.mjs';
import type { OutboxItem } from './mutation-outbox';
import type { OutboxCreateAdRequest } from './outbox-transport-contract.mjs';

export type { OutboxCreateAdRequest, OutboxLocalImage } from './outbox-transport-contract.mjs';

export function toOutboxCreateAdRequest(item: OutboxItem): OutboxCreateAdRequest {
  return buildRequest(item);
}
