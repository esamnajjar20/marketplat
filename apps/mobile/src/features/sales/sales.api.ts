import { apiRequest } from '@/api/client';

export type SalePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE';
export type SalesPeriod = 'day' | 'week' | 'month' | 'year';
export type SaleItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
  returnedQuantity?: number;
  imageUrl?: string | null;
};
export type SaleRecord = {
  id: string;
  entityType: 'PRODUCT' | 'AD' | 'SERVICE' | 'FREE';
  entityTitle: string;
  entityImageUrl?: string | null;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  currency: string;
  invoiceNumber?: string | null;
  buyerName: string;
  buyerPhone?: string | null;
  paymentStatus: SalePaymentStatus;
  paidAmount: number | string;
  dueAmount: number | string;
  refundedAmount: number | string;
  soldAt: string;
  dueDate?: string | null;
  note?: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  store?: { id: string; name: string; slug?: string; logoUrl?: string | null } | null;
  items?: SaleItem[];
};
export type SalesSummary = {
  salesCount: number;
  quantity: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  totalPaid: number;
  totalRefunded: number;
  totalDue: number;
};
export type SalesPage = {
  items: SaleRecord[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
};
type Envelope<T> = { success: boolean; message?: string; data?: T };
function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (response?.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
export async function fetchSales(token: string, page = 1, status?: SalePaymentStatus): Promise<SalesPage> {
  const params = new URLSearchParams({ page: String(page), limit: '15' });
  if (status) params.set('status', status);
  const data = unwrap(await apiRequest<Envelope<SalesPage>>(`/api/v1/sales?${params}`, { token }), 'تعذر تحميل المبيعات.');
  if (!Array.isArray(data.items) || !data.meta) throw new Error('استجابة المبيعات غير صالحة.');
  return data;
}
export async function fetchSalesSummary(period: SalesPeriod, token: string): Promise<SalesSummary> {
  return unwrap(await apiRequest<Envelope<SalesSummary>>(`/api/v1/sales/summary?period=${period}`, { token }), 'تعذر تحميل ملخص المبيعات.');
}
