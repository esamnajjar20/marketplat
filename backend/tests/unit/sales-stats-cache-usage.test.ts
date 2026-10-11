import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('sales stats cache architecture', () => {
  const salesServiceSource = readFileSync(join(__dirname, '../../src/modules/sales/sales.service.ts'), 'utf8');
  const publicStatsSource = readFileSync(join(__dirname, '../../src/modules/sales/public-stats.controller.ts'), 'utf8');

  it('does not write a cache that has no application read path', () => {
    expect(salesServiceSource).not.toContain('salesStatsCache');
    expect(salesServiceSource).not.toContain('refreshSalesStatsCache');
    expect(publicStatsSource).toContain('saleRecord.aggregate');
  });
});
