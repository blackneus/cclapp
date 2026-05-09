import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Lesson } from './lessons.service';

export interface Module {
  id: string;
  course_id: string;
  title: string;
  description: string;
  order_index: number;
  lessons?: Lesson[];
}

@Injectable({ providedIn: 'root' })
export class ModulesService {
  private readonly api = environment.apiBaseUrl;
  constructor(private readonly http: HttpClient) {}

  async create(courseId: string, payload: { title: string; description: string }): Promise<Module> {
    const res = await firstValueFrom(this.http.post<{ data: Module }>(`${this.api}/courses/${courseId}/modules`, payload));
    return res.data;
  }

  async update(courseId: string, id: string, payload: { title?: string; description?: string }): Promise<Module> {
    const res = await firstValueFrom(this.http.put<{ data: Module }>(`${this.api}/courses/${courseId}/modules/${id}`, payload));
    return res.data;
  }

  async delete(courseId: string, id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/courses/${courseId}/modules/${id}`));
  }

  async reorder(courseId: string, order: string[]): Promise<void> {
    await firstValueFrom(this.http.put(`${this.api}/courses/${courseId}/modules/reorder`, { order }));
  }
}
