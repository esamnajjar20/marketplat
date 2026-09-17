export type RequestType = 'SERVICE' | 'PRODUCT' | 'RENTAL';
export type RequestStatus = 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
export type RequestOfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';

export type RequestListItem = {
  id: string;
  type: RequestType;
  title: string;
  description: string;
  city: string | null;
  categoryId: string;
  status: RequestStatus;
  budgetMin?: string | null;
  budgetMax?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  _count?: { offers: number };
  customer?: { id: string; name: string; avatarUrl: string | null };
};

export type RequestOfferListItem = {
  id: string;
  requestId: string;
  offererUserId: string;
  price: string;
  message: string | null;
  status: RequestOfferStatus;
  createdAt: string;
  offerer?: { id: string; name: string; avatarUrl: string | null };
};

export type RequestDetail = RequestListItem & {
  customerId: string;
  attributes?: Record<string, unknown> | null;
  attachedImages?: string[];
  acceptedOfferId?: string | null;
  offers?: RequestOfferListItem[];
  acceptedOffer?: RequestOfferListItem | null;
};
