import { adminService } from '../../src/modules/platform/admin/admin.service';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';

describe('adminService.iterateActiveUserIdBatches', () => {
  it('yields stable keyset batches and excludes inactive users', async () => {
    const marker = Date.now();
    const active1 = await createTestUser({ email: `batch-active1-${marker}@example.com` });
    const active2 = await createTestUser({ email: `batch-active2-${marker}@example.com` });
    const inactive = await createTestUser({ email: `batch-inactive-${marker}@example.com` });
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

    const batches: string[][] = [];
    for await (const batch of adminService.iterateActiveUserIdBatches(1)) batches.push(batch);
    const ids = batches.flat();

    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(active1.id);
    expect(ids).toContain(active2.id);
    expect(ids).not.toContain(inactive.id);
    expect(batches.every(batch => batch.length === 1)).toBe(true);
  });
});
