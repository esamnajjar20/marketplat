import { JwtPayload } from '../utils/jwt';
import { GoogleProfileData } from '../../modules/auth/google.strategy';

declare global {
  namespace Express {
    // FIX TYPES-01: @types/passport (pulled in transitively via
    // google.strategy.ts's `import passport from 'passport'`) declares
    // its own ambient `namespace Express { interface User {}; interface
    // Request { user?: User; ... } }`. Re-declaring `Request.user` here
    // directly (as this file previously did) creates a second,
    // incompatible declaration of the same `Request.user` property —
    // normally a hard compile error ("subsequent property declarations
    // must have the same type"), but tsconfig.json's `skipLibCheck:
    // true` silently suppresses that conflict check for ambient/.d.ts
    // merges, so TS quietly collapsed `req.user`'s effective type down
    // to passport's empty `Express.User {}` everywhere — which is
    // exactly why `user.userId`/`user.role`/`user.sessionId` reported
    // as not existing on type `User` across every controller, even
    // though auth.middleware.ts's `req.user = { ...payload, role }`
    // assignment compiled fine (assigning to a `{}`-typed property
    // never fails an excess-property check).
    //
    // The fix: augment `Express.User` itself instead of re-declaring
    // `Request.user`. Passport already declares `interface User {}` as
    // an open, mergeable interface meant for exactly this — apps are
    // expected to extend it with their own shape. Declaring the same
    // interface name twice is a normal, conflict-free merge (unlike
    // redeclaring the same property with a different type), so
    // `Express.User` becomes `JwtPayload & { role: string }` everywhere,
    // and `Request.user` (typed by @types/express-serve-static-core /
    // @types/passport as `Express.User | undefined`) picks that up
    // automatically with no further changes needed.
    interface User extends JwtPayload {
      role: string;
    }

    interface Request {
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
