import { configureGoogleStrategy } from './google.strategy';

// FIX OAUTH-01: registers (or, if unconfigured, warns and skips — see
// the function's own comment) the Passport Google strategy exactly
// once, at module load time — before auth.routes.ts's
// passport.authenticate('google', ...) calls can ever run, since this
// module (modules/auth/index.ts) is what routes.ts imports to get
// authRouter in the first place, guaranteeing this runs first.
configureGoogleStrategy();

export { authRouter } from './auth.routes';
export { authService } from './auth.service';
