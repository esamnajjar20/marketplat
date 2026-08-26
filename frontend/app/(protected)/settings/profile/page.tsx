import type { Metadata }        from 'next';
import { ProfileSettingsForm }  from '@/components/profile/ProfileSettingsForm';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import { ViewMyProfileLink }    from '@/components/profile/ViewMyProfileLink';
import { buildMetadata }        from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الملف الشخصي', noIndex: true });

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">الملف الشخصي</h1>
        {/* FIX UX-PROFILE-01: /profile/[id] (app/(public)/profile/[id])
            has always existed and works — but ROUTES.userProfile() was
            only ever linked from three places, all pointing at OTHER
            users' ids (AdminReportsTable, MyReportsList, SellerCard on
            an ad). A user had no way to reach that same page for their
            own id — only this edit form. This is the missing link. */}
        <ViewMyProfileLink />
      </div>
      <ProfileSettingsForm />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">تفضيلات الجهاز</h2>
        <DataSaverToggle />
      </section>
    </div>
  );
}
