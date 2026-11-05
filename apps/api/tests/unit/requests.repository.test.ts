import { requestsRepository } from '../../src/modules/requests/requests.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    request: {
      count: jest.fn(),
    },
  },
}));

describe('requestsRepository.countOpenByCustomer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts only OPEN requests that have not expired yet', async () => {
    const now = new Date('2026-11-05T19:00:00.000Z');
    (prisma.request.count as jest.Mock).mockResolvedValue(2);

    await expect(requestsRepository.countOpenByCustomer('customer-1', now)).resolves.toBe(2);

    expect(prisma.request.count).toHaveBeenCalledWith({
      where: {
        customerId: 'customer-1',
        status: 'OPEN',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  });
});
