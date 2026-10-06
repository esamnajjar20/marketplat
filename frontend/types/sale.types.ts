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
  payments?: SalePayment[];
  returns?: unknown[];
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
  payment?: { amount: number; method: SaleTransferMethod; transferRef?: string; note?: string };
}
