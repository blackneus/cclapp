import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  payment_status: string;
  enrolled_at: string;
  student_name?: string;
  student_email?: string;
  course_title?: string;
}

@Injectable({ providedIn: 'root' })
export class EnrollmentsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  async listByCourse(courseId: string): Promise<Enrollment[]> {
    const res = await firstValueFrom(
      this.http.get<{ data: Enrollment[] }>(`${this.api}/courses/${courseId}/enrollments`)
    );
    return res.data ?? [];
  }

  async create(courseId: string, studentId: string, paymentStatus: string = 'paid'): Promise<Enrollment> {
    const res = await firstValueFrom(
      this.http.post<{ data: Enrollment }>(`${this.api}/courses/${courseId}/enrollments`, {
        student_id: studentId,
        payment_status: paymentStatus,
      })
    );
    return res.data;
  }

  async delete(courseId: string, enrollmentId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/courses/${courseId}/enrollments/${enrollmentId}`));
  }
}
