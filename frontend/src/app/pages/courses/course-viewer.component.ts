import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ProgressService } from '../../core/services/progress.service';
import { environment } from '../../../environments/environment';

interface ViewerAttachment { id: string; name: string; drive_file_id: string; mime_type: string; }
interface ViewerLesson {
  id: string; title: string; description: string; order_index: number;
  video_storage_provider: string; video_storage_ref: string; duration_seconds: number;
  attachments: ViewerAttachment[]; completed: boolean;
}
interface ViewerModule { id: string; title: string; description: string; order_index: number; lessons: ViewerLesson[]; }
interface ViewerEnrollment { id: string; payment_status: string; }
interface Outline { course: { id: string; title: string; description: string }; modules: ViewerModule[]; enrollment: ViewerEnrollment | null; }

@Component({
  selector: 'app-course-viewer',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div style="padding:40px;text-align:center" class="muted">Cargando curso…</div>
    } @else if (error()) {
      <div style="padding:40px;text-align:center">
        <p class="login-error">{{ error() }}</p>
        <a routerLink="/courses" class="btn ghost">← Volver a cursos</a>
      </div>
    } @else if (outline()) {
      <div class="viewer-wrap">
        <!-- Área principal -->
        <div class="viewer-main">
          <!-- Video -->
          <div class="viewer-video-box">
            @if (currentLesson()?.video_storage_ref) {
              <iframe
                [src]="videoUrl()"
                class="viewer-iframe"
                allow="autoplay"
                allowfullscreen>
              </iframe>
            } @else {
              <div class="viewer-no-video">
                <p class="muted">Esta clase no tiene video.</p>
              </div>
            }
          </div>

          <!-- Info de la lección -->
          <div class="viewer-lesson-info">
            <div class="viewer-breadcrumb muted">
              {{ currentModuleTitle() }} › {{ currentLesson()?.title }}
            </div>
            <h2 class="viewer-lesson-title">{{ currentLesson()?.title }}</h2>
            @if (currentLesson()?.description) {
              <p class="viewer-lesson-desc">{{ currentLesson()?.description }}</p>
            }

            <!-- Adjuntos -->
            @if ((currentLesson()?.attachments?.length ?? 0) > 0) {
              <div class="viewer-attachments">
                <h4>Archivos de la clase</h4>
                @for (att of currentLesson()!.attachments; track att.id) {
                  <a [href]="downloadUrl(att.drive_file_id)"
                     target="_blank" rel="noopener" class="attachment-link">
                    📄 {{ att.name }} <span class="muted">↓ Descargar</span>
                  </a>
                }
              </div>
            }

            <!-- Botones de acción -->
            <div class="viewer-actions">
              @if (!currentLesson()?.completed) {
                <button class="btn primary" (click)="markComplete()" [disabled]="completing()">
                  {{ completing() ? 'Guardando…' : '✓ Marcar como completado' }}
                </button>
              } @else {
                <span class="chip success">✓ Completado</span>
              }
              @if (nextLesson()) {
                <button class="btn ghost" (click)="goNext()" style="margin-left:auto">
                  Siguiente →
                </button>
              } @else {
                <span class="chip success" style="margin-left:auto">🎉 ¡Curso completado!</span>
              }
            </div>
          </div>
        </div>

        <!-- Sidebar de contenido -->
        <div class="viewer-sidebar">
          <div class="sidebar-header">
            <span class="sidebar-course-title">{{ outline()!.course.title }}</span>
          </div>
          <div class="sidebar-scroll">
            @for (mod of outline()!.modules; track mod.id) {
              <div class="sidebar-module">
                <div class="sidebar-module-title">{{ mod.title }}</div>
                @for (lesson of mod.lessons; track lesson.id) {
                  <div class="sidebar-lesson"
                       [class.active]="currentLesson()?.id === lesson.id"
                       [class.done]="lesson.completed"
                       (click)="selectLesson(lesson, mod)">
                    <span class="lesson-check">{{ lesson.completed ? '●' : '○' }}</span>
                    <span class="lesson-name">{{ lesson.title }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CourseViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly progressSvc = inject(ProgressService);

  outline = signal<Outline | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  completing = signal(false);

  private _currentLesson = signal<ViewerLesson | null>(null);
  private _currentModule = signal<ViewerModule | null>(null);

  currentLesson = computed(() => this._currentLesson());
  currentModuleTitle = computed(() => this._currentModule()?.title ?? '');

  videoUrl = computed(() => {
    const ref = this._currentLesson()?.video_storage_ref;
    if (!ref) return '';
    return `https://drive.google.com/file/d/${ref}/preview` as unknown as string;
  });

  nextLesson = computed(() => {
    const outline = this.outline();
    const current = this._currentLesson();
    if (!outline || !current) return null;
    let found = false;
    for (const mod of outline.modules) {
      for (const lesson of mod.lessons) {
        if (found) return lesson;
        if (lesson.id === current.id) found = true;
      }
    }
    return null;
  });

  downloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('id') ?? '';
    const lessonId = this.route.snapshot.paramMap.get('lessonId');
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: Outline }>(`${environment.apiBaseUrl}/courses/${courseId}/outline`)
      );
      this.outline.set(res.data);
      // Select first lesson or the one from URL
      const allLessons: { lesson: ViewerLesson; mod: ViewerModule }[] = [];
      for (const mod of res.data.modules) {
        for (const lesson of mod.lessons) {
          allLessons.push({ lesson, mod });
        }
      }
      if (allLessons.length > 0) {
        const target = lessonId ? allLessons.find(x => x.lesson.id === lessonId) : allLessons[0];
        if (target) { this._currentLesson.set(target.lesson); this._currentModule.set(target.mod); }
      }
    } catch (err: unknown) {
      const anyErr = err as { error?: { error?: { code?: string } }; status?: number };
      if (anyErr?.status === 403) {
        this.error.set('No estás inscrito en este curso.');
      } else {
        this.error.set('No se pudo cargar el curso.');
      }
    } finally { this.loading.set(false); }
  }

  selectLesson(lesson: ViewerLesson, mod: ViewerModule): void {
    this._currentLesson.set(lesson);
    this._currentModule.set(mod);
  }

  async markComplete(): Promise<void> {
    const lesson = this._currentLesson();
    if (!lesson) return;
    this.completing.set(true);
    try {
      await this.progressSvc.complete(lesson.id);
      // Update local state
      lesson.completed = true;
      this._currentLesson.set({ ...lesson });
      this.outline.update(o => {
        if (!o) return o;
        return {
          ...o,
          modules: o.modules.map(m => ({
            ...m,
            lessons: m.lessons.map(l => l.id === lesson.id ? { ...l, completed: true } : l),
          })),
        };
      });
    } catch { /* ignore */ }
    finally { this.completing.set(false); }
  }

  goNext(): void {
    const next = this.nextLesson();
    const outline = this.outline();
    if (!next || !outline) return;
    for (const mod of outline.modules) {
      if (mod.lessons.find(l => l.id === next.id)) {
        this.selectLesson(next, mod);
        return;
      }
    }
  }
}
