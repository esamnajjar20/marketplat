import { isDataIntegrityScanReport } from '../../src/modules/admin/data-integrity.types';

const validReport = {
  mode: 'read_only',
  scannedAt: '2026-11-02T00:00:00.000Z',
  durationMillis: 120,
  checkCount: 1,
  findingCount: 1,
  bySeverity: { critical: 1, warning: 0, info: 0 },
  checks: [{
    code: 'PRODUCT_NEGATIVE_STOCK',
    severity: 'critical',
    title: 'Negative stock',
    description: 'Read-only check',
    entityType: 'product',
    count: 1,
    samples: [{ id: 'product-1', stockQuantity: -1 }],
  }],
};

describe('isDataIntegrityScanReport', () => {
  it('accepts a complete read-only report with bounded samples', () => {
    expect(isDataIntegrityScanReport(validReport)).toBe(true);
  });

  it('rejects a report whose check count does not match its checks array', () => {
    expect(isDataIntegrityScanReport({ ...validReport, checkCount: 2 })).toBe(false);
  });

  it('rejects samples without a stable entity id', () => {
    const value = structuredClone(validReport);
    value.checks[0].samples = [{ stockQuantity: -1 }];
    expect(isDataIntegrityScanReport(value)).toBe(false);
  });

  it('rejects totals that do not match individual checks', () => {
    expect(isDataIntegrityScanReport({ ...validReport, findingCount: 0 })).toBe(false);
    expect(isDataIntegrityScanReport({ ...validReport, bySeverity: { critical: 0, warning: 1, info: 0 } })).toBe(false);
  });

  it('rejects duplicate check codes', () => {
    const value = {
      ...validReport,
      checkCount: 2,
      checks: [...validReport.checks, ...validReport.checks],
      findingCount: 2,
      bySeverity: { critical: 2, warning: 0, info: 0 },
    };
    expect(isDataIntegrityScanReport(value)).toBe(false);
  });

  it('rejects a report that claims to be a mutating scan', () => {
    expect(isDataIntegrityScanReport({ ...validReport, mode: 'repair' })).toBe(false);
  });
});
