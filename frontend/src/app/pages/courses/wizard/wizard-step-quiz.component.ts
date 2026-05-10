import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  QuizDraft, addQuestion, removeQuestion, addOption, removeOption, setCorrect,
} from '../../../core/utils/quiz-draft';
import { QuizService } from '../../../core/services/quiz.service';

@Component({
  selector: 'app-wizard-step-quiz',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wizard-step">
      <h3 class="wizard-step-title">Paso 4 — Quiz (opcional)</h3>

      <label class="wizard-toggle">
        <input type="checkbox" [ngModel]="enabled()" (ngModelChange)="enabledChange.emit($event)" />
        <span>Agregar un quiz al final de la clase</span>
      </label>

      @if (enabled()) {
        <div class="quiz-import-row">
          <input #fileInput type="file" accept=".pdf,.docx,.doc,.odt,.rtf,.txt,.md"
                 (change)="onImport($event)" [disabled]="importing()" style="display:none" />
          <button class="btn ghost sm" (click)="fileInput.click()" [disabled]="importing()">
            📄 {{ importing() ? 'Importando…' : 'Importar de PDF/Word' }}
          </button>
          <a href="plantilla_examen.txt" download class="btn ghost sm">⬇ Descargar plantilla</a>
          @if (importMsg()) { <span class="muted" style="font-size:13px">{{ importMsg() }}</span> }
        </div>
        @if (importError()) { <p class="login-error">{{ importError() }}</p> }

        <div class="field" style="max-width:200px;margin-top:16px">
          <label>Puntuación mínima (%)</label>
          <input class="input" type="number" min="0" max="100"
                 [ngModel]="draft().pass_score"
                 (ngModelChange)="patch({ pass_score: $event })" />
        </div>

        @for (q of draft().questions; track $index; let qi = $index) {
          <div class="quiz-question-card">
            <div style="display:flex;gap:8px;align-items:flex-start">
              <span class="muted" style="font-size:13px;padding-top:6px">{{ qi+1 }}.</span>
              <textarea class="textarea sm" rows="2" placeholder="Texto de la pregunta"
                        style="flex:1"
                        [ngModel]="q.text"
                        (ngModelChange)="updateQuestionText(qi, $event)"></textarea>
              <button class="btn icon sm danger" (click)="onRemoveQuestion(qi)">✕</button>
            </div>
            <div class="quiz-options">
              @for (opt of q.options; track $index; let oi = $index) {
                <div class="quiz-option-row">
                  <input type="radio" [name]="'wcorrect_' + qi"
                         [checked]="opt.is_correct"
                         (change)="onSetCorrect(qi, oi)"
                         title="Respuesta correcta" />
                  <input class="input sm" placeholder="Opción" style="flex:1"
                         [ngModel]="opt.text"
                         (ngModelChange)="updateOptionText(qi, oi, $event)" />
                  <button class="btn icon sm danger" (click)="onRemoveOption(qi, oi)">✕</button>
                </div>
              }
            </div>
            <button class="btn ghost sm" style="margin-top:6px" (click)="onAddOption(qi)">+ Opción</button>
          </div>
        }
        <button class="btn ghost sm" (click)="onAddQuestion()" style="margin-top:8px">+ Pregunta</button>
      }
    </div>
  `,
})
export class WizardStepQuizComponent {
  private readonly quizSvc = inject(QuizService);

  readonly enabled = input<boolean>(false);
  readonly draft = input.required<QuizDraft>();

  readonly enabledChange = output<boolean>();
  readonly draftChange = output<QuizDraft>();

  importing = signal(false);
  importError = signal<string | null>(null);
  importMsg = signal<string | null>(null);

  async onImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing.set(true);
    this.importError.set(null);
    this.importMsg.set(null);
    try {
      const res = await this.quizSvc.parseFile(file);
      if (!res.questions || res.questions.length === 0) {
        this.importError.set(res.warning ?? 'No se detectaron preguntas. Descarga la plantilla para ver el formato.');
        return;
      }
      const merged: QuizDraft = {
        pass_score: this.draft().pass_score,
        questions: [
          ...this.draft().questions,
          ...res.questions.map(q => ({ text: q.text, options: q.options.map(o => ({ text: o.text, is_correct: o.is_correct })) })),
        ],
      };
      this.draftChange.emit(merged);
      this.importMsg.set(`✓ ${res.questions.length} pregunta(s) agregada(s). Revísalas abajo.`);
    } catch {
      this.importError.set('Error al procesar el archivo. Verifica el formato.');
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }

  patch(patch: Partial<QuizDraft>): void {
    this.draftChange.emit({ ...this.draft(), ...patch });
  }

  onAddQuestion(): void { this.draftChange.emit(addQuestion(this.draft())); }
  onRemoveQuestion(qi: number): void { this.draftChange.emit(removeQuestion(this.draft(), qi)); }
  onAddOption(qi: number): void { this.draftChange.emit(addOption(this.draft(), qi)); }
  onRemoveOption(qi: number, oi: number): void { this.draftChange.emit(removeOption(this.draft(), qi, oi)); }
  onSetCorrect(qi: number, oi: number): void { this.draftChange.emit(setCorrect(this.draft(), qi, oi)); }

  updateQuestionText(qi: number, text: string): void {
    const qs = this.draft().questions.map((q, i) => i === qi ? { ...q, text } : q);
    this.draftChange.emit({ ...this.draft(), questions: qs });
  }

  updateOptionText(qi: number, oi: number, text: string): void {
    const qs = this.draft().questions.map((q, i) =>
      i === qi ? { ...q, options: q.options.map((o, j) => j === oi ? { ...o, text } : o) } : q
    );
    this.draftChange.emit({ ...this.draft(), questions: qs });
  }
}
