'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '@/api/customers.api';
import { invalidateCustomerCaches } from '@/lib/queryInvalidation';
export function useCreateCustomer() { const qc=useQueryClient(); return useMutation({ mutationFn: customersApi.create, onSuccess: (response) => { const id = response?.data?.data?.id; if (id) void invalidateCustomerCaches(qc, id); } }); }
export function useUpdateCustomer() { const qc=useQueryClient(); return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof customersApi.update>[1] }) => customersApi.update(id, payload), onSuccess: (_response, variables) => { void invalidateCustomerCaches(qc, variables.id); } }); }
