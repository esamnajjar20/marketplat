import { customersService } from '../../src/modules/commerce/customers/customers.service';
import { customersRepository } from '../../src/modules/commerce/customers/customers.repository';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/commerce/customers/customers.repository');

describe('customersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds the customer overview from summary and the first list page in parallel', async () => {
    const summary = { totalCustomers: 4, vipCustomers: 1, debtors: 2, inactiveCustomers: 0, totalSpent: 120, averageCustomerSpend: 30 };
    const customers = { items: [{ id: 'c1' }], meta: { total: 1, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
    (customersRepository.summary as jest.Mock).mockResolvedValue(summary);
    (customersRepository.list as jest.Mock).mockResolvedValue(customers);

    await expect(customersService.overview('seller-1', { page: 1, limit: 50 })).resolves.toEqual({ summary, customers, failures: { summary: false, customers: false } });
    expect(customersRepository.summary).toHaveBeenCalledWith('seller-1');
    expect(customersRepository.list).toHaveBeenCalledWith('seller-1', { page: 1, limit: 50 });
  });

  it('keeps customer list available when the summary query fails', async () => {
    const customers = { items: [{ id: 'c1' }], meta: { total: 1, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
    (customersRepository.summary as jest.Mock).mockRejectedValue(new Error('summary unavailable'));
    (customersRepository.list as jest.Mock).mockResolvedValue(customers);

    await expect(customersService.overview('seller-1', { page: 1, limit: 50 })).resolves.toEqual({
      summary: null,
      customers,
      failures: { summary: true, customers: false },
    });
  });

  it('normalizes Palestinian-style phone input before lookup/create', async () => {
    (customersRepository.findByPhone as jest.Mock).mockResolvedValue(null);
    (customersRepository.create as jest.Mock).mockResolvedValue({ id: 'c1' });
    await customersService.create('u1', { name: 'Ali', phone: '059 123-4567', tags: [] });
    expect(customersRepository.findByPhone).toHaveBeenCalledWith('u1', '0591234567');
    expect(customersRepository.create).toHaveBeenCalledWith(expect.objectContaining({ phone: '0591234567' }));
  });
  it('prevents duplicate phone numbers inside one seller ledger', async () => {
    (customersRepository.findByPhone as jest.Mock).mockResolvedValue({ id: 'existing' });
    await expect(customersService.create('u1', { name: 'Ali', phone: '0591234567', tags: [] })).rejects.toThrow(ConflictError);
  });
});
