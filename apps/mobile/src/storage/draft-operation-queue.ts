/**
 * تسلسل عمليات المسودات لكل مفتاح (حساب) — TypeScript نقي (بدل .mjs).
 */
const tails = new Map<string, Promise<void>>();

/** Serialize asynchronous draft mutations per account while allowing other accounts to proceed. */
export function runSerializedByKey<T>(key: string, operation: () => Promise<T> | T): Promise<T> {
  if (typeof key !== 'string' || !key.trim()) {
    return Promise.reject(new Error('A queue key is required.'));
  }
  if (typeof operation !== 'function') {
    return Promise.reject(new Error('A queued operation is required.'));
  }
  const previous = tails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tail: Promise<void> = current.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return current;
}
