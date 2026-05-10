import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Course {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  cover_image_url: string;
  price: string;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}

interface CoursesResponse {
  message: string;
  data: Course[];
}

interface CourseResponse {
  message: string;
  data: Course;
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  async list(): Promise<Course[]> {
    const res = await firstValueFrom(
      this.http.get<CoursesResponse>(`${this.api}/courses`),
    );
    return res.data;
  }

  async get(id: string): Promise<Course> {
    const res = await firstValueFrom(
      this.http.get<CourseResponse>(`${this.api}/courses/${id}`),
    );
    return res.data;
  }

  async create(payload: { title: string; description: string; price: string; teacher_id?: string }): Promise<Course> {
    const res = await firstValueFrom(
      this.http.post<CourseResponse>(`${this.api}/courses`, payload),
    );
    return res.data;
  }

  async update(id: string, payload: Partial<Pick<Course, 'title' | 'description' | 'price' | 'status' | 'teacher_id'>>): Promise<Course> {
    const res = await firstValueFrom(
      this.http.put<CourseResponse>(`${this.api}/courses/${id}`, payload),
    );
    return res.data;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/courses/${id}`));
  }
}
