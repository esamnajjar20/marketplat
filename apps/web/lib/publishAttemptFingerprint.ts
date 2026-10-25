/**
 * Builds an in-memory fingerprint for one create-form submission.
 * Re-submitting the same payload (including the same File objects) keeps
 * the same offline operation id, so a lost response can be replayed safely
 * against the backend's X-Offline-Op-Id idempotency contract. Editing any
 * field or selecting a different File starts a new operation instead.
 * File contents are intentionally not read or hashed on the main thread.
 */
const fileIdentity = new WeakMap<object, number>();
let nextFileIdentity = 1;

function getFileIdentity(file: object): number {
  const existing = fileIdentity.get(file);
  if (existing !== undefined) return existing;
  const identity = nextFileIdentity++;
  fileIdentity.set(file, identity);
  return identity;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return Object.keys(objectValue).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue(objectValue[key]);
      return result;
    }, {});
  }
  return value;
}

export function publishAttemptFingerprint(payload: Record<string, unknown>): string {
  const { images, ...fields } = payload;
  const imageIdentities = Array.isArray(images)
    ? images.map((file) => file && typeof file === 'object' ? getFileIdentity(file) : String(file))
    : [];
  return JSON.stringify({ fields: stableValue(fields), imageIdentities });
}
