/**
 * Compatibility facade for mobile forms. Validation rules live in
 * @marketplat/contracts and are shared with the API and web application.
 */
export {
  emailSchema,
  passwordSchema,
  loginFormSchema as loginSchema,
  registerFormSchema as registerSchema,
  adDraftSchema,
  adEditorSchema,
  homeFilterSchema,
  firstZodError,
  validate,
  getPasswordPolicyError,
} from '@marketplat/contracts';
