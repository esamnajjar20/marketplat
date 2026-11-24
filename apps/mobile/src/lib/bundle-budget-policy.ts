export type MobileBundleMetrics = {
  mainBundleBytes: number;
  exportedPayloadBytes: number;
};

export type MobileBundleBudget = {
  maxMainBundleBytes: number;
  maxExportedPayloadBytes: number;
  warningRatio?: number;
};

export type MobileBundleBudgetResult = {
  warnings: string[];
  errors: string[];
};

/** Enforce absolute Android export budgets; values are not a measured baseline. */
export function evaluateMobileBundleBudget(
  metrics: MobileBundleMetrics,
  budget: MobileBundleBudget,
): MobileBundleBudgetResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const warningRatio = budget.warningRatio ?? 0.85;
  if (!Number.isFinite(warningRatio) || warningRatio <= 0 || warningRatio > 1) {
    errors.push(`Invalid bundle warning ratio (${warningRatio}); expected a value greater than 0 and at most 1.`);
  }

  const checks = [
    {
      label: 'Main JS bundle',
      actual: metrics.mainBundleBytes,
      maximum: budget.maxMainBundleBytes,
    },
    {
      label: 'Exported app payload (excluding source maps)',
      actual: metrics.exportedPayloadBytes,
      maximum: budget.maxExportedPayloadBytes,
    },
  ];

  for (const check of checks) {
    if (!Number.isFinite(check.actual) || check.actual < 0) {
      errors.push(`${check.label}: invalid measured size (${check.actual}).`);
      continue;
    }
    if (!Number.isFinite(check.maximum) || check.maximum <= 0) {
      errors.push(`${check.label}: invalid configured budget (${check.maximum}).`);
      continue;
    }

    if (check.actual > check.maximum) {
      errors.push(`${check.label}: ${check.actual} bytes exceeds the ${check.maximum}-byte budget.`);
    } else if (check.actual >= check.maximum * warningRatio) {
      warnings.push(`${check.label}: ${check.actual} bytes has reached at least ${(warningRatio * 100).toFixed(0)}% of its ${check.maximum}-byte budget.`);
    }
  }

  return { warnings, errors };
}
