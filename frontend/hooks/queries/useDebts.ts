'use client';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys } from '@/lib/queryKeys';
export function useDebts() { return useQuery({ queryKey: queryKeys.sales.debts(), queryFn: () => salesApi.debts().then((r) => r.data.data ?? []) }); }
