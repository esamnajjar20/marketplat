/**
 * Shared cancellation registry for background offline-warming requests.
 *
 * Keeping this tiny registry separate avoids a circular dependency between
 * the route-shell warming controller and user-data warming.
 */
const activeWarmingControllers = new Set<AbortController>();

export function registerWarmingController(controller: AbortController): () => void {
  activeWarmingControllers.add(controller);
  return () => activeWarmingControllers.delete(controller);
}

/** Abort only background warming work; foreground API requests are untouched. */
export function abortActiveWarmingRequests(): void {
  for (const controller of activeWarmingControllers) {
    controller.abort();
  }
  activeWarmingControllers.clear();
}
