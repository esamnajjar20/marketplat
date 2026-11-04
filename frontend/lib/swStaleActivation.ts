/**
 * Deprecated compatibility shim.
 *
 * Previous versions automatically activated a waiting Service Worker after
 * five minutes / on visibility / popstate and could reload an active page.
 * Automatic activation is intentionally disabled: UpdatePrompt owns the only
 * supported activation path and requires an explicit user action.
 */
export function initStaleWaitingServiceWorkerHandler(): void {
  // Intentionally empty. A waiting worker remains available in UpdatePrompt.
}
