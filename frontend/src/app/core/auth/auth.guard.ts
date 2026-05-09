import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

let meLoaded = false;

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.accessToken) {
    return router.createUrlTree(['/login']);
  }

  if (!meLoaded) {
    const me = await auth.loadMe();
    if (!me) return router.createUrlTree(['/login']);
    meLoaded = true;
  }

  return true;
};
