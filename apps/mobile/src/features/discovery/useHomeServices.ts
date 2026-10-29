import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchServiceListings,
  getCachedServiceListings,
  type ServiceListing,
} from '@/features/services/services.api';

export function useHomeServices() {
  const [serviceItems, setServiceItems] = useState<ServiceListing[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  const loadServices = useCallback(async (_refresh = false) => {
    const requestSequence = ++sequenceRef.current;
    const isCurrent = () => requestSequence === sequenceRef.current;
    let hasCachedData = false;
    try {
      const cached = await getCachedServiceListings({ page: 1, limit: 8, search: '' });
      if (!isCurrent()) return;
      if (cached && cached.length) {
        hasCachedData = true;
        setServiceItems(cached.slice(0, 8));
        setServicesLoading(false);
      }
    } catch {
      /* optional */
    }
    if (!hasCachedData) setServicesLoading(true);
    try {
      const result = await fetchServiceListings({ page: 1, limit: 8, search: '' });
      if (!isCurrent()) return;
      setServiceItems(result.slice(0, 8));
      setServicesError(null);
    } catch (error) {
      if (isCurrent() && !hasCachedData) {
        setServicesError(error instanceof Error ? error.message : 'تعذر تحميل الخدمات.');
      }
    } finally {
      if (isCurrent()) setServicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  return {
    serviceItems,
    servicesLoading,
    servicesError,
    loadServices,
  };
}
