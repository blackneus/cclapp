import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

import { ProgressService } from '../../core/services/progress.service';
import { QuizService, Quiz, AttemptResult } from '../../core/services/quiz.service';
import { CommentsService, LessonComment } from '../../core/services/comments.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
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

type ViewerTab = 'contenido' | 'recursos' | 'comentarios';
type QuizScreen = 'idle' | 'exam' | 'result';

@Component({
  selector: 'app-course-viewer',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (loading()) {
      <div style="padding:40px;text-align:center" class="muted">Cargando curso…</div>
    } @else if (error()) {
      <div style="padding:40px;text-align:center">
        <p class="login-error">{{ error() }}</p>
        <a routerLink="/courses" class="btn ghost">← Volver a cursos</a>
      </div>
    } @else if (outline()) {
      <div class="viewer-wrap" [class.collapsed]="sidebarCollapsed()">
        <!-- ========== ÁREA PRINCIPAL ========== -->
        <div class="viewer-main">

          @if (quizScreen() === 'exam') {
            <!-- VarE — Modo examen full-screen -->
            <div class="quiz-exam-wrap">
              <div class="quiz-exam-bar">
                <button class="btn ghost sm" (click)="exitExam()">← Salir</button>
                <span style="flex:1"></span>
                <span>{{ examAnsweredCount() }} / {{ quiz()!.questions.length }} respondidas</span>
              </div>
              <div class="card quiz-card">
                <div class="q-step">Pregunta {{ examIdx() + 1 }} de {{ quiz()!.questions.length }}</div>
                <div class="q-progress"><i [style.width.%]="examProgress()"></i></div>
                <div class="q-prompt">{{ currentExamQuestion()?.text }}</div>
                <div class="q-options">
                  @for (opt of currentExamQuestion()?.options ?? []; track opt.id; let i = $index) {
                    <div class="q-option" [class.sel]="quizAnswers[currentExamQuestion()!.id] === opt.id"
                         (click)="setAnswer(currentExamQuestion()!.id, opt.id)">
                      <div class="radio"></div>
                      <div style="flex:1">{{ opt.text }}</div>
                      <div class="key">{{ optionKey(i) }}</div>
                    </div>
                  }
                </div>
                <div class="row" style="margin-top:22px">
                  <button class="btn ghost sm" (click)="prevExam()" [disabled]="examIdx() === 0">← Anterior</button>
                  <span style="flex:1"></span>
                  @if (examIdx() < quiz()!.questions.length - 1) {
                    <button class="btn primary" (click)="nextExam()">Siguiente →</button>
                  } @else {
                    <button class="btn primary" (click)="submitExam()" [disabled]="submittingQuiz()">
                      {{ submittingQuiz() ? 'Enviando…' : '✓ Finalizar' }}
                    </button>
                  }
                </div>
              </div>
            </div>
          } @else if (quizScreen() === 'result' && attemptResult()) {
            <!-- VarF — Resultado -->
            <div class="quiz-exam-wrap">
              <div class="card quiz-result-card">
                <div class="quiz-result-header" [class.failed]="!attemptResult()!.passed">
                  <div class="quiz-result-trophy">{{ attemptResult()!.passed ? '🏆' : '✗' }}</div>
                  <div class="quiz-result-status" [class.failed]="!attemptResult()!.passed">
                    {{ attemptResult()!.passed ? 'Aprobado' : 'No aprobado' }}
                  </div>
                  <div class="quiz-result-score">{{ attemptResult()!.score }}%</div>
                  <div class="quiz-result-meta">
                    {{ attemptResult()!.right }} de {{ attemptResult()!.total }} correctas
                    · necesitas {{ quiz()?.pass_score ?? 70 }}% para aprobar
                  </div>
                </div>
                <div class="quiz-result-list">
                  @for (q of quiz()?.questions ?? []; track q.id; let i = $index) {
                    <div class="quiz-result-row">
                      <div class="quiz-result-bullet" [class.ok]="isAnswerCorrect(q.id)" [class.bad]="!isAnswerCorrect(q.id)">
                        {{ isAnswerCorrect(q.id) ? '✓' : '✗' }}
                      </div>
                      <span style="flex:1">{{ i+1 }}. {{ q.text }}</span>
                      <span class="muted" style="font-size:11.5px">{{ isAnswerCorrect(q.id) ? 'correcta' : 'incorrecta' }}</span>
                    </div>
                  }
                </div>
                <div class="quiz-result-foot">
                  <button class="btn ghost sm" (click)="retryQuiz()">↻ Reintentar</button>
                  @if (nextLesson()) {
                    <button class="btn primary sm" (click)="goNext()">Siguiente clase →</button>
                  } @else {
                    <button class="btn ghost sm" (click)="exitExam()">Cerrar</button>
                  }
                </div>
              </div>
            </div>
          } @else {
            <!-- VarA — Vista normal de clase -->
            @if (currentLesson()?.video_storage_ref) {
              <div class="viewer-video-box">
                <iframe [src]="videoUrl()" class="viewer-iframe" allow="autoplay" allowfullscreen></iframe>
              </div>
            } @else if (quiz() && quiz()!.questions.length > 0) {
              <div class="viewer-quiz-banner">
                <div class="viewer-quiz-banner-icon">📝</div>
                <div>
                  <div class="viewer-quiz-banner-title">Esta clase es un quiz</div>
                  <div class="viewer-quiz-banner-sub">{{ quiz()!.questions.length }} preguntas · {{ quiz()!.pass_score }}% para aprobar</div>
                </div>
                <button class="btn primary" style="margin-left:auto" (click)="startExam()">▶ Iniciar quiz</button>
              </div>
            }

            <div class="viewer-lesson-info">
              <div class="viewer-breadcrumb muted">
                {{ outline()!.course.title }} › {{ currentModuleTitle() }} › {{ currentLesson()?.title }}
              </div>
              <h2 class="viewer-lesson-title">{{ currentLesson()?.title }}</h2>

              <!-- Tabs -->
              <div class="tabs" style="margin-top:16px">
                <button class="tab" [class.active]="tab() === 'contenido'" (click)="tab.set('contenido')">
                  📄 Contenido
                </button>
                <button class="tab" [class.active]="tab() === 'recursos'" (click)="tab.set('recursos')">
                  📁 Recursos
                </button>
                <button class="tab" [class.active]="tab() === 'comentarios'" (click)="onCommentsTab()">
                  💬 Comentarios @if (comments().length > 0) { ({{ comments().length }}) }
                </button>
              </div>

              @if (tab() === 'contenido') {
                <!-- Descripción de la clase -->
                <div class="card-section" style="margin-top:14px">
                  <div class="card-section-head">Sobre esta clase</div>
                  <div class="card-section-body">
                    @if (currentLesson()?.description) {
                      <p style="margin:0;color:var(--ink-2);line-height:1.6;white-space:pre-wrap">{{ currentLesson()?.description }}</p>
                    } @else {
                      <p class="muted" style="font-size:13px;margin:0">Sin descripción.</p>
                    }
                  </div>
                </div>

                <!-- Acciones -->
                <div class="viewer-actions">
                  @if (!currentLesson()?.completed) {
                    <button class="btn ghost btn-complete-pending" (click)="markComplete()" [disabled]="completing()">
                      {{ completing() ? 'Guardando…' : '○ Marcar como completado' }}
                    </button>
                  } @else {
                    <button class="btn primary btn-complete-done" disabled>
                      ✓ Completado
                    </button>
                  }
                  @if (nextLesson()) {
                    <button class="btn ghost" (click)="goNext()" style="margin-left:auto">Siguiente →</button>
                  } @else if (allLessonsCompleted()) {
                    <span class="chip success" style="margin-left:auto">🎉 ¡Curso completado!</span>
                  }
                </div>

                <!-- Quiz preview con CTA al examen (solo si hay video; si es clase de solo quiz, ya hay banner arriba) -->
                @if (currentLesson()?.video_storage_ref) {
                  @if (quizLoading()) {
                    <div style="padding:var(--s-4) 0"><p class="muted">Cargando quiz…</p></div>
                  } @else if (quiz() && quiz()!.questions.length > 0) {
                    <div class="card card-pad" style="margin-top:18px">
                      <div class="row" style="margin-bottom:8px">
                        <span style="font-size:14.5px;font-weight:600">📝 Quiz de la clase</span>
                        <span class="spacer" style="flex:1"></span>
                        <span class="chip">{{ quiz()!.questions.length }} preguntas · {{ quiz()!.pass_score }}% para aprobar</span>
                      </div>
                      <p class="muted" style="font-size:13px;margin:6px 0 12px">
                        Responde el quiz pregunta por pregunta. Puedes navegar entre preguntas antes de finalizar.
                      </p>
                      <button class="btn primary" (click)="startExam()">▶ Iniciar quiz</button>
                    </div>
                  }
                }
              } @else if (tab() === 'recursos') {
                <!-- Tab Recursos: diapositivas y archivos descargables -->
                <div class="card-section" style="margin-top:14px">
                  <div class="card-section-head">Diapositivas y material descargable</div>
                  <div class="card-section-body">
                    @if ((currentLesson()?.attachments?.length ?? 0) === 0) {
                      <p class="muted" style="font-size:13px;margin:0">Esta clase no tiene archivos descargables.</p>
                    } @else {
                      @for (att of currentLesson()!.attachments; track att.id) {
                        <div class="slide-card-row" style="margin-bottom:8px">
                          <div class="slide-icon-box">📄</div>
                          <div style="flex:1;min-width:0">
                            <div class="slide-card-name">{{ att.name }}</div>
                            <div class="slide-card-meta">{{ fileExt(att.name) }}</div>
                          </div>
                          <a [href]="downloadUrl(att.drive_file_id)" target="_blank" rel="noopener" class="btn primary sm">
                            ⬇ Descargar
                          </a>
                        </div>
                      }
                    }
                  </div>
                </div>
              } @else {
                <!-- Tab Comentarios -->
                <div class="card-section" style="margin-top:14px">
                  <div class="card-section-head">Deja un comentario</div>
                  <div class="card-section-body">
                    <textarea class="textarea" rows="3" [(ngModel)]="newComment"
                              placeholder="Escribe tu duda o comentario sobre la clase…"
                              [disabled]="postingComment()"></textarea>
                    <div style="display:flex;justify-content:flex-end;margin-top:10px">
                      <button class="btn primary" (click)="postComment()" [disabled]="postingComment() || !newComment.trim()">
                        {{ postingComment() ? 'Publicando…' : 'Publicar' }}
                      </button>
                    </div>
                  </div>
                </div>

                <div style="margin-top:18px">
                  @if (commentsLoading()) {
                    <p class="muted">Cargando comentarios…</p>
                  } @else if (comments().length === 0) {
                    <div class="card card-pad" style="text-align:center;padding:40px;color:var(--ink-3)">
                      Aún no hay comentarios. Sé el primero en comentar.
                    </div>
                  } @else {
                    @for (c of comments(); track c.id) {
                      <div class="comment-card">
                        <div class="comment-avatar">{{ initials(c.user_name) }}</div>
                        <div style="flex:1">
                          <div class="comment-head">
                            <span class="comment-name">{{ c.user_name }}</span>
                            <span class="chip" [class]="roleClass(c.user_role)">{{ roleLabel(c.user_role) }}</span>
                            <span class="muted" style="font-size:12px">{{ relativeTime(c.created_at) }}</span>
                          </div>
                          <p class="comment-content">{{ c.content }}</p>
                        </div>
                        @if (canDeleteComment(c)) {
                          <button class="btn icon sm danger" (click)="deleteComment(c)" title="Eliminar">✕</button>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- ========== SIDEBAR LECCIONES ========== -->
        <button class="viewer-sidebar-toggle"
                [class.collapsed]="sidebarCollapsed()"
                (click)="toggleSidebar()"
                [title]="sidebarCollapsed() ? 'Mostrar lecciones' : 'Ocultar lecciones'">
          {{ sidebarCollapsed() ? '◀' : '▶' }}
        </button>

        @if (!sidebarCollapsed()) {
          <div class="viewer-sidebar">
            <div class="sidebar-header">
              <span class="sidebar-course-title">{{ outline()!.course.title }}</span>
              <div class="muted" style="font-size:11.5px;margin-top:2px">
                {{ completedCount() }} / {{ totalLessons() }} · {{ progressPct() }}%
              </div>
            </div>
            <div class="sidebar-scroll">
              @for (mod of outline()!.modules; track mod.id) {
                <div class="sidebar-module">
                  <div class="sidebar-module-title">{{ mod.title }}</div>
                  @for (lesson of mod.lessons; track lesson.id) {
                    <div class="viewer-side-pill"
                         [class.active]="currentLesson()?.id === lesson.id"
                         [class.done]="lesson.completed"
                         (click)="selectLesson(lesson, mod)">
                      <div class="pill-circle">{{ lesson.completed ? '✓' : (currentLesson()?.id === lesson.id ? '▶' : '') }}</div>
                      <span style="flex:1">{{ lesson.title }}</span>
                      @if (!lesson.video_storage_ref) {
                        <span class="pill-type-chip" title="Quiz">📝</span>
                      }
                      @if (lesson.completed) {
                        <span class="pill-status-chip" title="Completado">✓</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class CourseViewerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly progressSvc = inject(ProgressService);
  private readonly quizSvc = inject(QuizService);
  private readonly commentsSvc = inject(CommentsService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  // Comments
  comments = signal<LessonComment[]>([]);
  commentsLoading = signal(false);
  postingComment = signal(false);
  newComment = '';

  // Auto-complete timer
  private autoCompleteTimer: ReturnType<typeof setTimeout> | null = null;

  outline = signal<Outline | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  completing = signal(false);
  quiz = signal<Quiz | null>(null);
  quizLoading = signal(false);
  submittingQuiz = signal(false);
  attemptResult = signal<AttemptResult | null>(null);
  quizAnswers: Record<string, string> = {};

  tab = signal<ViewerTab>('contenido');
  quizScreen = signal<QuizScreen>('idle');
  examIdx = signal(0);
  sidebarCollapsed = signal<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem('viewer_sidebar_collapsed') === '1');

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('viewer_sidebar_collapsed', next ? '1' : '0');
    }
  }

  private _currentLesson = signal<ViewerLesson | null>(null);
  private _currentModule = signal<ViewerModule | null>(null);

  currentLesson = computed(() => this._currentLesson());
  currentModuleTitle = computed(() => this._currentModule()?.title ?? '');

  videoUrl = computed<SafeResourceUrl | string>(() => {
    const ref = this._currentLesson()?.video_storage_ref;
    if (!ref) return '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://drive.google.com/file/d/${ref}/preview`);
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

  totalLessons = computed(() => this.outline()?.modules.reduce((acc, m) => acc + m.lessons.length, 0) ?? 0);
  completedCount = computed(() => this.outline()?.modules.reduce((acc, m) => acc + m.lessons.filter(l => l.completed).length, 0) ?? 0);
  progressPct = computed(() => {
    const total = this.totalLessons();
    return total === 0 ? 0 : Math.round((this.completedCount() / total) * 100);
  });
  allLessonsCompleted = computed(() => this.totalLessons() > 0 && this.completedCount() === this.totalLessons());

  currentExamQuestion = computed(() => this.quiz()?.questions[this.examIdx()] ?? null);
  examProgress = computed(() => {
    const q = this.quiz();
    if (!q || q.questions.length === 0) return 0;
    return Math.round(((this.examIdx() + 1) / q.questions.length) * 100);
  });
  examAnsweredCount = computed(() => Object.keys(this.quizAnswers).length);

  downloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  fileExt(name: string): string {
    const ext = name.split('.').pop()?.toUpperCase() ?? '';
    return ext;
  }

  optionKey(i: number): string {
    return String.fromCharCode(65 + i); // A, B, C, D…
  }

  isAnswerCorrect(questionId: string): boolean {
    const q = this.quiz()?.questions.find(x => x.id === questionId);
    const chosen = this.quizAnswers[questionId];
    if (!q || !chosen) return false;
    const opt = q.options.find(o => o.id === chosen);
    return !!opt?.is_correct;
  }

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('id') ?? '';
    const lessonId = this.route.snapshot.paramMap.get('lessonId');
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: Outline }>(`${environment.apiBaseUrl}/courses/${courseId}/outline`)
      );
      this.outline.set(res.data);
      const allLessons: { lesson: ViewerLesson; mod: ViewerModule }[] = [];
      for (const mod of res.data.modules) {
        for (const lesson of mod.lessons) allLessons.push({ lesson, mod });
      }
      if (allLessons.length > 0) {
        const target = lessonId ? allLessons.find(x => x.lesson.id === lessonId) : allLessons[0];
        if (target) {
          this._currentLesson.set(target.lesson);
          this._currentModule.set(target.mod);
          this.loadQuiz(target.lesson.id);
          this.scheduleAutoComplete(target.lesson);
        }
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
    this.quiz.set(null);
    this.attemptResult.set(null);
    this.quizAnswers = {};
    this.quizScreen.set('idle');
    this.tab.set('contenido');
    this.examIdx.set(0);
    this.comments.set([]);
    this.loadQuiz(lesson.id);
    this.scheduleAutoComplete(lesson);
  }

  private scheduleAutoComplete(lesson: ViewerLesson): void {
    if (this.autoCompleteTimer) {
      clearTimeout(this.autoCompleteTimer);
      this.autoCompleteTimer = null;
    }
    if (lesson.completed) return;
    if (!lesson.video_storage_ref) return;
    const seconds = Math.max(lesson.duration_seconds, 60);
    this.autoCompleteTimer = setTimeout(() => {
      const current = this._currentLesson();
      if (current?.id === lesson.id && !current.completed) {
        this.markComplete();
      }
    }, seconds * 1000);
  }

  ngOnDestroy(): void {
    if (this.autoCompleteTimer) clearTimeout(this.autoCompleteTimer);
  }

  // ========== Comments ==========
  onCommentsTab(): void {
    this.tab.set('comentarios');
    if (this.comments().length === 0) this.loadComments();
  }

  async loadComments(): Promise<void> {
    const lessonId = this._currentLesson()?.id;
    if (!lessonId) return;
    this.commentsLoading.set(true);
    try {
      this.comments.set(await this.commentsSvc.list(lessonId));
    } catch { this.comments.set([]); }
    finally { this.commentsLoading.set(false); }
  }

  async postComment(): Promise<void> {
    const lessonId = this._currentLesson()?.id;
    if (!lessonId || !this.newComment.trim()) return;
    this.postingComment.set(true);
    try {
      const c = await this.commentsSvc.create(lessonId, this.newComment.trim());
      this.comments.update(list => [c, ...list]);
      this.newComment = '';
      this.toast.success('Comentario publicado.');
    } catch { this.toast.error('No se pudo publicar el comentario.'); }
    finally { this.postingComment.set(false); }
  }

  async deleteComment(c: LessonComment): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Eliminar comentario',
      message: '¿Seguro que deseas eliminar este comentario?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    const lessonId = this._currentLesson()?.id;
    if (!lessonId) return;
    try {
      await this.commentsSvc.delete(lessonId, c.id);
      this.comments.update(list => list.filter(x => x.id !== c.id));
      this.toast.success('Comentario eliminado.');
    } catch { this.toast.error('No se pudo eliminar.'); }
  }

  canDeleteComment(c: LessonComment): boolean {
    return this.auth.isAdmin() || c.user_id === this.auth.user()?.id;
  }

  initials(name: string): string {
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  }

  roleClass(role: string): string {
    const map: Record<string, string> = { admin: 'danger', teacher: 'success', student: '' };
    return map[role] ?? '';
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = { admin: 'Admin', teacher: 'Profesor', student: 'Alumno' };
    return map[role] ?? role;
  }

  relativeTime(iso: string): string {
    const date = new Date(iso);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);
    if (diffSec < 60) return 'hace un momento';
    if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
    if (diffSec < 604800) return `hace ${Math.floor(diffSec / 86400)} días`;
    return date.toLocaleDateString('es-MX');
  }

  async markComplete(): Promise<void> {
    const lesson = this._currentLesson();
    if (!lesson) return;
    this.completing.set(true);
    try {
      if (this.auth.isStudent()) {
        await this.progressSvc.complete(lesson.id);
      } else {
        // admin/teacher: solo previsualización, no se persiste
        this.toast.info('Como admin/profesor, el progreso es solo visual (no se guarda).');
      }
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
      if (this.auth.isStudent()) this.toast.success('¡Clase completada!');
    } catch (err: unknown) {
      const e = err as { error?: { error?: { code?: string; message?: string } } };
      const msg = e.error?.error?.message ?? 'No se pudo marcar como completada.';
      this.toast.error(msg);
    } finally { this.completing.set(false); }
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

  async loadQuiz(lessonId: string): Promise<void> {
    this.quizLoading.set(true);
    try {
      const quiz = await this.quizSvc.get(lessonId);
      this.quiz.set(quiz);
    } catch {
      this.quiz.set(null);
    } finally { this.quizLoading.set(false); }
  }

  setAnswer(questionId: string, optionId: string): void {
    this.quizAnswers = { ...this.quizAnswers, [questionId]: optionId };
  }

  startExam(): void {
    this.attemptResult.set(null);
    this.quizAnswers = {};
    this.examIdx.set(0);
    this.quizScreen.set('exam');
  }

  exitExam(): void {
    this.quizScreen.set('idle');
  }

  prevExam(): void { if (this.examIdx() > 0) this.examIdx.set(this.examIdx() - 1); }
  nextExam(): void {
    const total = this.quiz()?.questions.length ?? 0;
    if (this.examIdx() < total - 1) this.examIdx.set(this.examIdx() + 1);
  }

  async submitExam(): Promise<void> {
    const lessonId = this._currentLesson()?.id;
    if (!lessonId) return;
    const answers = Object.entries(this.quizAnswers).map(([question_id, option_id]) => ({ question_id, option_id }));
    if (answers.length === 0) return;
    this.submittingQuiz.set(true);
    try {
      const result = await this.quizSvc.attempt(lessonId, answers);
      this.attemptResult.set(result);
      this.quizScreen.set('result');
    } catch { /* ignore */ }
    finally { this.submittingQuiz.set(false); }
  }

  retryQuiz(): void {
    this.attemptResult.set(null);
    this.quizAnswers = {};
    this.examIdx.set(0);
    this.quizScreen.set('exam');
  }
}
