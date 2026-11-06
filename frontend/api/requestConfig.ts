/** Optional transport controls shared by API read methods. */
export type ApiRequestConfig = {
  /** Cancels an in-flight read when its owning query is no longer needed. */
  signal?: AbortSignal;
};
