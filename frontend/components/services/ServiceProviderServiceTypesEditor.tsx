'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Save } from 'lucide-react';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { serviceTypesApi } from '@/api/service-types.api';
import { Button } from '@/components/shared/ui/Button';
import { ServiceTypeFieldsForm } from './ServiceTypeFieldsForm';
import type { ServiceProviderServiceTypeProfile } from '@/types/service.types';

export function ServiceProviderServiceTypesEditor() {
  const queryClient = useQueryClient();
  const profiles = useQuery({ queryKey: ['my-service-provider-service-types'], queryFn: () => serviceProvidersApi.getMyServiceTypeProfiles().then(r => r.data.data) });
  const allTypes = useQuery({ queryKey: ['service-types'], queryFn: () => serviceTypesApi.getAll().then(r => r.data.data) });
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [savingTypeId, setSavingTypeId] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ serviceTypeId, attributes }: { serviceTypeId: string; attributes: Record<string, unknown> }) => serviceProvidersApi.updateMyServiceTypeProfile(serviceTypeId, { attributes }),
    onSuccess: (_result, variables) => {
      toast.success('تم حفظ بيانات التخصص');
      setSavingTypeId(null);
      queryClient.invalidateQueries({ queryKey: ['my-service-provider-service-types'] });
      setDrafts((current) => { const next = { ...current }; delete next[variables.serviceTypeId]; return next; });
    },
    onError: () => {
      setSavingTypeId(null);
      toast.error('تعذر حفظ بيانات التخصص. حاول مرة أخرى.');
    },
  });

  if (profiles.isLoading) return <div className="text-sm text-muted-foreground">جارٍ تحميل تخصصات مقدم الخدمة…</div>;
  const items = (profiles.data ?? []) as ServiceProviderServiceTypeProfile[];
  if (!items.length) return <p className="text-sm text-muted-foreground">أضف خدمة أولًا، وستظهر هنا الحقول الخاصة بمجالها.</p>;

  return <div className="space-y-4">
    {items.map(profile => {
      const type = allTypes.data?.find(t => t.id === profile.serviceTypeId) ?? profile.serviceType;
      const values = drafts[profile.serviceTypeId] ?? profile.attributes ?? {};
      const fields = type.fields.filter(f => f.scope === 'PROVIDER' && f.isActive);
      if (!fields.length) return null;
      const dirty = Boolean(drafts[profile.serviceTypeId]);
      const isSaving = savingTypeId === profile.serviceTypeId && save.isPending;
      return <section key={profile.serviceTypeId} className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{type.nameAr}</h3>
            <p className="mt-1 text-xs text-muted-foreground">بيانات مقدم الخدمة لهذا المجال فقط</p>
          </div>
          {dirty ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">غير محفوظ</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" aria-hidden />محفوظ</span>
          )}
        </div>
        <ServiceTypeFieldsForm compact scope="PROVIDER" fields={fields} values={values} onChange={(key, value) => setDrafts(d => ({ ...d, [profile.serviceTypeId]: { ...values, [key]: value } }))} />
        {dirty ? (
          <Button size="sm" disabled={isSaving} onClick={() => { setSavingTypeId(profile.serviceTypeId); save.mutate({ serviceTypeId: profile.serviceTypeId, attributes: values }); }} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
            {isSaving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </Button>
        ) : null}
      </section>;
    })}
  </div>;
}
