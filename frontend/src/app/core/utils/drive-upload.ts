import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DriveUploadResult {
  file_id: string;
  name: string;
  mime_type: string;
  duration_seconds?: number;
  original_size?: number;
  compressed_size?: number;
}

export async function uploadToDrive(http: HttpClient, file: File, courseId?: string): Promise<DriveUploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  const url = `${environment.apiBaseUrl}/upload${courseId ? `?course_id=${courseId}` : ''}`;
  const res = await firstValueFrom(http.post<{ data: DriveUploadResult }>(url, fd));
  return res.data;
}

export async function driveMakePublic(http: HttpClient, fileId: string): Promise<void> {
  await firstValueFrom(http.post(`${environment.apiBaseUrl}/drive/make-public`, { file_id: fileId }));
}

export function uploadToDriveWithProgress(
  http: HttpClient,
  file: File,
  onProgress: (pct: number) => void,
  endpoint: 'upload' | 'upload-video' = 'upload',
  courseId?: string,
): Promise<DriveUploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  const url = `${environment.apiBaseUrl}/${endpoint}${courseId ? `?course_id=${courseId}` : ''}`;
  const req = new HttpRequest('POST', url, fd, {
    reportProgress: true,
  });
  return new Promise((resolve, reject) => {
    http.request<{ data: DriveUploadResult }>(req).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response) {
          const body = event.body;
          if (body?.data) resolve(body.data);
          else reject(new Error('upload returned no data'));
        }
      },
      error: (err) => reject(err),
    });
  });
}
