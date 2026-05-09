import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly api = environment.apiBaseUrl;
  constructor(private readonly http: HttpClient) {}

  async complete(lessonId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/lessons/${lessonId}/complete`, {}));
  }
}
