import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { CoursesService, Course } from '../../core/services/courses.service';
import { ModulesService, Module } from '../../core/services/modules.service';
import { LessonsService, Lesson, Attachment } from '../../core/services/lessons.service';
import { DrivePickerService } from '../../core/services/drive-picker.service';
import { environment } from '../../../environments/environment';

interface BuilderLesson extends Lesson {
  _editing?: boolean;
}

interface BuilderModule extends Module {
  lessons: BuilderLesson[];
  _open?: boolean;
}

@Component({
  selector: 'app-course-builder',
  standalone: true,
  imports: [FormsModule, DragDropModule, RouterLink],
  template: `
    <div class="builder-wrap">
      <div class="builder-topbar">
        <a [routerLink]="['/courses']" class="btn ghost sm">← Volver</a>
        <span class="builder-title">{{ course()?.title ?? 'Cargando…' }}</span>
        <a [routerLink]="['/courses', courseId, 'learn']" class="btn ghost sm">Vista previa →</a>
      </div>

      @if (error()) {
        <p class="login-error">{{ error() }}</p>
      }

      <div class="builder-body">
        <!-- Panel izquierdo: módulos + lecciones -->
        <div class="builder-left">
          <div cdkDropList (cdkDropListDropped)="dropModule($event)" class="modules-list">
            @for (mod of modules(); track mod.id) {
              <div class="builder-module" cdkDrag>
                <div class="module-header" (click)="toggleModule(mod)">
                  <span cdkDragHandle class="drag-handle">⠿</span>
                  <span class="module-title">{{ mod.title }}</span>
                  <button class="btn icon sm" (click)="$event.stopPropagation(); startEditModule(mod)">✎</button>
                  <button class="btn icon sm danger" (click)="$event.stopPropagation(); deleteModule(mod)">✕</button>
                  <span class="chevron">{{ mod._open ? '▾' : '▸' }}</span>
                </div>

                @if (mod._open) {
                  <div cdkDropList [cdkDropListData]="mod.lessons"
                       (cdkDropListDropped)="dropLesson($event, mod)" class="lessons-list">
                    @for (lesson of mod.lessons; track lesson.id) {
                      <div class="builder-lesson" cdkDrag
                           [class.active]="selectedLesson()?.id === lesson.id"
                           (click)="selectLesson(lesson, mod)">
                        <span cdkDragHandle class="drag-handle">⠿</span>
                        <span class="lesson-title">{{ lesson.title }}</span>
                      </div>
                    }
                  </div>
                  <button class="btn ghost sm add-lesson-btn" (click)="addLesson(mod)">+ Clase</button>
                }
              </div>
            }
          </div>

          <button class="btn primary sm add-module-btn" (click)="addModule()">+ Módulo</button>
        </div>

        <!-- Panel derecho: form de lección seleccionada -->
        <div class="builder-right">
          @if (selectedLesson()) {
            <div class="lesson-form">
              <h3>{{ selectedLesson()!.id ? 'Editar clase' : 'Nueva clase' }}</h3>

              <div class="field">
                <label>Título *</label>
                <input class="input" [(ngModel)]="lessonForm.title" placeholder="Nombre de la clase" />
              </div>

              <div class="field">
                <label>Descripción</label>
                <textarea class="textarea" [(ngModel)]="lessonForm.description" rows="3"
                          placeholder="Descripción de la clase"></textarea>
              </div>

              <div class="field">
                <label>Video</label>
                <div class="drive-field-row">
                  <select class="select sm" [(ngModel)]="videoSource">
                    <option value="drive">Google Drive</option>
                    <option value="upload">Subir archivo</option>
                  </select>
                  @if (videoSource === 'drive') {
                    <button class="btn ghost sm" (click)="pickVideo()" [disabled]="saving()">
                      🎬 {{ lessonForm.video_storage_ref ? 'Cambiar video' : 'Seleccionar de Drive' }}
                    </button>
                    @if (lessonForm.video_storage_ref) {
                      <span class="file-name muted">{{ lessonForm._videoName }}</span>
                    }
                  } @else {
                    <input type="file" accept="video/*" class="input sm" (change)="uploadVideo($event)"
                           [disabled]="uploading()" />
                    @if (uploading()) { <span class="muted">Subiendo…</span> }
                    @if (lessonForm.video_storage_ref) { <span class="muted file-name">✓ Guardado en Drive</span> }
                  }
                </div>
              </div>

              <div class="field">
                <label>Duración (segundos)</label>
                <input class="input" type="number" min="0" [(ngModel)]="lessonForm.duration_seconds" />
              </div>

              <div class="field">
                <label>Archivos adjuntos (PDFs)</label>
                <div class="attachments-list">
                  @for (att of lessonForm.attachments; track att.id) {
                    <div class="attachment-row">
                      <span>📄 {{ att.name }}</span>
                      <button class="btn icon sm danger" (click)="removeAttachment(att)"
                              [disabled]="saving()">✕</button>
                    </div>
                  }
                </div>
                <div class="drive-field-row" style="margin-top:8px">
                  <button class="btn ghost sm" (click)="pickPdf()" [disabled]="saving()">
                    + Agregar PDF (Drive)
                  </button>
                  <span style="margin:0 8px">o</span>
                  <input type="file" accept="application/pdf" class="input sm"
                         (change)="uploadPdf($event)" [disabled]="uploading()" />
                  @if (uploading()) { <span class="muted">Subiendo…</span> }
                </div>
              </div>

              @if (saveError()) { <p class="login-error">{{ saveError() }}</p> }

              <div style="display:flex;gap:8px;margin-top:16px">
                <button class="btn primary" (click)="saveLesson()" [disabled]="saving()">
                  {{ saving() ? 'Guardando…' : 'Guardar clase' }}
                </button>
                <button class="btn ghost" (click)="selectedLesson.set(null)">Cancelar</button>
                @if (selectedLesson()!.id) {
                  <button class="btn ghost danger" (click)="deleteLesson()" style="margin-left:auto"
                          [disabled]="saving()">Eliminar</button>
                }
              </div>
            </div>
          } @else if (editingModule()) {
            <div class="lesson-form">
              <h3>{{ editingModule()!.id ? 'Editar módulo' : 'Nuevo módulo' }}</h3>
              <div class="field">
                <label>Título *</label>
                <input class="input" [(ngModel)]="moduleForm.title" placeholder="Nombre del módulo" />
              </div>
              <div class="field">
                <label>Descripción</label>
                <textarea class="textarea" [(ngModel)]="moduleForm.description" rows="2"></textarea>
              </div>
              @if (saveError()) { <p class="login-error">{{ saveError() }}</p> }
              <div style="display:flex;gap:8px;margin-top:16px">
                <button class="btn primary" (click)="saveModule()" [disabled]="saving()">
                  {{ saving() ? 'Guardando…' : 'Guardar módulo' }}
                </button>
                <button class="btn ghost" (click)="editingModule.set(null)">Cancelar</button>
              </div>
            </div>
          } @else {
            <div class="builder-empty">
              <p class="muted">Selecciona una clase para editarla<br>o agrega un módulo para comenzar.</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class CourseBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly coursesSvc = inject(CoursesService);
  private readonly modulesSvc = inject(ModulesService);
  private readonly lessonsSvc = inject(LessonsService);
  private readonly pickerSvc = inject(DrivePickerService);
  private readonly http = inject(HttpClient);

  courseId = '';
  course = signal<Course | null>(null);
  modules = signal<BuilderModule[]>([]);
  selectedLesson = signal<BuilderLesson | null>(null);
  editingModule = signal<BuilderModule | null>(null);
  saving = signal(false);
  uploading = signal(false);
  error = signal<string | null>(null);
  saveError = signal<string | null>(null);

  videoSource: 'drive' | 'upload' = 'drive';

  lessonForm: {
    title: string;
    description: string;
    video_storage_ref: string;
    video_storage_provider: string;
    duration_seconds: number;
    attachments: Attachment[];
    _videoName?: string;
    _moduleId?: string;
    _lessonId?: string;
  } = { title: '', description: '', video_storage_ref: '', video_storage_provider: 'drive', duration_seconds: 0, attachments: [] };

  moduleForm = { title: '', description: '' };

  async ngOnInit(): Promise<void> {
    this.courseId = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const [course, outline] = await Promise.all([
        this.coursesSvc.get(this.courseId),
        firstValueFrom(this.http.get<{ data: { modules: BuilderModule[] } }>(`${environment.apiBaseUrl}/courses/${this.courseId}/outline`)).catch(() => ({ data: { modules: [] } })),
      ]);
      this.course.set(course);
      const mods = (outline.data?.modules ?? []).map((m: BuilderModule) => ({ ...m, _open: true, lessons: (m.lessons ?? []) as BuilderLesson[] }));
      this.modules.set(mods);
    } catch {
      this.error.set('No se pudo cargar el curso.');
    }
  }

  toggleModule(mod: BuilderModule): void {
    mod._open = !mod._open;
  }

  addModule(): void {
    this.selectedLesson.set(null);
    this.moduleForm = { title: '', description: '' };
    this.editingModule.set({ id: '', course_id: this.courseId, title: '', description: '', order_index: 0, lessons: [], _open: true } as BuilderModule);
  }

  startEditModule(mod: BuilderModule): void {
    this.selectedLesson.set(null);
    this.moduleForm = { title: mod.title, description: mod.description };
    this.editingModule.set(mod);
  }

  async saveModule(): Promise<void> {
    if (!this.moduleForm.title.trim()) { this.saveError.set('El título es requerido.'); return; }
    this.saving.set(true); this.saveError.set(null);
    try {
      const mod = this.editingModule()!;
      if (mod.id) {
        const updated = await this.modulesSvc.update(this.courseId, mod.id, this.moduleForm);
        this.modules.update(list => list.map(m => m.id === mod.id ? { ...m, ...updated } : m));
      } else {
        const created = await this.modulesSvc.create(this.courseId, this.moduleForm) as BuilderModule;
        created.lessons = [];
        created._open = true;
        this.modules.update(list => [...list, created]);
      }
      this.editingModule.set(null);
    } catch { this.saveError.set('Error al guardar el módulo.'); }
    finally { this.saving.set(false); }
  }

  async deleteModule(mod: BuilderModule): Promise<void> {
    if (!confirm(`¿Eliminar el módulo "${mod.title}" y todas sus clases?`)) return;
    await this.modulesSvc.delete(this.courseId, mod.id);
    this.modules.update(list => list.filter(m => m.id !== mod.id));
    if (this.selectedLesson()?.module_id === mod.id) this.selectedLesson.set(null);
  }

  selectLesson(lesson: BuilderLesson, mod: BuilderModule): void {
    this.editingModule.set(null);
    this.selectedLesson.set(lesson);
    this.videoSource = 'drive';
    this.lessonForm = {
      title: lesson.title,
      description: lesson.description,
      video_storage_ref: lesson.video_storage_ref,
      video_storage_provider: lesson.video_storage_provider || 'drive',
      duration_seconds: lesson.duration_seconds,
      attachments: [...(lesson.attachments ?? [])],
      _videoName: lesson.video_storage_ref ? '(video guardado)' : '',
      _moduleId: mod.id,
      _lessonId: lesson.id,
    };
  }

  addLesson(mod: BuilderModule): void {
    const draft: BuilderLesson = {
      id: '', module_id: mod.id, title: '', description: '',
      order_index: mod.lessons.length, video_storage_provider: 'drive',
      video_storage_ref: '', duration_seconds: 0, attachments: [], _editing: true,
    };
    this.selectLesson(draft, mod);
  }

  async saveLesson(): Promise<void> {
    if (!this.lessonForm.title.trim()) { this.saveError.set('El título es requerido.'); return; }
    this.saving.set(true); this.saveError.set(null);
    const moduleId = this.lessonForm._moduleId!;
    const lessonId = this.lessonForm._lessonId;
    const payload = {
      title: this.lessonForm.title,
      description: this.lessonForm.description,
      video_storage_provider: this.lessonForm.video_storage_provider || 'drive',
      video_storage_ref: this.lessonForm.video_storage_ref,
      duration_seconds: this.lessonForm.duration_seconds,
    };
    try {
      let saved: Lesson;
      if (lessonId) {
        saved = await this.lessonsSvc.update(this.courseId, moduleId, lessonId, payload);
      } else {
        saved = await this.lessonsSvc.create(this.courseId, moduleId, payload);
      }
      saved.attachments = this.lessonForm.attachments;
      this.modules.update(list => list.map(m => {
        if (m.id !== moduleId) return m;
        const existing = m.lessons.find(l => l.id === saved.id);
        if (existing) {
          return { ...m, lessons: m.lessons.map(l => l.id === saved.id ? { ...saved } : l) };
        }
        return { ...m, lessons: [...m.lessons.filter(l => l.id !== ''), saved] };
      }));
      this.selectedLesson.set(null);
    } catch { this.saveError.set('Error al guardar la clase.'); }
    finally { this.saving.set(false); }
  }

  async deleteLesson(): Promise<void> {
    const l = this.selectedLesson()!;
    if (!l.id || !confirm(`¿Eliminar la clase "${l.title}"?`)) return;
    this.saving.set(true);
    try {
      await this.lessonsSvc.delete(this.courseId, l.module_id, l.id);
      this.modules.update(list => list.map(m => m.id === l.module_id
        ? { ...m, lessons: m.lessons.filter(x => x.id !== l.id) } : m));
      this.selectedLesson.set(null);
    } catch { this.saveError.set('Error al eliminar.'); }
    finally { this.saving.set(false); }
  }

  async pickVideo(): Promise<void> {
    try {
      const file = await this.pickerSvc.open(['video/mp4', 'video/webm', 'video/quicktime', 'video/*']);
      this.lessonForm.video_storage_ref = file.fileId;
      this.lessonForm.video_storage_provider = 'drive';
      this.lessonForm._videoName = file.name;
    } catch (err: unknown) { if (err instanceof Error && err.message !== 'cancelled') alert('Error al abrir Drive'); }
  }

  async uploadVideo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await firstValueFrom(
        this.http.post<{ data: { file_id: string; name: string } }>(`${environment.apiBaseUrl}/upload`, fd)
      );
      this.lessonForm.video_storage_ref = res.data.file_id;
      this.lessonForm.video_storage_provider = 'drive';
      this.lessonForm._videoName = res.data.name;
    } catch { alert('Error al subir el video.'); }
    finally { this.uploading.set(false); }
  }

  async pickPdf(): Promise<void> {
    const lessonId = this.lessonForm._lessonId;
    if (!lessonId) { alert('Guarda la clase primero antes de agregar adjuntos.'); return; }
    try {
      const file = await this.pickerSvc.open(['application/pdf']);
      const att = await this.lessonsSvc.addAttachment(lessonId, { name: file.name, drive_file_id: file.fileId, mime_type: file.mimeType });
      this.lessonForm.attachments = [...this.lessonForm.attachments, att];
    } catch (err: unknown) { if (err instanceof Error && err.message !== 'cancelled') alert('Error al abrir Drive'); }
  }

  async uploadPdf(event: Event): Promise<void> {
    const lessonId = this.lessonForm._lessonId;
    if (!lessonId) { alert('Guarda la clase primero antes de agregar adjuntos.'); return; }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await firstValueFrom(
        this.http.post<{ data: { file_id: string; name: string; mime_type: string } }>(`${environment.apiBaseUrl}/upload`, fd)
      );
      const att = await this.lessonsSvc.addAttachment(lessonId, { name: res.data.name, drive_file_id: res.data.file_id, mime_type: res.data.mime_type });
      this.lessonForm.attachments = [...this.lessonForm.attachments, att];
    } catch { alert('Error al subir el PDF.'); }
    finally { this.uploading.set(false); }
  }

  async removeAttachment(att: Attachment): Promise<void> {
    const lessonId = this.lessonForm._lessonId;
    if (!lessonId) { this.lessonForm.attachments = this.lessonForm.attachments.filter(a => a.id !== att.id); return; }
    await this.lessonsSvc.deleteAttachment(lessonId, att.id);
    this.lessonForm.attachments = this.lessonForm.attachments.filter(a => a.id !== att.id);
  }

  async dropModule(event: CdkDragDrop<BuilderModule[]>): Promise<void> {
    const list = [...this.modules()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.modules.set(list);
    await this.modulesSvc.reorder(this.courseId, list.map(m => m.id)).catch(() => {});
  }

  async dropLesson(event: CdkDragDrop<BuilderLesson[]>, mod: BuilderModule): Promise<void> {
    const lessons = [...mod.lessons];
    moveItemInArray(lessons, event.previousIndex, event.currentIndex);
    this.modules.update(list => list.map(m => m.id === mod.id ? { ...m, lessons } : m));
    await this.lessonsSvc.reorder(this.courseId, mod.id, lessons.map(l => l.id)).catch(() => {});
  }
}
