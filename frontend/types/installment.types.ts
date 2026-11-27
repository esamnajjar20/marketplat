import type { InstallmentStatus } from '@marketplat/contracts';
export type { InstallmentStatus } from '@marketplat/contracts';
export interface SaleInstallment { id: string; saleId: string; installmentNo: number; amount: string; dueDate: string; paidAt: string | null; paidAmount: string | null; status: InstallmentStatus; note: string | null; }
