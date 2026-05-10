import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { CoursesService, Course } from '../../core/services/courses.service';

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [RouterLink, SlicePipe],
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
    } @else if (courses().length === 0) {
      <div class="card card-pad" style="text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:12px">📚</div>
        <h3 style="margin-bottom:8px">No tienes cursos disponibles</h3>
        <p class="muted">Cuando te inscribas en un curso aparecerá aquí.</p>
      </div>
    } @else {
      <div class="my-courses-grid">
        @for (course of courses(); track course.id) {
          <a [routerLink]="['/courses', course.id, 'learn']" class="my-course-card">
            <div class="my-course-thumb">
              @if (course.cover_image_url) {
                <img [src]="course.cover_image_url" [alt]="course.title"/>
              } @else {
                <div class="my-course-thumb-placeholder">📖</div>
              }
              <span class="my-course-badge" [class]="statusClass(course.status)">{{ statusLabel(course.status) }}</span>
            </div>
            <div class="my-course-body">
              <h3 class="my-course-title">{{ course.title }}</h3>
              @if (course.description) {
                <p class="my-course-desc">{{ course.description | slice:0:120 }}{{ course.description.length > 120 ? '…' : '' }}</p>
              }
              <div class="my-course-foot">
                <span class="muted" style="font-size:12px">{{ fmtPrice(course.price) }}</span>
                <span class="btn primary sm">▶ Entrar</span>
              </div>
            </div>
          </a>
        }
      </div>
    }
  `,
})
export class MyCoursesComponent implements OnInit {
  private readonly coursesService = inject(CoursesService);

  readonly courses = signal<Course[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.coursesService.list();
      this.courses.set(data ?? []);
    } catch {
      this.error.set('No se pudieron cargar los cursos.');
    } finally {
      this.loading.set(false);
    }
  }

  fmtPrice(price: string): string {
    const n = parseFloat(price);
    if (isNaN(n) || n === 0) return 'Gratis';
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' MXN';
  }

  statusClass(status: string): string {
    const map: Record<string, string> = { published: 'success', archived: 'danger', draft: 'warn' };
    return map[status] ?? '';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = { published: 'Publicado', archived: 'Archivado', draft: 'Borrador' };
    return map[status] ?? status;
  }
}
