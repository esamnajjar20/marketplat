'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Briefcase, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { WorkingHoursEditor } from './WorkingHoursEditor';
import { useUpdateServiceProvider, useUploadServiceProviderLogo } from '@/hooks/mutations/useServiceProviderMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_MB } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { toast } from 'sonner';
import type { ServiceAvailability, ServiceProviderDetails, WorkingHours } from '@/types/service.types';

interface Props {
  provider: ServiceProviderDetails;
}

const AVAILABILITY_LABELS: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

const DAY_LABELS: Record<keyof WorkingHours, string> = {
  sat: 'السبت', sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء',
  wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة',
};

/**
 * FIX BUG-XX: validates open < close per day before submit. Previously
 * only the backend's Zod schema caught this (surfacing as a generic
 * toast with no indication of *which* day was wrong) — see
 * BecomeServiceProviderCard's WorkingHoursEditor usage, which has the
 * same gap and same fix.
 */
function validateWorkingHours(hours: WorkingHours): string | undefined {
  for (const [day, schedule] of Object.entries(hours) as [keyof WorkingHours, WorkingHours[keyof WorkingHours]][]) {
    if (schedule && schedule.open >= schedule.close) {
      return `${DAY_LABELS[day]}: وقت الإغلاق يجب أن يكون بعد وقت الفتح`;
    }
  }
  return undefined;
}

export function MyServiceProviderCard({ provider }: Props) {
  const updateProvider = useUpdateServiceProvider();
  const uploadLogo = useUploadServiceProviderLogo();
  const logoInputRef = useRef<HTMLInputElement>(null);
  // UNIFIED-PROFILE: /service-providers/[id] is now just a redirect
  // back to /profile/[userId] (see that page's own comment). This is
  // always the logged-in owner's own card, so the current user's own
  // id is the target — ServiceProviderDetails itself only carries
  // sellerProfileId, not userId, so there's no other source for it here.
  const currentUser = useAuthStore(selectUser);

  // FIX BUG-XX: updateProvider is shared between the availability-status
  // Select above and the working-hours save button below. Without this,
  // saving one field disabled the other's control too (isPending is
  // mutation-wide, not per-field) — mirrors the same fix pattern as
  // AdminUsersTable's pendingStatusUserId/pendingRoleUserId.
  const isSavingHours = updateProvider.isPending && 'workingHours' in (updateProvider.variables ?? {});

  // FIX BUG-XX: MyServiceProviderCard (the only post-creation settings
  // view for a service provider) never rendered WorkingHoursEditor —
  // hours could only ever be set once, at BecomeServiceProviderCard's
  // one-time creation flow. UpdateServiceProviderPayload already
  // supports `workingHours` (Partial<CreateServiceProviderPayload>),
  // and the backend's updateServiceProviderSchema already accepts it
  // (workingHoursSchema.optional() — verified in
  // service-providers.validation.ts), so this is purely wiring up the
  // existing, reusable WorkingHoursEditor to an explicit save action
  // here, same pattern as every other editable settings field.
  const [workingHours, setWorkingHours] = useState<WorkingHours>(provider.workingHours);
  const [hoursError, setHoursError] = useState<string | undefined>();

  const hoursChanged = JSON.stringify(workingHours) !== JSON.stringify(provider.workingHours);

  function saveWorkingHours() {
    const error = validateWorkingHours(workingHours);
    setHoursError(error);
    if (error) return;
    // Local `workingHours` state won't pick up the refetched
    // provider.workingHours automatically after invalidateQueries
    // (same class of staleness as the uncontrolled-input fix elsewhere
    // in this codebase) — sync it explicitly on success so
    // `hoursChanged` correctly goes back to false and the save button
    // disappears once the save actually lands.
    updateProvider.mutate(
      { workingHours },
      { onSuccess: () => setWorkingHours(workingHours) }
    );
  }

  // Mirrors MyStoreCard's validateAndUpload: same client-side type/size
  // check before the mutation fires, same "clear the input so
  // re-selecting the same file works" reset.
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
      toast.error('نوع الصورة غير مدعوم (JPG، PNG، أو WEBP فقط)');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`حجم الصورة يجب ألا يتجاوز ${MAX_FILE_SIZE_MB} ميجابايت`);
      return;
    }
    uploadLogo.mutate(file);
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{provider.businessName}</h2>
        <Badge variant="secondary">
          {provider.businessType === 'INDIVIDUAL' ? 'فرد' : 'عمل صغير'}
        </Badge>
      </div>

      {/* FIX: logoUrl was fully supported end-to-end (validated,
          stored, rendered in ServiceProviderHeader/Card) but had no
          upload UI — mirrors MyStoreCard's logo block. */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <SafeImage
            variant="avatar"
            src={getAvatarUrl(provider.logoUrl ?? '', 64)}
            alt={provider.businessName}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadLogo.isPending}
            onClick={() => logoInputRef.current?.click()}
          >
            {uploadLogo.isPending ? 'جارٍ الرفع…' : 'تغيير الشعار'}
          </Button>
          <input
            ref={logoInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="hidden"
            onChange={handleLogoChange}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            JPG، PNG، أو WEBP — بحد أقصى {MAX_FILE_SIZE_MB} MB
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{provider.description}</p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">حالة التوفر</label>
        <Select
          value={provider.availabilityStatus}
          onValueChange={(v) =>
            updateProvider.mutate({ availabilityStatus: v as ServiceAvailability })
          }
        >
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.entries(AVAILABILITY_LABELS) as [ServiceAvailability, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">ساعات العمل</label>
        <WorkingHoursEditor
          value={workingHours}
          onChange={(v) => { setWorkingHours(v); setHoursError(undefined); }}
        />
        {hoursError && (
          <p className="text-xs text-destructive" role="alert" aria-live="assertive">
            {hoursError}
          </p>
        )}
        {hoursChanged && (
          <Button
            type="button"
            size="sm"
            onClick={saveWorkingHours}
            disabled={isSavingHours}
          >
            {isSavingHours ? 'جارٍ الحفظ…' : 'حفظ ساعات العمل'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border p-3">
          <p className="font-medium">{provider.completedRequestsCount}</p>
          <p className="text-xs text-muted-foreground">طلب مكتمل</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="font-medium">
            {provider.fulfillmentRate ? `${parseFloat(provider.fulfillmentRate).toFixed(0)}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">معدّل الإنجاز</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={ROUTES.userProfile(currentUser!.id)}>
            عرض صفحتي العامة <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myServices}>إدارة خدماتي</Link>
        </Button>
      </div>
    </div>
  );
}
