import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ModulesService, Module } from '../../../core/services/modules.service';
import { LessonsService } from '../../../core/services/lessons.service';
import { QuizService } from '../../../core/services/quiz.service';
import { CoursesService, Course } from '../../../core/services/courses.service';
import { ToastService } from '../../../core/ui/toast.service';
import { emptyQuizDraft, isQuizDraftValid, QuizDraft } from '../../../core/utils/quiz-draft';
import { environment } from '../../../../environments/environment';

import { WizardStepVideoComponent } from './wizard-step-video.component';
import { WizardStepPdfComponent } from './wizard-step-pdf.component';
import { WizardStepMetaComponent, MetaPatch } from './wizard-step-meta.component';
import { WizardStepQuizComponent } from './wizard-step-quiz.component';
import {
  WizardDraft, StepId, PartialError, VideoRef, PendingPdf,
} from './lesson-wizard.types';

interface OutlineAttachment { id: string; name: string; drive_file_id: string; mime_type: string; }
interface OutlineLesson {
  id: string; title: string; description: string;
  video_storage_provider?: string; video_storage_ref?: string; duration_seconds?: number;
  attachments?: OutlineAttachment[];
}
interface ModuleWithLessons {
  id: string; course_id: string; title: string; description: string; order_index: number;
  lessons?: OutlineLesson[];
}

