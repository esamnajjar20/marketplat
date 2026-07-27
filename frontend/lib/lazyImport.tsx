/**
 * lazyImport — typed wrapper around Next.js dynamic() for lazy-loading
 * heavy client components without affecting page load scores.
 *
 * Usage:
 *   const AdForm = lazyImport(
 *     () => import('@/components/ads/AdForm'),
 *     'AdForm',
 *     { loading: () => <Skeleton className="h-64 w-full" /> }
 *   );
 */
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { DynamicOptionsLoadingProps } from 'next/dynamic';

export function lazyImport<
  TModule extends Record<TExport, ComponentType<TProps>>,
  TExport extends string,
  TProps extends object = object,
>(
  loader: () => Promise<TModule>,
  exportName: TExport,
  options?: {
    loading?: (loadingProps: DynamicOptionsLoadingProps) => React.ReactNode;
    ssr?: boolean;
  },
) {
  return dynamic<TProps>(
    async () => {
      const mod = await loader();
      return mod[exportName] as ComponentType<TProps>;
    },
    {
      ssr: false,    // default: disable SSR for heavy client-only components
      ...options,
    },
  );
}

