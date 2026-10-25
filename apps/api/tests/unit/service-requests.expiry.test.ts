import {
  serviceRequestsService,
  SERVICE_REQUEST_PENDING_TTL_DAYS,
} from '../../src/modules/service-requests/service-requests.service';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { notificationEvents } from '../../src/modules/notifications/notifications.service';

jest.mock('../../src/modules/service-requests/service-requests.repository');
jest.mock('../../src/modules/service-listings/service-listings.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/blocked-users', () => ({ blockedUsersService: {} }));
jest.mock('../../src/modules/activity', () => ({ activityService: { record: jest.fn() }, activityTemplates: {} }));
jest.mock('../../src/config/prisma', () => ({ prisma: {} }));
jest.mock('../../src/modules/notifications/notifications.service', () => ({
  notificationEvents: { onServiceRequestExpired: jest.fn() },
}));

const DAY = 24 * 60 * 60 * 1000;
const row = (id: string) => ({ id, customerId: `cust-${id}`, listing: { title: `Service ${id}` } });

describe('serviceRequestsService.expireStalePending (audit H4)', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (notificationEvents.onServiceRequestExpired as jest.Mock).mockResolvedValue(null);
  });

  it('uses a 7-day TTL by default', () => {
    expect(SERVICE_REQUEST_PENDING_TTL_DAYS).toBe(7);
  });

  it('computes the cutoff as now minus the TTL', async () => {
    (serviceRequestsRepository.findStalePending as jest.Mock).mockResolvedValue([]);

    await serviceRequestsService.expireStalePending(now);

    const [cutoff] = (serviceRequestsRepository.findStalePending as jest.Mock).mock.calls[0];
    expect((cutoff as Date).getTime()).toBe(now.getTime() - 7 * DAY);
  });

  it('expires each stale request and notifies its customer', async () => {
    (serviceRequestsRepository.findStalePending as jest.Mock).mockResolvedValue([row('a'), row('b')]);
    (serviceRequestsRepository.expirePending as jest.Mock).mockResolvedValue({ count: 1 });

    const n = await serviceRequestsService.expireStalePending(now);

    expect(n).toBe(2);
    expect(notificationEvents.onServiceRequestExpired).toHaveBeenCalledWith('cust-a', 'a', 'Service a', 7);
    expect(notificationEvents.onServiceRequestExpired).toHaveBeenCalledWith('cust-b', 'b', 'Service b', 7);
  });

  it('skips (no count, no notification) a request answered between the read and the update', async () => {
    (serviceRequestsRepository.findStalePending as jest.Mock).mockResolvedValue([row('a'), row('b')]);
    (serviceRequestsRepository.expirePending as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const n = await serviceRequestsService.expireStalePending(now);

    expect(n).toBe(1);
    expect(notificationEvents.onServiceRequestExpired).toHaveBeenCalledTimes(1);
    expect(notificationEvents.onServiceRequestExpired).toHaveBeenCalledWith('cust-b', 'b', 'Service b', 7);
  });

  it('a failing notification never fails the run', async () => {
    (serviceRequestsRepository.findStalePending as jest.Mock).mockResolvedValue([row('a')]);
    (serviceRequestsRepository.expirePending as jest.Mock).mockResolvedValue({ count: 1 });
    (notificationEvents.onServiceRequestExpired as jest.Mock).mockRejectedValue(new Error('push down'));

    await expect(serviceRequestsService.expireStalePending(now)).resolves.toBe(1);
  });

  it('stops instead of looping forever when a full batch makes no progress', async () => {
    const full = Array.from({ length: 200 }, (_, i) => row(String(i)));
    (serviceRequestsRepository.findStalePending as jest.Mock).mockResolvedValue(full);
    (serviceRequestsRepository.expirePending as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(serviceRequestsService.expireStalePending(now)).resolves.toBe(0);
    expect(serviceRequestsRepository.findStalePending).toHaveBeenCalledTimes(1);
  });

  it('keeps going while batches come back full, and ends on a short batch', async () => {
    const full = Array.from({ length: 200 }, (_, i) => row(`f${i}`));
    (serviceRequestsRepository.findStalePending as jest.Mock)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([row('last')]);
    (serviceRequestsRepository.expirePending as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(serviceRequestsService.expireStalePending(now)).resolves.toBe(201);
    expect(serviceRequestsRepository.findStalePending).toHaveBeenCalledTimes(2);
  });
});
