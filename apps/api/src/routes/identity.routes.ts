import type { Router } from 'express';
import { authRouter } from '../modules/identity/auth';
import { usersRouter } from '../modules/identity/users';
import { sellersRouter } from '../modules/identity/sellers';

/** Accounts, sessions and seller profiles. */
export function registerIdentityRoutes(router: Router): void {
  router.use('/auth', authRouter);
  router.use('/users', usersRouter);
  router.use('/sellers', sellersRouter);
}
