import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CoursesService } from '../../core/services/courses.service';
import { AuthService } from '../../core/auth/auth.service';
import { UsersService, User } from '../../core/services/users.service';
import { uploadToDriveWithProgress } from '../../core/utils/drive-upload';
import { ToastService } from '../../core/ui/toast.service';

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

          <div class="field">
            <label>Imagen del curso</label>
            <div class="cover-row">
              <div class="cover-preview" [class.empty]="!coverImageUrl()">
                @if (coverPreviewUrl(); as src) {
                  <img [src]="src" alt="Portada"/>
                } @else {
                  <span>Sin imagen</span>
                }
              </div>
              <div class="cover-actions">
                <input #fileInput type="file" accept="image/*" (change)="onCoverFile($event)" hidden />
                <button type="button" class="btn ghost sm" (click)="fileInput.click()" [disabled]="uploadingCover()">
                  {{ uploadingCover() ? 'Subiendo… ' + coverPct() + '%' : (coverImageUrl() ? 'Cambiar imagen' : 'Subir imagen') }}
                </button>
                @if (coverImageUrl() && !uploadingCover()) {
                  <button type="button" class="btn ghost sm" (click)="removeCover()">Quitar</button>
                }
                @if (uploadingCover()) {
                  <div class="cover-progress"><i [style.width.%]="coverPct()"></i></div>
                }
              </div>
            </div>
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
  styles: [`
    .cover-row { display:flex; gap:16px; align-items:flex-start }
    .cover-preview { width:200px; height:120px; border-radius:10px; background:#1a2547; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.6); font-size:13px; overflow:hidden; flex-shrink:0 }
    .cover-preview img { width:100%; height:100%; object-fit:cover }
    .cover-preview.empty { background:#f4f6fb; color:#6b7088; border:1px dashed #d3d6e0 }
    .cover-actions { display:flex; flex-direction:column; gap:8px; align-items:flex-start }
    .cover-progress { width:200px; height:4px; background:#e3e5ec; border-radius:2px; overflow:hidden }
    .cover-progress i { display:block; height:100%; background:#3a4cce; transition:width .2s ease }
  `],
})
export class CourseFormComponent implements OnInit {
  private readonly coursesService = inject(CoursesService);
  private readonly usersService = inject(UsersService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly teachers = signal<User[]>([]);
  readonly coverImageUrl = signal('');
  readonly uploadingCover = signal(false);
  readonly coverPct = signal(0);

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
        this.coverImageUrl.set(course.cover_image_url ?? '');
      } catch {
        this.error.set('No se pudo cargar el curso.');
      }
    }
  }

  async onCoverFile(ev: Event): Promise<void> {
    const target = ev.target as HTMLInputElement;
    const f = target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      this.toast.error('El archivo debe ser una imagen.');
      target.value = '';
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      this.toast.error('Imagen demasiado grande (máx 8 MB).');
      target.value = '';
      return;
    }
    this.uploadingCover.set(true);
    this.coverPct.set(0);
    try {
      const res = await uploadToDriveWithProgress(
        this.http, f, (pct) => this.coverPct.set(pct), 'upload',
        this.courseId || undefined,
      );
      this.coverImageUrl.set(`https://drive.google.com/uc?export=view&id=${res.file_id}`);
      this.toast.success('Imagen cargada.');
    } catch {
      this.toast.error('No se pudo subir la imagen.');
    } finally {
      this.uploadingCover.set(false);
      target.value = '';
    }
  }

  removeCover(): void {
    this.coverImageUrl.set('');
  }

  coverPreviewUrl(): string | null {
    const url = this.coverImageUrl();
    if (!url) return null;
    const m = url.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w800` : url;
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
          cover_image_url: this.coverImageUrl(),
          ...(this.auth.isAdmin() && this.teacherId ? { teacher_id: this.teacherId } : {}),
        });
      } else {
        await this.coursesService.create({
          title: this.title,
          description: this.description,
          price: priceStr || '0',
          cover_image_url: this.coverImageUrl(),
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
