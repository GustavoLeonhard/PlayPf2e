import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Espera a que se restaure la sesion antes de decidir. */
async function waitReady(auth: AuthService) {
  while (!auth.ready()) await new Promise((r) => setTimeout(r, 10));
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await waitReady(auth);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await waitReady(auth);
  return auth.isLoggedIn() ? router.createUrlTree(['/characters']) : true;
};
