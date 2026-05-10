import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface QuizOption { id: string; text: string; is_correct: boolean; order_index: number; }
export interface QuizQuestion { id: string; text: string; order_index: number; options: QuizOption[]; }
export interface Quiz { id: string; lesson_id: string; pass_score: number; questions: QuizQuestion[]; created_at: string; }
export interface AttemptResult { score: number; passed: boolean; total: number; right: number; }

export interface ParsedQuestion { text: string; options: { text: string; is_correct: boolean }[]; }
export interface ParseResult { questions: ParsedQuestion[]; }

@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly api = environment.apiBaseUrl;
  constructor(private readonly http: HttpClient) {}

  async get(lessonId: string): Promise<Quiz> {
    const res = await firstValueFrom(this.http.get<{ data: Quiz }>(`${this.api}/lessons/${lessonId}/quiz`));
    return res.data;
  }

  async save(lessonId: string, data: { pass_score: number; questions: { text: string; options: { text: string; is_correct: boolean }[] }[] }): Promise<Quiz> {
    const res = await firstValueFrom(this.http.put<{ data: Quiz }>(`${this.api}/lessons/${lessonId}/quiz`, data));
    return res.data;
  }

  async attempt(lessonId: string, answers: { question_id: string; option_id: string }[]): Promise<AttemptResult> {
    const res = await firstValueFrom(this.http.post<{ data: AttemptResult }>(`${this.api}/lessons/${lessonId}/quiz/attempt`, { answers }));
    return res.data;
  }

  async delete(lessonId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/lessons/${lessonId}/quiz`));
  }

  async parseFile(file: File): Promise<ParseResult & { warning?: string }> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ data: ParseResult; warning?: string }>(`${this.api}/quiz/parse`, fd)
    );
    return { ...res.data, warning: res.warning };
  }
}
