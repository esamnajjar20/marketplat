/** Client-side mirror of apps/api/src/modules/identity/auth/auth.validation.ts.
 * The server remains authoritative; keep this compact deny-list in parity there.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;
export const PASSWORD_WEAK_MESSAGE = 'كلمة المرور شائعة جدًا؛ اختر كلمة مرور أقوى.';
export const PASSWORD_LENGTH_MESSAGE = 'كلمة المرور يجب أن تكون بين 8 و100 حرف.';

const COMMON_WEAK_PASSWORDS = new Set([
  'password','password1','password123','password!','passw0rd','p@ssword','p@ssw0rd',
  '12345678','123456789','1234567890','qwerty','qwerty123','qwertyuiop','qwer1234','qwerty1',
  'abc12345','abc123456','a1b2c3d4','1q2w3e4r','zaq12wsx','11111111','00000000','12121212',
  '12341234','123123123','iloveyou','iloveyou1','sunshine','princess','monkey123','welcome',
  'welcome1','welcome123','letmein','letmein1','admin123','admin1234','administrator','root1234',
  'football','baseball','superman','batman123','whatever','trustno1','master123','shadow123',
  'michael1','jordan23','asdfghjkl','zxcvbnm123','qazwsxedc','1qaz2wsx','palestine','gaza',
  'غزة','فلسطين','محمد','احمد',
]);

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return PASSWORD_LENGTH_MESSAGE;
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) return PASSWORD_WEAK_MESSAGE;
  return null;
}
