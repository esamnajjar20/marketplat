import type { Metadata } from 'next';
import Link from 'next/link';
import { FileEdit } from 'lucide-react';
import { UnifiedProfileSettings } from '@/components/settings/UnifiedProfileSettings';
import { ViewMyProfileLink } from '@/components/profile/ViewMyProfileLink';
import { ROUTES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الملف الشخصي', noIndex: true });

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">الملف الشخصي</h1>
        <div className="flex items-center gap-3">
          {/* DRAFTS-LINKS-01 */}
          <Link
            href={ROUTES.settings.drafts}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <FileEdit className="h-4 w-4" />
            مركز المسودات
          </Link>
          <ViewMyProfileLink />
        </div>
      </div>
      <UnifiedProfileSettings />
    </div>
  );
}
