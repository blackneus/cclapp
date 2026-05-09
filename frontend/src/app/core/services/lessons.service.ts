import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Attachment {
  id: string;
  name: string;
  drive_file_id: string;
  mime_type: string;
  order_index: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string;
  order_index: number;
  video_storage_provider: string;
  video_storage_ref: string;
  duration_seconds: number;
  attachments: Attachment[];
}

@Injectable({ providedIn: 'root' })
export class LessonsService {
  private readonly api = environment.apiBaseUrl;
  constructor(private readonly http: HttpClient) {}

  async create(courseId: string, moduleId: string, payload: Partial<Lesson>): Promise<Lesson> {
    const res = await firstValueFrom(
      this.http.post<{ data: Lesson }>(`${this.api}/courses/${courseId}/modules/${moduleId}/lessons`, payload)
    );
    return res.data;
  }

  async update(courseId: string, moduleId: string, id: string, payload: Partial<Lesson>): Promise<Lesson> {
    const res = await firstValueFrom(
      this.http.put<{ data: Lesson }>(`${this.api}/courses/${courseId}/modules/${moduleId}/lessons/${id}`, payload)
    );
    return res.data;
  }

  async delete(courseId: string, moduleId: string, id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/courses/${courseId}/modules/${moduleId}/lessons/${id}`));
  }

  async reorder(courseId: string, moduleId: string, order: string[]): Promise<void> {
    await firstValueFrom(this.http.put(`${this.api}/courses/${courseId}/modules/${moduleId}/lessons/reorder`, { order }));
  }

  async addAttachment(lessonId: string, payload: { name: string; drive_file_id: string; mime_type: string }): Promise<Attachment> {
    const res = await firstValueFrom(
      this.http.post<{ data: Attachment }>(`${this.api}/lessons/${lessonId}/attachments`, payload)
    );
    return res.data;
  }

  async deleteAttachment(lessonId: string, attachId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/lessons/${lessonId}/attachments/${attachId}`));
  }
}
