import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LessonComment {
  id: string;
  lesson_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  content: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  async list(lessonId: string): Promise<LessonComment[]> {
    const res = await firstValueFrom(
      this.http.get<{ data: LessonComment[] }>(`${this.api}/lessons/${lessonId}/comments`)
    );
    return res.data ?? [];
  }

  async create(lessonId: string, content: string): Promise<LessonComment> {
    const res = await firstValueFrom(
      this.http.post<{ data: LessonComment }>(`${this.api}/lessons/${lessonId}/comments`, { content })
    );
    return res.data;
  }

  async delete(lessonId: string, commentId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/lessons/${lessonId}/comments/${commentId}`));
  }
}
