/** Small, deterministic helpers for browser-local monitoring samples. */
export function percentile(values: readonly number[], p: number): number | null {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const bounded = Math.min(100, Math.max(0, p));
  const index = Math.max(0, Math.ceil((bounded / 100) * finite.length) - 1);
  return finite[index] ?? null;
}

export function summarizeDurations(values: readonly number[]) {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (finite.length === 0) return { count: 0, average: null, p50: null, p95: null, p99: null };
  const average = Math.round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
  return {
    count: finite.length,
    average,
    p50: percentile(finite, 50),
    p95: percentile(finite, 95),
    p99: percentile(finite, 99),
  };
}