@Component({
  selector: 'app-lesson-wizard',
  standalone: true,
  imports: [
    RouterLink,
    WizardStepVideoComponent, WizardStepPdfComponent,
    WizardStepMetaComponent, WizardStepQuizComponent,
  ],
  template: `
    <div class="wizard-wrap">
      <div class="wizard-topbar">
        <a [routerLink]="['/courses', courseId, 'build']" class="btn ghost sm">← Volver al constructor</a>
        <span class="wizard-course-title">{{ course()?.title ?? 'Cargando…' }}</span>
        <span class="muted" style="font-size:13px">{{ isEdit() ? 'Editar clase' : 'Nueva clase' }}</span>
      </div>

      <div class="wizard-stepper">
        @for (s of steps; track s.id) {
          <div class="wizard-step-pill"
               [class.active]="currentStep() === s.id"
               [class.done]="currentStep() > s.id"
               (click)="jumpTo(s.id)">
            <span class="wizard-step-num">{{ s.id }}</span>
            <span class="wizard-step-label">{{ s.label }}</span>
          </div>
        }
      </div>

      <div class="wizard-body">
        @switch (currentStep()) {
          @case (1) {
            <app-wizard-step-video
              [current]="draft().video"
              [courseId]="courseId"
              (videoChange)="onVideoChange($event)" />
          }
          @case (2) {
            <app-wizard-step-pdf
              [current]="draft().pdfs"
              [courseId]="courseId"
              (pdfsChange)="onPdfsChange($event)" />
          }
          @case (3) {
            <app-wizard-step-meta
              [title]="draft().title"
              [description]="draft().description"
              [moduleId]="draft().moduleId"
              [newModuleTitle]="draft().newModuleTitle"
              [modules]="modules()"
              (metaChange)="onMetaChange($event)" />
          }
          @case (4) {
            <app-wizard-step-quiz
              [enabled]="draft().quizEnabled"
              [draft]="draft().quizDraft"
              (enabledChange)="onQuizEnabled($event)"
              (draftChange)="onQuizDraftChange($event)" />
          }
        }
      </div>

      @if (submitError()) {
        <div class="wizard-error-banner">
          <strong>Error al crear la clase:</strong> {{ submitError() }}
        </div>
      }

      @if (partialErrors().length > 0) {
        <div class="wizard-partial-banner">
          <p><strong>La clase se creó, pero hubo errores:</strong></p>
          <ul>
            @for (e of partialErrors(); track $index) { <li>{{ e.step }}: {{ e.message }}</li> }
          </ul>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn primary sm" (click)="retryPartial()" [disabled]="submitting()">Reintentar</button>
            <a [routerLink]="['/courses', courseId, 'build']" class="btn ghost sm">Ir al constructor</a>
          </div>
        </div>
      }

      <div class="wizard-actions">
        @if (currentStep() > 1) {
          <button class="btn ghost" (click)="back()" [disabled]="submitting()">← Atrás</button>
        }
        <span style="flex:1"></span>
        @if (currentStep() < 4) {
          <button class="btn primary" (click)="next()" [disabled]="!canAdvance()">Siguiente →</button>
        } @else {
          <button class="btn primary" (click)="submit()" [disabled]="submitting() || !canSubmit()">
            {{ submitting() ? (isEdit() ? 'Guardando…' : 'Creando…') : (isEdit() ? '✓ Guardar cambios' : '✓ Crear clase') }}
          </button>
        }
      </div>
    </div>
  `,
})
export class LessonWizardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly coursesSvc = inject(CoursesService);
  private readonly modulesSvc = inject(ModulesService);
  private readonly lessonsSvc = inject(LessonsService);
  private readonly quizSvc = inject(QuizService);
  private readonly toast = inject(ToastService);

  editingLessonId = signal<string | null>(null);
  editingLessonOriginalAttachments = signal<{ id: string; drive_file_id: string }[]>([]);
  editingLessonHadQuiz = signal(false);
  isEdit = computed(() => !!this.editingLessonId());

  readonly steps: { id: StepId; label: string }[] = [
    { id: 1, label: 'Video (opcional)' },
    { id: 2, label: 'Diapositivas (opcional)' },
    { id: 3, label: 'Información' },
    { id: 4, label: 'Quiz (opcional)' },
  ];

  courseId = '';
  course = signal<Course | null>(null);
  modules = signal<Module[]>([]);

  currentStep = signal<StepId>(1);
  draft = signal<WizardDraft>({
    video: null, pdfs: [], title: '', description: '',
    moduleId: null, newModuleTitle: '', quizEnabled: false, quizDraft: emptyQuizDraft(),
  });

  submitting = signal(false);
  submitError = signal<string | null>(null);
  partialErrors = signal<PartialError[]>([]);
  createdLessonId = signal<string | null>(null);
  resolvedModuleId = signal<string | null>(null);

  canAdvance = computed(() => {
    const d = this.draft();
    switch (this.currentStep()) {
      case 1: return true;
      case 2: return true;
      case 3: return !!d.title.trim() && (!!d.moduleId || !!d.newModuleTitle.trim());
      case 4: return true;
    }
  });

  canSubmit = computed(() => {
    const d = this.draft();
    if (!d.title.trim()) return false;
    if (!d.moduleId && !d.newModuleTitle.trim()) return false;
    // Al menos uno: video, pdfs o quiz válido
    const hasContent = !!d.video?.ref || d.pdfs.length > 0 || (d.quizEnabled && isQuizDraftValid(d.quizDraft));
    if (!hasContent) return false;
    if (d.quizEnabled && !isQuizDraftValid(d.quizDraft)) return false;
    return true;
  });

  async ngOnInit(): Promise<void> {
    this.courseId = this.route.snapshot.paramMap.get('id') ?? '';
    const presetModule = this.route.snapshot.queryParamMap.get('module');
    const lessonIdParam = this.route.snapshot.paramMap.get('lessonId');
    try {
      const [course, outline] = await Promise.all([
        this.coursesSvc.get(this.courseId),
        firstValueFrom(this.http.get<{ data: { modules: ModuleWithLessons[] } }>(`${environment.apiBaseUrl}/courses/${this.courseId}/outline`)).catch(() => ({ data: { modules: [] as ModuleWithLessons[] } })),
      ]);
      this.course.set(course);
      this.modules.set((outline.data?.modules ?? []) as unknown as Module[]);

      if (lessonIdParam) {
        // Modo edición — buscar la lección y precargar el draft
        await this.preloadForEdit(lessonIdParam, outline.data?.modules ?? []);
      } else if (presetModule && this.modules().some(m => m.id === presetModule)) {
        this.draft.update(d => ({ ...d, moduleId: presetModule }));
      }
    } catch {
      this.submitError.set('No se pudo cargar el curso.');
    }
  }

  private async preloadForEdit(lessonId: string, modules: ModuleWithLessons[]): Promise<void> {
    let foundLesson: OutlineLesson | undefined;
    let foundModuleId = '';
    for (const m of modules) {
      const l = (m.lessons ?? []).find(x => x.id === lessonId);
      if (l) { foundLesson = l; foundModuleId = m.id; break; }
    }
    if (!foundLesson) {
      this.submitError.set('No se encontró la clase.');
      return;
    }
    this.editingLessonId.set(lessonId);

    // Precarga draft
    const video = foundLesson.video_storage_ref
      ? { ref: foundLesson.video_storage_ref, name: '(video guardado)' }
      : null;
    const pdfs: PendingPdf[] = (foundLesson.attachments ?? []).map(a => ({
      drive_file_id: a.drive_file_id,
      name: a.name,
      mime_type: a.mime_type,
    }));

    let quizDraft: QuizDraft = emptyQuizDraft();
    let quizEnabled = false;
    try {
      const quiz = await this.quizSvc.get(lessonId);
      quizEnabled = true;
      this.editingLessonHadQuiz.set(true);
      quizDraft = {
        pass_score: quiz.pass_score,
        questions: quiz.questions.map(q => ({
          text: q.text,
          options: q.options.map(o => ({ text: o.text, is_correct: o.is_correct })),
        })),
      };
    } catch { /* no quiz, ok */ }

    this.editingLessonOriginalAttachments.set(
      (foundLesson.attachments ?? []).map(a => ({ id: a.id, drive_file_id: a.drive_file_id })),
    );

    this.draft.set({
      video,
      pdfs,
      title: foundLesson.title,
      description: foundLesson.description,
      moduleId: foundModuleId,
      newModuleTitle: '',
      quizEnabled,
      quizDraft,
    });
    this.currentStep.set(3); // saltar a información, pero se puede regresar
  }

  jumpTo(id: StepId): void {
    // En edición se puede saltar libremente; en creación solo hacia atrás
    if (this.isEdit() || id <= this.currentStep()) this.currentStep.set(id);
  }

  next(): void {
    if (!this.canAdvance()) return;
    const s = this.currentStep();
    if (s < 4) this.currentStep.set((s + 1) as StepId);
  }

  back(): void {
    const s = this.currentStep();
    if (s > 1) this.currentStep.set((s - 1) as StepId);
  }

  onVideoChange(v: VideoRef | null): void { this.draft.update(d => ({ ...d, video: v })); }
  onPdfsChange(p: PendingPdf[]): void { this.draft.update(d => ({ ...d, pdfs: p })); }
  onQuizEnabled(e: boolean): void { this.draft.update(d => ({ ...d, quizEnabled: e })); }
  onQuizDraftChange(q: WizardDraft['quizDraft']): void { this.draft.update(d => ({ ...d, quizDraft: q })); }

  onMetaChange(patch: MetaPatch): void {
    this.draft.update(d => ({
      ...d,
      title: patch.title ?? d.title,
      description: patch.description ?? d.description,
      moduleId: patch.moduleId !== undefined ? patch.moduleId : d.moduleId,
      newModuleTitle: patch.newModuleTitle !== undefined ? patch.newModuleTitle : d.newModuleTitle,
    }));
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.partialErrors.set([]);

    const d = this.draft();
    const errs: PartialError[] = [];

    try {
      let moduleId = this.resolvedModuleId() ?? d.moduleId;
      if (!moduleId && d.newModuleTitle.trim()) {
        try {
          const mod = await this.modulesSvc.create(this.courseId, { title: d.newModuleTitle.trim(), description: '' });
          moduleId = mod.id;
          this.resolvedModuleId.set(moduleId);
          this.modules.update(list => [...list, mod]);
        } catch {
          this.submitError.set('No se pudo crear el tema.');
          return;
        }
      }
      if (!moduleId) { this.submitError.set('Selecciona un tema.'); return; }

      const editingId = this.editingLessonId();
      let lessonId = editingId ?? this.createdLessonId();

      if (editingId) {
        // ===== MODO EDICIÓN =====
        try {
          await this.lessonsSvc.update(this.courseId, moduleId, editingId, {
            title: d.title.trim(),
            description: d.description.trim(),
            video_storage_provider: 'drive',
            video_storage_ref: d.video?.ref ?? '',
          });
        } catch {
          this.submitError.set('No se pudieron guardar los cambios.');
          return;
        }
        // Sincronizar attachments: borrar los que ya no están, agregar nuevos
        const original = this.editingLessonOriginalAttachments();
        const draftIds = new Set(d.pdfs.map(p => p.drive_file_id));
        for (const orig of original) {
          if (!draftIds.has(orig.drive_file_id)) {
            try { await this.lessonsSvc.deleteAttachment(editingId, orig.id); }
            catch { errs.push({ step: 'attachment', message: 'No se pudo quitar un adjunto previo.' }); }
          }
        }
        const originalDriveIds = new Set(original.map(o => o.drive_file_id));
        for (const pdf of d.pdfs) {
          if (!originalDriveIds.has(pdf.drive_file_id)) {
            try {
              await this.lessonsSvc.addAttachment(editingId, {
                name: pdf.name, drive_file_id: pdf.drive_file_id, mime_type: pdf.mime_type,
              });
            } catch {
              errs.push({ step: 'attachment', message: `No se pudo adjuntar "${pdf.name}".` });
            }
          }
        }
        // Quiz: si está habilitado y válido → save (overwrite). Si está deshabilitado y existía → delete.
        if (d.quizEnabled && isQuizDraftValid(d.quizDraft)) {
          try { await this.quizSvc.save(editingId, d.quizDraft); }
          catch { errs.push({ step: 'quiz', message: 'No se pudo guardar el quiz.' }); }
        } else if (!d.quizEnabled && this.editingLessonHadQuiz()) {
          try { await this.quizSvc.delete(editingId); }
          catch { errs.push({ step: 'quiz', message: 'No se pudo borrar el quiz.' }); }
        }
      } else {
        // ===== MODO CREACIÓN =====
        if (!lessonId) {
          try {
            const lesson = await this.lessonsSvc.create(this.courseId, moduleId, {
              title: d.title.trim(),
              description: d.description.trim(),
              video_storage_provider: 'drive',
              video_storage_ref: d.video?.ref ?? '',
              duration_seconds: 0,
            });
            lessonId = lesson.id;
            this.createdLessonId.set(lessonId);
          } catch {
            this.submitError.set('No se pudo crear la clase.');
            return;
          }
        }

        for (const pdf of d.pdfs) {
          try {
            await this.lessonsSvc.addAttachment(lessonId, {
              name: pdf.name, drive_file_id: pdf.drive_file_id, mime_type: pdf.mime_type,
            });
          } catch {
            errs.push({ step: 'attachment', message: `No se pudo adjuntar "${pdf.name}".` });
          }
        }

        if (d.quizEnabled && isQuizDraftValid(d.quizDraft)) {
          try { await this.quizSvc.save(lessonId, d.quizDraft); }
          catch { errs.push({ step: 'quiz', message: 'No se pudo guardar el quiz.' }); }
        }
      }

      if (errs.length > 0) {
        this.partialErrors.set(errs);
      } else {
        this.toast.success(editingId ? 'Cambios guardados.' : 'Clase creada.');
        this.router.navigate(['/courses', this.courseId, 'build']);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async retryPartial(): Promise<void> {
    const lessonId = this.createdLessonId();
    if (!lessonId) return;
    this.submitting.set(true);
    const errs: PartialError[] = [];
    const d = this.draft();
    try {
      for (const e of this.partialErrors()) {
        if (e.step === 'attachment') {
          for (const pdf of d.pdfs) {
            try {
              await this.lessonsSvc.addAttachment(lessonId, {
                name: pdf.name, drive_file_id: pdf.drive_file_id, mime_type: pdf.mime_type,
              });
            } catch { errs.push({ step: 'attachment', message: `Persiste el error con "${pdf.name}".` }); }
          }
        } else if (e.step === 'quiz' && d.quizEnabled && isQuizDraftValid(d.quizDraft)) {
          try { await this.quizSvc.save(lessonId, d.quizDraft); }
          catch { errs.push({ step: 'quiz', message: 'Persiste el error con el quiz.' }); }
        }
      }
      this.partialErrors.set(errs);
      if (errs.length === 0) {
        this.router.navigate(['/courses', this.courseId, 'build'], {
          queryParams: { createdLesson: lessonId },
        });
      }
    } finally { this.submitting.set(false); }
  }
}
