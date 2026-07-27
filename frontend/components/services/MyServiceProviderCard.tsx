'use client';

import Link from 'next/link';
import { Briefcase, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useUpdateServiceProvider } from '@/hooks/mutations/useServiceProviderMutations';
import { ROUTES } from '@/lib/constants';
import type { ServiceAvailability, ServiceProviderDetails } from '@/types/service.types';

interface Props {
  provider: ServiceProviderDetails;
}

const AVAILABILITY_LABELS: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

export function MyServiceProviderCard({ provider }: Props) {
  const updateProvider = useUpdateServiceProvider();

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{provider.businessName}</h2>
        <Badge variant="secondary">
          {provider.businessType === 'INDIVIDUAL' ? 'فرد' : 'عمل صغير'}
        </Badge>
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
          <Link href={ROUTES.serviceProvider(provider.id)}>
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
