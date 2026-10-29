/**
 * طبقة اختيارية لـ TanStack Query.
 *
 * التثبيت (مرة واحدة):
 *   cd apps/mobile && npx expo install @tanstack/react-query
 *
 * ثم في app/_layout.tsx لِفّ الشجرة بـ:
 *   <QueryProvider>
 *     <ConnectivityProvider>…</ConnectivityProvider>
 *   </QueryProvider>
 *
 * حتى يتم التثبيت، هذا الملف يمرّر الأطفال كما هم (no-op provider)
 * حتى لا يكسر البناء.
 */
import { type ReactNode } from 'react';

type Props = { children: ReactNode };

let QueryClientProviderImpl: React.ComponentType<{ client: unknown; children: ReactNode }> | null =
  null;
let sharedClient: unknown = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tq = require('@tanstack/react-query') as {
    QueryClient: new (opts?: object) => unknown;
    QueryClientProvider: React.ComponentType<{ client: unknown; children: ReactNode }>;
  };
  QueryClientProviderImpl = tq.QueryClientProvider;
  sharedClient = new tq.QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
} catch {
  // الحزمة غير مثبتة بعد — الوضع الافتراضي
}

export function QueryProvider({ children }: Props) {
  if (QueryClientProviderImpl && sharedClient) {
    return <QueryClientProviderImpl client={sharedClient}>{children}</QueryClientProviderImpl>;
  }
  return <>{children}</>;
}
