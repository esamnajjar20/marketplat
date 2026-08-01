import { adminService } from '../../src/modules/admin/admin.service';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';

/**
 * Uses the real (unmocked) prisma client via createTestUser, same
 * approach as admin.service.test.ts's own getStats/getAllUsers suites —
 * getAllActiveUserIds is a straightforward findMany + map with no
 * business logic worth mocking around, and testing it against a real
 * isActive filter is more convincing than asserting a mocked where
 * clause matches what the implementation happens to pass.
 */
describe('adminService.getAllActiveUserIds', () => {
  it('returns only the ids of active users, excluding deactivated ones', async () => {
    const active1 = await createTestUser({ email: `active1-${Date.now()}@example.com` });
    const active2 = await createTestUser({ email: `active2-${Date.now()}@example.com` });
    const inactive = await createTestUser({ email: `inactive-${Date.now()}@example.com` });
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

    const result = await adminService.getAllActiveUserIds();

    expect(result).toEqual(expect.arrayContaining([active1.id, active2.id]));
    expect(result).not.toContain(inactive.id);
  });

  it('returns an empty array when there are no active users', async () => {
    const onlyUser = await createTestUser({ email: `solo-${Date.now()}@example.com` });
    await prisma.user.update({ where: { id: onlyUser.id }, data: { isActive: false } });

    const result = await adminService.getAllActiveUserIds();

    expect(result).not.toContain(onlyUser.id);
  });
});
