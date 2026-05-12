import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { EnrollmentsService, Enrollment } from '../../core/services/enrollments.service';
import { UploadReceiptModalComponent } from '../payments/upload-receipt-modal.component';

interface MyCourseRow {
  enrollment: Enrollment;
  locked: boolean;
}

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterLink, UploadReceiptModalComponent],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Aprendizaje</p>
        <h1>Mis cursos</h1>
      </div>
    </div>

    @if (loading()) {
      <p class="muted">Cargando cursos…</p>
    } @else if (error()) {
      <p class="login-error">{{ error() }}</p>
    } @else if (rows().length === 0) {
      <div class="card card-pad" style="text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:12px">📚</div>
        <h3 style="margin-bottom:8px">No tienes cursos disponibles</h3>
        <p class="muted">Inscríbete a un curso desde la sección de cursos.</p>
      </div>
    } @else {
      <div class="my-courses-grid">
        @for (row of rows(); track row.enrollment.id) {
          <article class="my-course-card" [class.locked]="row.locked">
            <div class="my-course-thumb">
              @if (imageUrl(row.enrollment.course_cover_image_url); as src) {
                <img [src]="src" [alt]="row.enrollment.course_title ?? ''" loading="lazy"/>
              } @else {
                <div class="my-course-thumb-placeholder">📖</div>
              }
              <span class="my-course-badge" [class]="statusClass(row.enrollment.payment_status)">
                {{ statusLabel(row.enrollment.payment_status) }}
              </span>
              @if (row.locked) {
                <div class="lock-overlay">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
              }
            </div>
            <div class="my-course-body">
              <h3 class="my-course-title">{{ row.enrollment.course_title }}</h3>
              @if (row.enrollment.payment_status === 'rejected' && row.enrollment.last_rejection_reason) {
                <div class="reject-note">
                  <strong>Comprobante rechazado:</strong> {{ row.enrollment.last_rejection_reason }}
                </div>
              }
              <div class="my-course-foot">
                @if (row.locked) {
                  <button class="btn primary sm" (click)="openUpload(row.enrollment.id)">
                    Subir comprobante
                  </button>
                } @else {
                  <a [routerLink]="['/courses', row.enrollment.course_id, 'learn']" class="btn primary sm">▶ Entrar</a>
                }
              </div>
            </div>
          </article>
        }
      </div>
    }

    @if (uploadFor(); as eid) {
      <app-upload-receipt-modal [enrollmentId]="eid" (closed)="onUploadClosed($event)" />
    }
  `,
  styles: [`
    .my-course-card { position:relative; background:#fff; border:1px solid #e3e5ec; border-radius:12px; overflow:hidden; display:flex; flex-direction:column }
    .my-course-card.locked { opacity:.85 }
    .my-course-thumb { position:relative; aspect-ratio:16/9; background:#1a2547; display:flex; align-items:center; justify-content:center; color:#fff; overflow:hidden }
    .my-course-thumb img { width:100%; height:100%; object-fit:cover; display:block }
    .my-course-thumb-placeholder { font-size:38px }
    .lock-overlay { position:absolute; inset:0; background:rgba(7,12,40,.55); display:flex; align-items:center; justify-content:center; color:#fff }
    .my-course-badge { position:absolute; top:8px; right:8px; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:600; text-transform:uppercase; background:#fff; color:#1a2547 }
    .my-course-badge.warn { background:#fff4d8; color:#9a6800 }
    .my-course-badge.danger { background:#ffd8d8; color:#a02020 }
    .my-course-badge.success { background:#d6f5dd; color:#1e6f3a }
    .my-course-body { padding:14px }
    .my-course-title { margin:0 0 10px; font-size:15px; color:#1a2547 }
    .my-course-foot { display:flex; justify-content:flex-end }
    .reject-note { margin:0 0 10px; padding:8px 10px; background:#fff0f0; border:1px solid #ffd0d0; border-radius:8px; color:#a02020; font-size:12.5px; line-height:1.4 }
  `],
})
export class MyCoursesComponent implements OnInit {
  private readonly enrollments = inject(EnrollmentsService);
  private readonly router = inject(Router);

  readonly rows = signal<MyCourseRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploadFor = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
    // Si venimos de la lista con `?upload=<enrollmentId>` lo abrimos.
    const url = new URL(window.location.href);
    const upload = url.searchParams.get('upload');
    if (upload) {
      this.uploadFor.set(upload);
      url.searchParams.delete('upload');
      this.router.navigateByUrl(url.pathname);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.enrollments.listMine();
      this.rows.set(list.map(e => ({
        enrollment: e,
        locked: e.payment_status !== 'paid',
      })));
    } catch {
      this.error.set('No se pudieron cargar tus cursos.');
    } finally {
      this.loading.set(false);
    }
  }

  openUpload(enrollmentId: string): void {
    this.uploadFor.set(enrollmentId);
  }

  async onUploadClosed(event: { uploaded: boolean }): Promise<void> {
    this.uploadFor.set(null);
    if (event.uploaded) await this.reload();
  }

  /** Convierte cualquier URL de Drive a la CDN lh3 que sí carga en <img>. */
  imageUrl(url?: string): string | null {
    if (!url) return null;
    const m = url.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w800`;
    return url;
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      paid: 'success',
      awaiting_verification: 'warn',
      awaiting_payment: 'warn',
      rejected: 'danger',
    };
    return map[s] ?? '';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      paid: 'Al día',
      awaiting_verification: 'En revisión',
      awaiting_payment: 'Pago pendiente',
      rejected: 'Rechazado',
      refunded: 'Reembolsado',
    };
    return map[s] ?? s;
  }
}
