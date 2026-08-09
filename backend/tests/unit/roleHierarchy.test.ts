import { canManageRole } from '../../src/shared/utils/roleHierarchy';
import { Role } from '../../src/shared/constants/roles';

// Gap #20 (admin permission tiers): canManageRole is the single rule
// every role-change and role-adjacent (deactivation) check is built
// on. Exercised directly here — every case the product spec called
// for, expressed as the (actor, targetCurrentRole, targetNewRole)
// triple canManageRole actually receives.
describe('canManageRole', () => {
  const R = (role: string) => role as Role;

  describe('MODERATOR as actor', () => {
    it('can never manage anyone, regardless of target/new role', () => {
      expect(canManageRole(R('MODERATOR'), R('USER'), R('USER'))).toBe(false);
      expect(canManageRole(R('MODERATOR'), R('USER'), R('MODERATOR'))).toBe(false);
      expect(canManageRole(R('MODERATOR'), R('MODERATOR'), R('USER'))).toBe(false);
    });
  });

  describe('USER as actor', () => {
    it('can never manage anyone', () => {
      expect(canManageRole(R('USER'), R('USER'), R('USER'))).toBe(false);
    });
  });

  describe('ADMIN as actor', () => {
    it('can promote a USER to MODERATOR', () => {
      expect(canManageRole(R('ADMIN'), R('USER'), R('MODERATOR'))).toBe(true);
    });

    it('can demote a MODERATOR to USER', () => {
      expect(canManageRole(R('ADMIN'), R('MODERATOR'), R('USER'))).toBe(true);
    });

    it('cannot touch another ADMIN', () => {
      expect(canManageRole(R('ADMIN'), R('ADMIN'), R('USER'))).toBe(false);
    });

    it('cannot promote anyone to ADMIN', () => {
      expect(canManageRole(R('ADMIN'), R('USER'), R('ADMIN'))).toBe(false);
    });

    it('cannot touch or promote to SUPER_ADMIN', () => {
      expect(canManageRole(R('ADMIN'), R('SUPER_ADMIN'), R('USER'))).toBe(false);
      expect(canManageRole(R('ADMIN'), R('USER'), R('SUPER_ADMIN'))).toBe(false);
    });
  });

  describe('SUPER_ADMIN as actor', () => {
    it('can manage USER, MODERATOR and ADMIN targets freely between each other', () => {
      expect(canManageRole(R('SUPER_ADMIN'), R('USER'), R('MODERATOR'))).toBe(true);
      expect(canManageRole(R('SUPER_ADMIN'), R('MODERATOR'), R('ADMIN'))).toBe(true);
      expect(canManageRole(R('SUPER_ADMIN'), R('ADMIN'), R('USER'))).toBe(true);
    });

    it('can never target or assign SUPER_ADMIN, even as another SUPER_ADMIN', () => {
      expect(canManageRole(R('SUPER_ADMIN'), R('SUPER_ADMIN'), R('ADMIN'))).toBe(false);
      expect(canManageRole(R('SUPER_ADMIN'), R('ADMIN'), R('SUPER_ADMIN'))).toBe(false);
    });
  });

  describe('deactivation-style calls (targetCurrentRole === targetNewRole)', () => {
    // toggleUserActive reuses canManageRole this way — role doesn't
    // change, so "new role" == "current role", collapsing the check to
    // a single targetCurrentRank < actorRank comparison.
    it('ADMIN can deactivate a MODERATOR or USER but not another ADMIN', () => {
      expect(canManageRole(R('ADMIN'), R('MODERATOR'), R('MODERATOR'))).toBe(true);
      expect(canManageRole(R('ADMIN'), R('USER'), R('USER'))).toBe(true);
      expect(canManageRole(R('ADMIN'), R('ADMIN'), R('ADMIN'))).toBe(false);
    });

    it('SUPER_ADMIN can deactivate an ADMIN but not another SUPER_ADMIN', () => {
      expect(canManageRole(R('SUPER_ADMIN'), R('ADMIN'), R('ADMIN'))).toBe(true);
      expect(canManageRole(R('SUPER_ADMIN'), R('SUPER_ADMIN'), R('SUPER_ADMIN'))).toBe(false);
    });
  });
});
