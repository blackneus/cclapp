import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'licreamo_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const headers: Record<string, string> = {};

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (environment.tenantSubdomain) {
    headers['X-Tenant-Subdomain'] = environment.tenantSubdomain;
  }

  return next(req.clone({ setHeaders: headers }));
};
