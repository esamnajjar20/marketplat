export type SaleEntityType = 'PRODUCT' | 'AD' | 'SERVICE' | 'FREE';
export type SalePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE';
export type SaleTransferMethod = 'CASH' | 'JAWWAL_PAY' | 'BANK_PALESTINE' | 'PALPAY' | 'CARD' | 'OTHER';

export interface SaleCustomer {
  id: string;
  sellerId: string;
  name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  totalSpent: string;
  totalDue: string;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  isVip: boolean;
}

export interface SalePayment {
  id: string;
  amount: string;
  method: SaleTransferMethod;
  transferRef: string | null;
  paidAt: string;
  note: string | null;
}

export interface SaleReturnRecord {
  id: string;
  saleId: string;
  quantity: number;
  refundAmount: string;
  reason: 'DAMAGED' | 'WRONG_ITEM' | 'NOT_LIKED' | 'LATE' | 'OTHER';
  reasonNote: string | null;
  restockedToInventory: boolean;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  entityType: SaleEntityType;
  entityId: string | null;
  title: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  costPrice: string | null;
  lineTotal: string;
  returnedQuantity: number;
  stockMovementId?: string | null;
}

export interface SaleRecord {
  id: string;
  sellerId: string;
  storeId: string | null;
  entityType: SaleEntityType;
  entityId: string | null;
  entityTitle: string;
  entityImageUrl: string | null;
  quantity: number;
  unitPrice: string;
  costPrice: string | null;
  totalPrice: string;
  currency: string;
  invoiceNumber: string | null;
  customerId: string | null;
  buyerName: string;
  buyerPhone: string | null;
  paymentStatus: SalePaymentStatus;
  paidAmount: string;
  dueAmount: string;
  refundedAmount: string;
  dueDate: string | null;
  note: string | null;
  internalNote: string | null;
  soldAt: string;
  createdAt: string;
  updatedAt: string;
  customer?: SaleCustomer | null;
  items?: SaleItem[];
  payments?: SalePayment[];
  returns?: SaleReturnRecord[];
}

export interface SalesPage {
  items: SaleRecord[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
}

export interface SalesSummary {
  salesCount: number;
  quantity: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  totalPaid: number;
  totalRefunded: number;
  totalDue: number;
}

export interface CreateSalePayload {
  storeId?: string;
  entityType: SaleEntityType;
  entityId?: string;
  entityTitle: string;
  entityImageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  costPrice?: number | null;
  currency?: string;
  customerId?: string;
  buyerName: string;
  buyerPhone?: string | null;
  paymentStatus?: SalePaymentStatus;
  paidAmount: number;
  dueDate?: string | null;
  note?: string | null;
  internalNote?: string | null;
  soldAt?: string;
  serviceRequestId?: string;
  items?: Array<{ productId: string; quantity: number; unitPrice: number; discount?: number; costPrice?: number | null }>;
  payment?: { amount: number; method: SaleTransferMethod; transferRef?: string; note?: string };
  payments?: Array<{ amount: number; method: SaleTransferMethod; transferRef?: string; note?: string }>;
  installments?: Array<{ installmentNo: number; amount: number; dueDate: string; note?: string }>;
}


export interface SalesDashboard {
  summary: SalesSummary;
  compare: { period: string; current: SalesSummary; previous: SalesSummary; revenueChangePercentage: number | null };
  debt: { totalDue: number; overdueDue: number; dueToday: number; debtorCount: number };
  topProducts: Array<{ productId: string | null; title: string; quantity: number; revenue: number; profit: number }>;
  topCustomers: Array<{ customerId: string | null; buyerName: string; _sum: { totalPrice: unknown }; _count: { id: number } }>;
  lowStock: Array<{ id: string; name: string; stockQuantity: number | null; price: string; store: { id: string; name: string } | null }>;
}

export interface SalesReportRow {
  id: string; invoiceNumber: string | null; soldAt: string; buyerName: string; buyerPhone: string | null;
  storeName: string | null; title: string; quantity: number; revenue: number; cost: number; profit: number;
  paid: number; due: number; refunded: number; status: SalePaymentStatus; currency: string;
}
export interface SalesReport {
  rows: SalesReportRow[]; count: number;
  totals: { revenue: number; cost: number; profit: number; paid: number; due: number; refunded: number };
}

export type SalesSmartInsight = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  title: string;
  body: string;
  metric?: number;
  unit?: string;
};

export type SalesSmartInsights = {
  generatedAt: string;
  periodDays: number;
  kpis: {
    revenue: number;
    previousRevenue: number;
    revenueChange: number;
    orders: number;
    averageTicket: number;
    overdueAmount: number;
    lowStockProducts: number;
  };
  forecast: { next30DaysRevenue: number; method: string };
  topProducts: Array<{ title: string; revenue: number; cost: number; quantity: number; profit: number; margin: number }>;
  insights: SalesSmartInsight[];
};
