'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '@/api/customers.api';
import { queryKeys } from '@/lib/queryKeys';
export function useCreateCustomer() { const qc=useQueryClient(); return useMutation({ mutationFn: customersApi.create, onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.customers.all() }); } }); }
export function useUpdateCustomer() { const qc=useQueryClient(); return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof customersApi.update>[1] }) => customersApi.update(id, payload), onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.customers.all() }); } }); }
