'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { installmentsApi } from '@/api/installments.api';
import { queryKeys } from '@/lib/queryKeys';
export function usePayInstallment() { const qc=useQueryClient(); return useMutation({ mutationFn: ({ id, amount }: { id: string; amount?: number }) => installmentsApi.pay(id, amount), onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.installments.overview() }); void qc.invalidateQueries({ queryKey: queryKeys.sales.all() }); } }); }
