/**
 * Per-entity FIFO for non-idempotent toggle endpoints.
 *
 * Concurrent toggle requests for the same entity can otherwise arrive out of
 * order and leave the server in a state that disagrees with the user's clicks.
 * Different entities remain independent. A rejected operation never blocks the
 * next queued operation.
 */
const pendingByKey = new Map<string, Promise<unknown>>();

export function runSerializedMutation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = pendingByKey.get(key);
  const current = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(operation);

  pendingByKey.set(key, current);

  const cleanup = () => {
    if (pendingByKey.get(key) === current) pendingByKey.delete(key);
  };
  void current.then(cleanup, cleanup);

  return current;
}
