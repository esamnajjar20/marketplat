/**
 * Shared test render helper.
 *
 * Most component/hooks tests that touch React Query were failing with
 * "No QueryClient set, use QueryClientProvider to set one". Use this
 * instead of @testing-library/react's render so every test gets a
 * fresh QueryClient (retry: false) and optional auth/router mocks stay
 * under the caller's control.
 */
import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const { queryClient: _qc, ...rest } = options ?? {};

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...rest }),
    queryClient,
  };
}

export * from '@testing-library/react';
