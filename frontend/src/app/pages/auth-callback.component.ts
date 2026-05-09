import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<p class="muted" style="padding:40px;text-align:center">Autenticando...</p>`,
})
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParams;
    const accessToken = params['access_token'] as string | undefined;
    const refreshToken = params['refresh_token'] as string | undefined;

    if (accessToken && refreshToken) {
      this.auth.setTokens(accessToken, refreshToken);
      await this.auth.loadMe();
      await this.router.navigateByUrl('/');
    } else {
      await this.router.navigateByUrl('/login');
    }
  }
}
