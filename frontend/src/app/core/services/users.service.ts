import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'teacher' | 'student';
  status: 'active' | 'inactive';
  created_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'teacher' | 'student';
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  async list(role?: 'admin' | 'teacher' | 'student'): Promise<User[]> {
    const url = role ? `${this.api}/users?role=${role}` : `${this.api}/users`;
    const res = await firstValueFrom(this.http.get<{ data: User[] }>(url));
    return res.data ?? [];
  }

  async create(payload: CreateUserPayload): Promise<User> {
    const res = await firstValueFrom(this.http.post<{ data: User }>(`${this.api}/users`, payload));
    return res.data;
  }

  async update(id: string, payload: { full_name: string; role: string; status?: string }): Promise<User> {
    const res = await firstValueFrom(this.http.put<{ data: User }>(`${this.api}/users/${id}`, payload));
    return res.data;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/users/${id}`));
  }
}
