import { hashPassword, comparePassword } from '../../src/shared/utils/hash';

describe('Hash Utils', () => {
  it('should hash a password', async () => {
    const hash = await hashPassword('mypassword123');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('mypassword123');
  });

  it('should produce different hashes for same password', async () => {
    const hash1 = await hashPassword('mypassword123');
    const hash2 = await hashPassword('mypassword123');
    expect(hash1).not.toBe(hash2);
  });

  it('should return true for correct password', async () => {
    const hash = await hashPassword('mypassword123');
    expect(await comparePassword('mypassword123', hash)).toBe(true);
  });

  it('should return false for incorrect password', async () => {
    const hash = await hashPassword('mypassword123');
    expect(await comparePassword('wrongpassword', hash)).toBe(false);
  });
});
