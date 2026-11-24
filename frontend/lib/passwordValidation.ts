/** Backward-compatible frontend password validator; policy lives in shared/. */
export { getPasswordPolicyError as validatePassword } from '../../shared/password-policy';
