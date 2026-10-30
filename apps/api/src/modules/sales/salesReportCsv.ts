type SalesReportCsvRow = {
  invoiceNumber: string | null;
  soldAt: Date;
  buyerName: string;
  storeName: string | null;
  title: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  paid: number;
  due: number;
  refunded: number;
  status: string;
};

const headers = [
  'الفاتورة',
  'التاريخ',
  'العميل',
  'المتجر',
  'الوصف',
  'الكمية',
  'الإيراد',
  'التكلفة',
  'الربح',
  'المدفوع',
  'المتبقي',
  'المرتجع',
  'الحالة',
];

function escapeCsvCell(value: unknown): string {
  let cell = String(value ?? '');
  // Prevent CSV/Excel formula execution for user-controlled text fields.
  if (/^[=+@\t\r]/.test(cell) || (/^-/.test(cell) && !/^-\d+(?:\.\d+)?$/.test(cell))) {
    cell = `'${cell}`;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

function money(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

export function buildSalesReportCsv(rows: SalesReportCsvRow[]): string {
  const body = rows.map(row => [
    row.invoiceNumber,
    row.soldAt.toISOString(),
    row.buyerName,
    row.storeName,
    row.title,
    row.quantity,
    money(row.revenue),
    money(row.cost),
    money(row.profit),
    money(row.paid),
    money(row.due),
    money(row.refunded),
    row.status,
  ]);

  return `\uFEFF${[headers, ...body].map(row => row.map(escapeCsvCell).join(',')).join('\n')}`;
}
