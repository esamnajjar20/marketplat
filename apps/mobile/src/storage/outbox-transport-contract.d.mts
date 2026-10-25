export type OutboxLocalImage = { uri: string; name: string; type: string };
export type OutboxCreateAdRequest = {
  method: 'POST';
  path: '/api/v1/ads';
  headers: { 'X-Offline-Op-Id': string };
  body: Record<string, unknown>;
  images: OutboxLocalImage[];
};
export function toOutboxCreateAdRequest(item: {
  operation: string;
  idempotencyKey: string;
  payloadJson: string;
}): OutboxCreateAdRequest;
