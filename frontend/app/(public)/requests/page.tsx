import { RequestsPageShell } from '@/components/requests/RequestsPageShell';

/**
 * /requests route — Server Component wrapper.
 * Metadata lives in layout.tsx (unchanged).
 * All client-only rendering happens inside RequestsPageShell (a Client Component)
 * where dynamic({ ssr: false }) is valid.
 */
export default function OpenRequestsPage() {
  return <RequestsPageShell />;
}
