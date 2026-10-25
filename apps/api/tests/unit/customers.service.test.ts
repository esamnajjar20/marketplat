import { customersService } from '../../src/modules/customers/customers.service';
import { customersRepository } from '../../src/modules/customers/customers.repository';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/customers/customers.repository');

describe('customersService', () => {
  beforeEach(() => jest.clearAllMocks());
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
