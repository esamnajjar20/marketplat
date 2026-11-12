/** Resolve after `ms` milliseconds. Shared replacement for per-file copies. */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, ms));
