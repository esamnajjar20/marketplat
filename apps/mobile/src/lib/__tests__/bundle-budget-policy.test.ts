import { describe, expect, it } from 'vitest';
import { evaluateMobileBundleBudget } from '../bundle-budget-policy';

const budget = {
  maxMainBundleBytes: 8 * 1024 * 1024,
  maxExportedPayloadBytes: 60 * 1024 * 1024,
  warningRatio: 0.85,
};

describe('mobile bundle budget policy', () => {
  it('passes measurements below the warning thresholds', () => {
    expect(evaluateMobileBundleBudget({
      mainBundleBytes: 4 * 1024 * 1024,
      exportedPayloadBytes: 30 * 1024 * 1024,
    }, budget)).toEqual({ warnings: [], errors: [] });
  });

  it('warns when a measurement reaches 85% of its budget', () => {
    const result = evaluateMobileBundleBudget({
      mainBundleBytes: 7 * 1024 * 1024,
      exportedPayloadBytes: 30 * 1024 * 1024,
    }, budget);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Main JS bundle');
  });

  it('fails when either absolute budget is exceeded', () => {
    const result = evaluateMobileBundleBudget({
      mainBundleBytes: 9 * 1024 * 1024,
      exportedPayloadBytes: 61 * 1024 * 1024,
    }, budget);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects an invalid warning ratio', () => {
    const result = evaluateMobileBundleBudget({
      mainBundleBytes: 10,
      exportedPayloadBytes: 10,
    }, { ...budget, warningRatio: 1.5 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('warning ratio');
  });

  it('rejects invalid measurements and budgets', () => {
    const result = evaluateMobileBundleBudget({
      mainBundleBytes: Number.NaN,
      exportedPayloadBytes: 10,
    }, { ...budget, maxExportedPayloadBytes: 0 });
    expect(result.errors).toHaveLength(2);
  });
});
