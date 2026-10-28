'use client';

import { AdForm } from '@/components/ads/AdForm';
import type { Ad } from '@/types/ad.types';

interface Props { ad: Ad; }

export function EditAdForm({ ad }: Props) {
  return <AdForm mode="edit" ad={ad} />;
}
