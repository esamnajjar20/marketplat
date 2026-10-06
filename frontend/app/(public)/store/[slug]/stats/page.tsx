import type { Metadata } from 'next';
import { PublicSalesStats } from '@/components/stores/PublicSalesStats';
import { buildMetadata } from '@/lib/seo';
export const metadata: Metadata = buildMetadata({title:'إحصائيات المتجر',path:'/store'});
export default async function PublicStoreStatsPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params; return <main className="container mx-auto px-3 py-8 sm:px-4"><PublicSalesStats slug={slug}/></main>}
