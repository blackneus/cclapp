import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'teacher' | 'student';
  tenant_id: string;
}

interface LoginResponse {
  message: string;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: AuthUser;
  };
}

interface MeResponse {
  message: string;
  data: AuthUser;
}

const TOKEN_KEY = 'licreamo_token';
const REFRESH_KEY = 'licreamo_refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiBaseUrl;
  private readonly _user = signal<AuthUser | null>(null);
  private readonly _loading = signal(false);

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.accessToken);
  readonly role = computed(() => this._user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isTeacher = computed(() => this.role() === 'teacher');
  readonly isStudent = computed(() => this.role() === 'student');

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  get accessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setTokens(access: string, refresh: string): void {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }

  async login(email: string, password: string): Promise<void> {
    this._loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.api}/auth/login`, { email, password }),
      );
      this.setTokens(res.data.access_token, res.data.refresh_token);
      this._user.set(res.data.user);
    } finally {
      this._loading.set(false);
    }
  }

  async loadMe(): Promise<AuthUser | null> {
    if (!this.accessToken) {
      this._user.set(null);
      return null;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<MeResponse>(`${this.api}/auth/me`),
      );
      this._user.set(res.data);
      return res.data;
    } catch {
      this.logout(false);
      return null;
    }
  }

  logout(redirect = true): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this._user.set(null);
    if (redirect) void this.router.navigateByUrl('/login');
  }
}
