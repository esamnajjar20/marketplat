import { buildSalesReportCsv } from '../../src/modules/sales/salesReportCsv';

describe('buildSalesReportCsv', () => {
  it('writes UTF-8 BOM, Arabic headers, and the seller report columns', () => {
    const csv = buildSalesReportCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('الفاتورة');
    expect(csv).toContain('المرتجع');
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('quotes user-controlled cells and neutralizes spreadsheet formulas', () => {
    const csv = buildSalesReportCsv([
      {
        invoiceNumber: 'INV-1',
        soldAt: new Date('2026-10-30T12:00:00.000Z'),
        buyerName: '=HYPERLINK("https://example.invalid")',
        storeName: 'متجر, تجريبي',
        title: 'منتج "مميز"',
        quantity: 2,
        revenue: 100,
        cost: 120,
        profit: -20,
        paid: 100,
        due: 0,
        refunded: 0,
        status: 'PAID',
      },
    ]);

    expect(csv).toContain(`'=HYPERLINK(""https://example.invalid"")`);
    expect(csv).toContain('"متجر, تجريبي"');
    expect(csv).toContain('"منتج ""مميز"""');
    expect(csv).toContain('"-20.00"');
  });
});
