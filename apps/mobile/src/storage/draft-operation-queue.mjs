const tails = new Map();

/** Serialize asynchronous draft mutations per account while allowing other accounts to proceed. */
export function runSerializedByKey(key, operation) {
  if (typeof key !== 'string' || !key.trim()) return Promise.reject(new Error('A queue key is required.'));
  if (typeof operation !== 'function') return Promise.reject(new Error('A queued operation is required.'));
  const previous = tails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tail = current.then(() => undefined, () => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return current;
}
