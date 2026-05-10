import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CoursesService } from '../../core/services/courses.service';
import { AuthService } from '../../core/auth/auth.service';
import { UsersService, User } from '../../core/services/users.service';

@Component({
  selector: 'app-course-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">
          <a routerLink="/courses" style="color:var(--c-primary)">Cursos</a> /
        </p>
        <h1>{{ isEdit() ? 'Editar curso' : 'Nuevo curso' }}</h1>
      </div>
    </div>

    @if (error()) {
      <p class="login-error" style="margin-bottom:var(--s-5)">{{ error() }}</p>
    }

    <div class="card" style="max-width:640px">
      <form (ngSubmit)="onSubmit()">
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--s-5)">
          <div class="field">
            <label for="title">Título *</label>
            <input id="title" class="input" type="text" [(ngModel)]="title" name="title"
              placeholder="Ej. Curso de Matemáticas Básicas" required />
          </div>
          <div class="field">
            <label for="description">Descripción</label>
            <textarea id="description" class="textarea" [(ngModel)]="description"
              name="description" placeholder="Describe el contenido del curso..."></textarea>
          </div>

          @if (auth.isAdmin()) {
            <div class="field">
              <label for="teacher">Profesor asignado *</label>
              <select id="teacher" class="select" [(ngModel)]="teacherId" name="teacher_id">
                <option [ngValue]="''">— Selecciona un profesor —</option>
                @for (t of teachers(); track t.id) {
                  <option [ngValue]="t.id">{{ t.full_name }} ({{ t.email }})</option>
                }
              </select>
              @if (teachers().length === 0) {
                <span class="muted" style="font-size:12px">
                  No hay profesores. <a routerLink="/people" style="color:var(--c-primary)">Crea uno</a>.
                </span>
              }
            </div>
          }

          <div class="field" style="max-width:200px">
            <label for="price">Precio (MXN)</label>
            <input id="price" class="input" type="number" min="0" step="0.01"
              [(ngModel)]="price" name="price" placeholder="0.00" />
          </div>
        </div>
        <div class="card-foot">
          <a routerLink="/courses" class="btn ghost">Cancelar</a>
          <button type="submit" class="btn primary" [disabled]="saving()">
            {{ saving() ? 'Guardando...' : (isEdit() ? 'Guardar cambios' : 'Crear curso') }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class CourseFormComponent implements OnInit {
  private readonly coursesService = inject(CoursesService);
  private readonly usersService = inject(UsersService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly teachers = signal<User[]>([]);

  title = '';
  description = '';
  price = '0';
  teacherId = '';
  private courseId = '';

  async ngOnInit(): Promise<void> {
    if (this.auth.isAdmin()) {
      this.usersService.list('teacher').then(t => this.teachers.set(t)).catch(() => this.teachers.set([]));
    }

    const id = this.route.snapshot.params['id'] as string | undefined;
    if (id) {
      this.isEdit.set(true);
      this.courseId = id;
      try {
        const course = await this.coursesService.get(id);
        this.title = course.title;
        this.description = course.description;
        this.price = course.price;
        this.teacherId = course.teacher_id ?? '';
      } catch {
        this.error.set('No se pudo cargar el curso.');
      }
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.title.trim()) {
      this.error.set('El título es obligatorio.');
      return;
    }
    if (this.auth.isAdmin() && !this.teacherId) {
      this.error.set('Debes asignar un profesor.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const priceStr = String(this.price ?? '0');
      if (this.isEdit()) {
        await this.coursesService.update(this.courseId, {
          title: this.title,
          description: this.description,
          price: priceStr,
          ...(this.auth.isAdmin() && this.teacherId ? { teacher_id: this.teacherId } : {}),
        });
      } else {
        await this.coursesService.create({
          title: this.title,
          description: this.description,
          price: priceStr || '0',
          ...(this.auth.isAdmin() && this.teacherId ? { teacher_id: this.teacherId } : {}),
        });
      }
      await this.router.navigateByUrl('/courses');
    } catch {
      this.error.set('Ocurrió un error al guardar el curso.');
    } finally {
      this.saving.set(false);
    }
  }
}
