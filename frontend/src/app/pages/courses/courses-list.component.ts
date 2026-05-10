import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { CoursesService, Course } from '../../core/services/courses.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-courses-list',
  standalone: true,
  imports: [RouterLink, SlicePipe],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1>Cursos</h1>
      </div>
      @if (auth.isAdmin() || auth.isTeacher()) {
        <div class="actions">
          <a routerLink="/courses/new" class="btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo curso
          </a>
        </div>
      }
    </div>

    @if (loading()) {
      <p class="muted">Cargando cursos...</p>
    } @else if (error()) {
      <p class="login-error">{{ error() }}</p>
    } @else {
      <div class="card">
        <div class="card-head">
          <h3>Todos los cursos</h3>
          <span class="chip">{{ courses().length }} total</span>
        </div>
        <table class="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Precio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (course of courses(); track course.id) {
              <tr>
                <td>
                  <div style="font-weight:500">{{ course.title }}</div>
                  @if (course.description) {
                    <div style="font-size:var(--fs-12);color:var(--c-muted);margin-top:2px">
                      {{ course.description | slice:0:60 }}{{ course.description.length > 60 ? '…' : '' }}
                    </div>
                  }
                </td>
                <td class="mono">{{ fmtPrice(course.price) }}</td>
                <td>
                  <span class="chip" [class]="statusClass(course.status)">
                    <span class="dot"></span>{{ statusLabel(course.status) }}
                  </span>
                </td>
                <td style="display:flex;gap:6px;flex-wrap:wrap">
                  @if (auth.isAdmin() || auth.isTeacher()) {
                    <a [routerLink]="['/courses', course.id, 'edit']" class="btn sm ghost">Editar</a>
                    <a [routerLink]="['/courses', course.id, 'build']" class="btn sm ghost">Construir</a>
                    <a [routerLink]="['/courses', course.id, 'enrollments']" class="btn sm ghost">Alumnos</a>
                    <a [routerLink]="['/courses', course.id, 'lessons', 'new']" class="btn sm primary">+ Clase</a>
                    @if (auth.isAdmin() && course.status === 'draft') {
                      <button class="btn sm danger" (click)="onDelete(course)" [disabled]="deletingId() === course.id">
                        {{ deletingId() === course.id ? 'Borrando…' : 'Borrar' }}
                      </button>
                    }
                  }
                  @if (auth.isStudent()) {
                    <a [routerLink]="['/courses', course.id, 'learn']" class="btn sm primary">Ver curso</a>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="empty">No hay cursos registrados.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CoursesListComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);
  private readonly toast = inject(ToastService);

  readonly courses = signal<Course[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

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
    return isNaN(n) ? '$0.00' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  }

  statusClass(status: string): string {
    const map: Record<string, string> = { published: 'success', archived: 'danger', draft: '' };
    return map[status] ?? '';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = { published: 'Publicado', archived: 'Archivado', draft: 'Borrador' };
    return map[status] ?? status;
  }

  async onDelete(course: Course): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Borrar curso',
      message: `¿Borrar el curso "${course.title}"? Solo cursos en borrador se pueden borrar. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    this.deletingId.set(course.id);
    try {
      await this.coursesService.delete(course.id);
      this.courses.update(list => list.filter(c => c.id !== course.id));
      this.toast.success('Curso borrado.');
    } catch (err: unknown) {
      const e = err as { error?: { error?: { code?: string; message?: string } } };
      this.toast.error(e.error?.error?.message ?? 'No se pudo borrar el curso.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
