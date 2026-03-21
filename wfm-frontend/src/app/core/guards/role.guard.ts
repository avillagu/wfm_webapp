import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard that checks if user has one of the required roles
 * Usage: canActivate: [roleGuard(['admin', 'supervisor'])]
 */
export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const userRole = auth.role();

    if (!userRole) {
      router.navigateByUrl('/login');
      return false;
    }

    if (allowedRoles.includes(userRole)) {
      return true;
    }

    // Redirect to attendance (default page for analysts)
    router.navigateByUrl('/attendance');
    return false;
  };
};
