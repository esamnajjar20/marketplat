import { JwtPayload } from '../utils/jwt';
import { GoogleProfileData } from '../../modules/auth/google.strategy';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { role: string };
      requestId?: string;
      // FIX OAUTH-01: set transiently by Passport during GET
      // /auth/google/callback only (see auth.routes.ts's
      // passport.authenticate custom callback + google.strategy.ts's
      // verify callback), read once by authController.googleCallback.
      // Deliberately a separate property rather than overloading
      // req.user — req.user's existing type (JwtPayload & { role })
      // is relied on, unmodified, by requireUser() and every
      // authenticated controller across the app (ads, users, admin,
      // etc.); widening it to accommodate this unrelated OAuth-only
      // shape would have turned every one of those `user.userId`
      // accesses into `string | undefined`, a large, unrelated,
      // purely-type-level blast radius for a feature that only ever
      // touches this one route.
      googleProfile?: GoogleProfileData;
    }
  }
}
