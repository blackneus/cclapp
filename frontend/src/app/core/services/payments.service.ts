import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Period {
  year: number;
  month: number;
}

export interface Payment {
  id: string;
  tenant_id: string;
  enrollment_id: string;
  kind: 'enrollment' | 'monthly';
  amount: string;
  reference_code: string;
  status: 'awaiting' | 'verifying' | 'paid' | 'rejected';
  receipt_file_url: string;
  receipt_group_id?: string;
  period_year?: number;
  period_month?: number;
  deposited_at?: string;
  verified_at?: string;
  verified_by?: string;
  rejection_reason?: string;
  created_at: string;
  // Joined (admin list)
  student_id?: string;
  student_name?: string;
  student_email?: string;
  course_id?: string;
  course_title?: string;
}

export interface EnrollmentPaymentSummary {
  data: Payment[];
  pending_periods: Period[];
  monthly_fee: string;
  enrollment_fee: string;
  enrollment_fee_status: 'not_required' | 'unpaid' | 'verifying' | 'paid';
  course_title: string;
  enrolled_at: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  async listPending(): Promise<Payment[]> {
    const res = await firstValueFrom(
      this.http.get<{ data: Payment[] }>(`${this.api}/payments/pending`)
    );
    return res.data ?? [];
  }

  async listMine(): Promise<Payment[]> {
    const res = await firstValueFrom(
      this.http.get<{ data: Payment[] }>(`${this.api}/payments/my`)
    );
    return res.data ?? [];
  }

  async summaryForEnrollment(enrollmentId: string): Promise<EnrollmentPaymentSummary> {
    return await firstValueFrom(
      this.http.get<EnrollmentPaymentSummary>(`${this.api}/enrollments/${enrollmentId}/payments`)
    );
  }

  async cash(payload: {
    enrollmentId: string;
    includeEnrollmentFee: boolean;
    periods: Period[];
  }): Promise<Payment[]> {
    const res = await firstValueFrom(
      this.http.post<{ data: Payment[] }>(`${this.api}/payments/cash`, {
        enrollment_id: payload.enrollmentId,
        include_enrollment_fee: payload.includeEnrollmentFee,
        periods: payload.periods,
      })
    );
    return res.data ?? [];
  }

  upload(payload: {
    enrollmentId: string;
    includeEnrollmentFee: boolean;
    periods: Period[];
    file: File;
    onProgress?: (pct: number) => void;
  }): Promise<Payment[]> {
    const fd = new FormData();
    fd.append('enrollment_id', payload.enrollmentId);
    fd.append('include_enrollment_fee', payload.includeEnrollmentFee ? 'true' : 'false');
    fd.append('periods', JSON.stringify(payload.periods));
    fd.append('file', payload.file, payload.file.name);
    const req = new HttpRequest('POST', `${this.api}/payments`, fd, { reportProgress: true });
    return new Promise((resolve, reject) => {
      this.http.request<{ data: Payment[] }>(req).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            payload.onProgress?.(Math.round((event.loaded / event.total) * 100));
          } else if (event.type === HttpEventType.Response) {
            resolve(event.body?.data ?? []);
          }
        },
        error: (err) => reject(err),
      });
    });
  }

  async uploadFromDrive(payload: {
    enrollmentId: string;
    includeEnrollmentFee: boolean;
    periods: Period[];
    driveFileId: string;
  }): Promise<Payment[]> {
    const fd = new FormData();
    fd.append('enrollment_id', payload.enrollmentId);
    fd.append('include_enrollment_fee', payload.includeEnrollmentFee ? 'true' : 'false');
    fd.append('periods', JSON.stringify(payload.periods));
    fd.append('drive_file_id', payload.driveFileId);
    const res = await firstValueFrom(
      this.http.post<{ data: Payment[] }>(`${this.api}/payments`, fd)
    );
    return res.data ?? [];
  }

  async verifyGroup(groupId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/payments/groups/${groupId}/verify`, {})
    );
  }

  async rejectGroup(groupId: string, reason: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/payments/groups/${groupId}/reject`, { reason })
    );
  }
}
