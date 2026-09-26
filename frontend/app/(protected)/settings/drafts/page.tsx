import type { Metadata } from 'next';
import { DraftsCenterClient } from '@/components/settings/DraftsCenterClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'مركز المسودات',
  noIndex: true,
});

export default function DraftsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">مركز المسودات</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
          كل ما بدأته ولم يُنشر بعد — محفوظ على جهازك ويعمل بدون إنترنت.
        </p>
      </div>
      <DraftsCenterClient />
    </div>
  );
}
