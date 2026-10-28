/**
 * Tracks in-flight Axios requests that belong to the current browser session.
 * Session cleanup aborts them synchronously before local caches are cleared.
 */
const activeSessionRequests = new Set<AbortController>();

export function registerSessionRequest(controller: AbortController): () => void {
  activeSessionRequests.add(controller);
  return () => activeSessionRequests.delete(controller);
}

export function abortSessionRequests(): void {
  for (const controller of activeSessionRequests) controller.abort();
  activeSessionRequests.clear();
}
