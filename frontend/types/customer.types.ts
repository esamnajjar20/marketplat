export interface Customer {
  id: string;
  sellerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  tags: string[];
  totalSpent: string;
  totalDue: string;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  firstPurchaseAt: string | null;
  isVip: boolean;
  isBlacklisted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomersPage {
  items: Customer[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
}
