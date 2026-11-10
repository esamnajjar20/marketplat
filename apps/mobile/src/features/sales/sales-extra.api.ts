import { apiRequest } from '@/api/client';
import type { SaleRecord } from './sales.api';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean } } };
function unwrap<T>(r: Envelope<T>, fallback: string): T {
  if (r?.success !== true || r.data === undefined) throw new Error(r?.message || fallback);
  return r.data;
}
export type DebtSummary = { totalDue: number; overdueDue: number; dueToday: number; debtorCount: number };
export type DebtPage = { rows: SaleRecord[]; totalCount: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
export type InstallmentRow = { id: string; installmentNo: number; amount: number | string; paidAmount: number | string; dueDate: string; status: string; sale: SaleRecord & { customer?: { name?: string; phone?: string | null } | null } };
export type CustomerRow = { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; note?: string | null; tags?: string[]; isVip?: boolean; isBlacklisted?: boolean; totalSpent?: number | string; totalDue?: number | string; purchaseCount?: number; lastPurchaseAt?: string | null };
export type CustomerSummary = { totalCustomers: number; vipCustomers: number; debtors: number; inactiveCustomers: number; totalSpent: number; averageCustomerSpend: number };
export type ActivityRow = { id: string; type: string; title: string; description?: string | null; entityType?: string | null; entityId?: string | null; createdAt: string };
export async function fetchSaleDetail(id: string, token: string, ownerId?: string | null): Promise<SaleRecord & Record<string, unknown>> { return unwrap(await apiRequest<Envelope<SaleRecord & Record<string, unknown>>>(`/api/v1/sales/${encodeURIComponent(id)}`, { token, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل تفاصيل البيع.'); }
export async function fetchSaleReceipt(id: string, token: string, ownerId?: string | null): Promise<{ invoiceNumber?: string | null; sale: SaleRecord & Record<string, unknown> }> { return unwrap(await apiRequest<Envelope<{ invoiceNumber?: string | null; sale: SaleRecord & Record<string, unknown> }>>(`/api/v1/sales/${encodeURIComponent(id)}/receipt`, { token, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل الفاتورة.'); }
export async function fetchDebtSummary(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<DebtSummary> { return unwrap(await apiRequest<Envelope<DebtSummary>>('/api/v1/sales/debts/summary', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل ملخص الديون.'); }
export async function fetchDebts(page: number, token: string, signal?: AbortSignal, ownerId?: string | null): Promise<DebtPage> { const data = unwrap(await apiRequest<Envelope<DebtPage>>(`/api/v1/sales/debts?page=${page}&limit=20`, { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل الديون.'); if (!data || !Array.isArray(data.rows)) throw new Error('استجابة الديون غير صالحة.'); return data; }
export async function fetchInstallments(kind: 'upcoming' | 'overdue', token: string, ownerId?: string | null, signal?: AbortSignal): Promise<InstallmentRow[]> { const data = unwrap(await apiRequest<Envelope<InstallmentRow[]>>(`/api/v1/sales/installments/${kind}`, { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل الأقساط.'); if (!Array.isArray(data)) throw new Error('استجابة الأقساط غير صالحة.'); return data; }
export async function payInstallment(id: string, amount: number, token: string, csrfToken?: string | null, offlineOperationId?: string, ownerId?: string | null): Promise<unknown> { return unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/sales/installments/${encodeURIComponent(id)}/pay`, { method: 'POST', token, cacheOwnerId: ownerId ?? undefined, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({ amount, ...(offlineOperationId ? { offlineOperationId } : {}) }) }), 'تعذر تسجيل دفعة القسط.'); }
export async function fetchCustomers(token: string, q = '', page = 1, signal?: AbortSignal, ownerId?: string | null): Promise<{ items: CustomerRow[]; meta: { total: number; page: number; totalPages: number; hasNextPage: boolean } }> { const p = new URLSearchParams({ page: String(page), limit: '20' }); if (q.trim()) p.set('q', q.trim()); const data = unwrap(await apiRequest<Envelope<{ items: CustomerRow[]; meta: { total: number; page: number; totalPages: number; hasNextPage: boolean } }>>(`/api/v1/customers?${p}`, { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل العملاء.'); if (!data || !Array.isArray(data.items)) throw new Error('استجابة العملاء غير صالحة.'); return data; }
export async function fetchCustomerSummary(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<CustomerSummary> { return unwrap(await apiRequest<Envelope<CustomerSummary>>('/api/v1/customers/summary', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل ملخص العملاء.'); }
export async function createCustomer(input: { name: string; phone?: string; email?: string; address?: string; note?: string }, token: string, csrfToken?: string | null, ownerId?: string | null): Promise<CustomerRow> { return unwrap(await apiRequest<Envelope<CustomerRow>>('/api/v1/customers', { method: 'POST', token, cacheOwnerId: ownerId ?? undefined, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر إضافة العميل.'); }
export async function fetchMyActivity(token: string, group = 'ALL', q = '', page = 1): Promise<{ items: ActivityRow[]; meta: { total: number; page: number; totalPages: number; hasNextPage: boolean } }> { const p = new URLSearchParams({ page: String(page), limit: '20', group }); if (q.trim()) p.set('q', q.trim()); const r = await apiRequest<Envelope<ActivityRow[]>>(`/api/v1/activity?${p}`, { token }); if (r?.success !== true || !Array.isArray(r.data)) throw new Error(r?.message || 'تعذر تحميل سجل النشاط.'); const meta = r.meta?.pagination; return { items: r.data, meta: { total: Number(meta?.total ?? r.data.length), page: Number(meta?.page ?? page), totalPages: Number(meta?.totalPages ?? 1), hasNextPage: Boolean(meta?.hasNextPage) } }; }

export type SalesCostSettings = { enabled: boolean };
export type SalesCostProduct = { id: string; storeId: string; name: string; price: string | number; costPrice: string | number | null; stockQuantity: number | null; availability: string; images: string[]; store: { id: string; name: string } };
export async function fetchSalesCostSettings(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<SalesCostSettings> { return unwrap(await apiRequest<Envelope<SalesCostSettings>>('/api/v1/sales/cost-settings', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل إعدادات التكلفة.'); }
export async function updateSalesCostSettings(enabled: boolean, token: string, csrfToken?: string | null, ownerId?: string | null): Promise<SalesCostSettings> { return unwrap(await apiRequest<Envelope<SalesCostSettings>>('/api/v1/sales/cost-settings', { method: 'PATCH', token, cacheOwnerId: ownerId ?? undefined, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({ enabled }) }), 'تعذر تحديث إعدادات التكلفة.'); }
export async function fetchSalesCostProducts(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<SalesCostProduct[]> { const data = unwrap(await apiRequest<Envelope<SalesCostProduct[]>>('/api/v1/sales/cost-products', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل تكاليف المنتجات.'); if (!Array.isArray(data)) throw new Error('استجابة تكاليف المنتجات غير صالحة.'); return data; }
export async function updateSalesProductCost(productId: string, costPrice: number | null, token: string, csrfToken?: string | null, ownerId?: string | null): Promise<unknown> { return unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/sales/cost-products/${encodeURIComponent(productId)}`, { method: 'PATCH', token, cacheOwnerId: ownerId ?? undefined, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({ costPrice }) }), 'تعذر حفظ تكلفة المنتج.'); }

export type SalesDashboardData = {
  summary: { salesCount: number; quantity: number; totalRevenue: number; totalCost: number; netProfit: number; totalPaid: number; totalRefunded: number; totalDue: number };
  compare: { period: string; current: { totalRevenue: number }; previous: { totalRevenue: number }; revenueChangePercentage: number | null };
  debt: { totalDue: number; overdueDue: number; dueToday: number; debtorCount: number };
  topProducts: Array<{ productId: string | null; title: string; quantity: number; revenue: number; profit: number }>;
  topCustomers: Array<{ customerId: string | null; buyerName: string; _sum: { totalPrice: unknown }; _count: { id: number } }>;
  lowStock: Array<{ id: string; name: string; stockQuantity: number | null; price: string; store: { id: string; name: string } | null }>;
};
export type SalesReportData = {
  rows: Array<{ id: string; invoiceNumber: string | null; soldAt: string; buyerName: string; title: string; quantity: number; revenue: number; cost: number; profit: number; paid: number; due: number; refunded: number; status: SalePaymentStatus; currency: string }>;
  count: number; totalCount?: number; hasMore?: boolean;
  totals: { revenue: number; cost: number; profit: number; paid: number; due: number; refunded: number };
};
export type SalesSmartInsightsData = {
  generatedAt: string; periodDays: number;
  kpis: { revenue: number; previousRevenue: number; revenueChange: number; orders: number; averageTicket: number; overdueAmount: number; lowStockProducts: number };
  forecast: { next30DaysRevenue: number; method: string };
  topProducts: Array<{ title: string; revenue: number; cost: number; quantity: number; profit: number; margin: number }>;
  insights: Array<{ id: string; severity: 'info' | 'warning' | 'critical'; category: string; title: string; body: string; metric: number; unit: string }>;
};
export async function fetchSalesDashboard(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<SalesDashboardData> {
  return unwrap(await apiRequest<Envelope<SalesDashboardData>>('/api/v1/sales/dashboard', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل لوحة المبيعات.');
}
export async function fetchSalesReport(token: string, filters: { from?: string; to?: string; status?: SalePaymentStatus; limit?: number } = {}, signal?: AbortSignal, ownerId?: string | null): Promise<SalesReportData> {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(filters.limit ?? 100, 1), 100)) });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.status) params.set('status', filters.status);
  return unwrap(await apiRequest<Envelope<SalesReportData>>(`/api/v1/sales/reports?${params}`, { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل تقرير المبيعات.');
}
export async function fetchSalesSmartInsights(token: string, signal?: AbortSignal, ownerId?: string | null): Promise<SalesSmartInsightsData> {
  return unwrap(await apiRequest<Envelope<SalesSmartInsightsData>>('/api/v1/sales/smart-insights', { token, signal, cacheOwnerId: ownerId ?? undefined }), 'تعذر تحميل التحليلات الذكية.');
}
