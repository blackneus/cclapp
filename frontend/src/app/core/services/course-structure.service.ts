import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ParsedLesson { title: string; description: string; }
export interface ParsedModule { title: string; lessons: ParsedLesson[]; }
export interface ParsedQuizOption { text: string; is_correct: boolean; }
export interface ParsedQuizQuestion { text: string; options: ParsedQuizOption[]; }
export interface ParsedQuiz { pass_score: number; questions: ParsedQuizQuestion[]; }
export interface ParsedStructure { modules: ParsedModule[]; quiz?: ParsedQuiz | null; }

export interface ApplyResult { modules_created: number; lessons_created: number; quiz_created: boolean; }

@Injectable({ providedIn: 'root' })
export class CourseStructureService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  async preview(courseId: string, file: File): Promise<{ data: ParsedStructure; warning?: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(
      this.http.post<{ data: ParsedStructure; warning?: string }>(
        `${this.api}/courses/${courseId}/structure/preview`, fd
      )
    );
  }

  async apply(courseId: string, structure: ParsedStructure): Promise<ApplyResult> {
    const res = await firstValueFrom(
      this.http.post<{ data: ApplyResult }>(`${this.api}/courses/${courseId}/structure/apply`, structure)
    );
    return res.data;
  }
}
