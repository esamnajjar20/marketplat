import { prisma } from '../../src/config/prisma';
import { ServiceProviderDetails, ServiceAvailability } from '@prisma/client';

// Mirrors store.helper.ts's createTestStore exactly — same shape, same
// sensible defaults, only the fields this model actually needs.
export const createTestServiceProvider = async (
  sellerProfileId: string,
  overrides?: Partial<{
    businessName: string;
    description: string;
    serviceAreaCities: string[];
    contactPhone: string;
    availabilityStatus: ServiceAvailability;
    latitude: number;
    longitude: number;
  }>
): Promise<ServiceProviderDetails> =>
  prisma.serviceProviderDetails.create({
    data: {
      sellerProfileId,
      businessName: overrides?.businessName ?? 'Test Service Provider',
      description: overrides?.description ?? 'A perfectly fine service description here',
      serviceAreaCities: overrides?.serviceAreaCities ?? ['غزة'],
      workingHours: {
        sun: { open: '09:00', close: '18:00' },
        mon: { open: '09:00', close: '18:00' },
        tue: { open: '09:00', close: '18:00' },
        wed: { open: '09:00', close: '18:00' },
        thu: { open: '09:00', close: '18:00' },
        fri: null,
        sat: null,
      },
      contactPhone: overrides?.contactPhone ?? '0599111222',
      availabilityStatus: overrides?.availabilityStatus ?? 'AVAILABLE',
      latitude: overrides?.latitude,
      longitude: overrides?.longitude,
    },
  });
