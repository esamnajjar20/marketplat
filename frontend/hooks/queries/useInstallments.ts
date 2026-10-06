'use client';
import { useQuery } from '@tanstack/react-query';
import { installmentsApi } from '@/api/installments.api';
import { queryKeys } from '@/lib/queryKeys';
export function useUpcomingInstallments() { return useQuery({ queryKey: queryKeys.installments.upcoming(), queryFn: () => installmentsApi.upcoming().then((r) => r.data.data ?? []) }); }
export function useOverdueInstallments() { return useQuery({ queryKey: queryKeys.installments.overdue(), queryFn: () => installmentsApi.overdue().then((r) => r.data.data ?? []) }); }
