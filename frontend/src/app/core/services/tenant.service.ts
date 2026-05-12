import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TenantInfo {
  id: string;
  slug: string;
  subdomain: string;
  name: string;
  logo_url?: string;
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  private readonly _info = signal<TenantInfo | null>(null);
  readonly info = this._info.asReadonly();

  async load(): Promise<TenantInfo | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: TenantInfo }>(`${this.api}/tenant`),
      );
      this._info.set(res.data);
      return res.data;
    } catch {
      return null;
    }
  }

  async update(payload: { name?: string; logo_url?: string }): Promise<TenantInfo> {
    const res = await firstValueFrom(
      this.http.patch<{ data: TenantInfo }>(`${this.api}/tenant`, payload),
    );
    this._info.set(res.data);
    return res.data;
  }
}
