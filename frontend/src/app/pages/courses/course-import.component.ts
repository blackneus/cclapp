import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { CoursesService, Course } from '../../core/services/courses.service';
import { CourseStructureService, ParsedStructure } from '../../core/services/course-structure.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-course-import',
  standalone: true,
  imports: [FormsModule, RouterLink, SlicePipe],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">
          <a routerLink="/courses" style="color:var(--c-primary)">Cursos</a> /
        </p>
        <h1>Cargar curso desde plantilla</h1>
        <p class="muted" style="font-size:13px;margin-top:4px">
          {{ course()?.title ?? '…' }}
        </p>
      </div>
    </div>

    <!-- Paso 1: descarga + upload -->
    <div class="card card-pad" style="margin-bottom:18px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <a href="plantilla_curso.txt" download class="btn ghost">⬇ Descargar plantilla</a>
        <span class="muted" style="font-size:13px">Llénala en cualquier editor de texto y súbela aquí.</span>
        <span style="flex:1"></span>
        <input #fileInput type="file" accept=".txt,.md,.pdf,.docx,.doc,.odt,.rtf"
               (change)="onFile($event)" [disabled]="loading()" style="display:none" />
        <button class="btn primary" (click)="fileInput.click()" [disabled]="loading()">
          📄 {{ loading() ? 'Procesando…' : 'Subir plantilla' }}
        </button>
      </div>
      @if (parseWarning()) { <p class="muted" style="margin-top:10px;color:var(--warn-600)">⚠ {{ parseWarning() }}</p> }
    </div>

    <!-- Paso 2: preview -->
    @if (structure()) {
      <div class="card card-pad" style="margin-bottom:18px">
        <h3 style="margin:0 0 12px">Vista previa de la estructura</h3>
        <p class="muted" style="font-size:13px;margin-bottom:14px">
          Detectados <strong>{{ totalModules() }}</strong> módulos,
          <strong>{{ totalLessons() }}</strong> clases
          @if (structure()!.quiz; as q) { y un quiz final con <strong>{{ q.questions.length }}</strong> preguntas }.
          Puedes editar los títulos antes de aplicar.
        </p>

        @for (mod of structure()!.modules; track $index; let mi = $index) {
          <div class="import-module">
            <div class="import-module-head">
              <span class="muted" style="font-size:11.5px">MÓDULO {{ mi+1 }}</span>
              <input class="input" [(ngModel)]="mod.title" placeholder="Nombre del módulo" />
              <button class="btn icon sm danger" (click)="removeModule(mi)" title="Quitar">✕</button>
            </div>
            <div class="import-lessons">
              @for (les of mod.lessons; track $index; let li = $index) {
                <div class="import-lesson">
                  <span class="muted" style="font-size:11.5px;width:46px">CLASE {{ li+1 }}</span>
                  <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                    <input class="input sm" [(ngModel)]="les.title" placeholder="Título de la clase" />
                    <textarea class="textarea" rows="2" [(ngModel)]="les.description" placeholder="Descripción (opcional)"></textarea>
                  </div>
                  <button class="btn icon sm danger" (click)="removeLesson(mi, li)" title="Quitar">✕</button>
                </div>
              }
            </div>
          </div>
        }

        @if (structure()!.quiz; as q) {
          <div class="import-quiz">
            <div class="import-quiz-head">
              <span style="font-size:14.5px;font-weight:700">📝 Examen final</span>
              <span class="muted" style="font-size:12px">
                {{ q.questions.length }} preguntas · {{ q.pass_score }}% para aprobar
              </span>
              <button class="btn icon sm danger" (click)="removeQuiz()" title="Quitar quiz">✕</button>
            </div>
            <ul style="margin:0;padding-left:20px;font-size:13px;color:var(--ink-2)">
              @for (qq of q.questions.slice(0, 5); track $index) {
                <li>{{ qq.text | slice: 0:100 }}{{ qq.text.length > 100 ? '…' : '' }}</li>
              }
              @if (q.questions.length > 5) {
                <li class="muted">… y {{ q.questions.length - 5 }} más</li>
              }
            </ul>
          </div>
        }

        <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
          <button class="btn ghost" (click)="cancel()">Cancelar</button>
          <button class="btn primary" (click)="apply()" [disabled]="applying() || totalLessons() === 0">
            {{ applying() ? 'Creando…' : '✓ Aplicar al curso' }}
          </button>
        </div>
      </div>
    } @else if (!loading()) {
      <div class="card card-pad" style="text-align:center;padding:48px;color:var(--ink-3)">
        Sube una plantilla para ver la estructura detectada.
      </div>
    }
  `,
  styles: [`
    .import-module { border:1px solid var(--border); border-radius:10px; margin-bottom:14px; overflow:hidden; }
    .import-module-head { display:flex; align-items:center; gap:10px; padding:12px 14px; background:var(--surface-2); border-bottom:1px solid var(--border); }
    .import-module-head .input { flex:1; font-weight:600; }
    .import-lessons { padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
    .import-lesson { display:flex; gap:10px; align-items:flex-start; padding:10px; background:var(--surface-2); border-radius:8px; }
    .import-quiz { border:1px solid var(--blue-100); background:var(--blue-50); border-radius:10px; padding:14px; margin-top:14px; }
    .import-quiz-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .import-quiz-head span:first-child { flex:1; }
  `],
})
export class CourseImportComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly coursesSvc = inject(CoursesService);
  private readonly structSvc = inject(CourseStructureService);
  private readonly toast = inject(ToastService);

  courseId = '';
  course = signal<Course | null>(null);
  structure = signal<ParsedStructure | null>(null);
  loading = signal(false);
  applying = signal(false);
  parseWarning = signal<string | null>(null);

  totalModules(): number {
    return this.structure()?.modules.length ?? 0;
  }
  totalLessons(): number {
    let n = 0;
    for (const m of this.structure()?.modules ?? []) n += m.lessons.length;
    return n;
  }

  async ngOnInit(): Promise<void> {
    this.courseId = this.route.snapshot.paramMap.get('id') ?? '';
    try { this.course.set(await this.coursesSvc.get(this.courseId)); } catch { /* ignore */ }
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.loading.set(true);
    this.parseWarning.set(null);
    try {
      const res = await this.structSvc.preview(this.courseId, file);
      this.structure.set(res.data);
      if (res.warning) this.parseWarning.set(res.warning);
      else this.toast.success(`Detectados ${this.totalModules()} módulos y ${this.totalLessons()} clases.`);
    } catch {
      this.toast.error('No se pudo procesar el archivo.');
    } finally {
      this.loading.set(false);
      input.value = '';
    }
  }

  removeModule(i: number): void {
    const s = this.structure();
    if (!s) return;
    const mods = s.modules.filter((_, idx) => idx !== i);
    this.structure.set({ ...s, modules: mods });
  }

  removeLesson(mi: number, li: number): void {
    const s = this.structure();
    if (!s) return;
    const mods = s.modules.map((m, i) => i === mi
      ? { ...m, lessons: m.lessons.filter((_, idx) => idx !== li) }
      : m);
    this.structure.set({ ...s, modules: mods });
  }

  removeQuiz(): void {
    const s = this.structure();
    if (!s) return;
    this.structure.set({ ...s, quiz: null });
  }

  cancel(): void {
    this.structure.set(null);
  }

  async apply(): Promise<void> {
    const s = this.structure();
    if (!s) return;
    const ok = await this.toast.confirm({
      title: 'Aplicar al curso',
      message: `Se crearán ${this.totalModules()} módulos y ${this.totalLessons()} clases (más quiz si lo dejaste). ¿Continuar?`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    this.applying.set(true);
    try {
      const res = await this.structSvc.apply(this.courseId, s);
      this.toast.success(
        `Listo: ${res.modules_created} módulos, ${res.lessons_created} clases${res.quiz_created ? ' + quiz' : ''}.`,
      );
      this.router.navigate(['/courses', this.courseId, 'build']);
    } catch {
      this.toast.error('Error al aplicar la estructura.');
    } finally { this.applying.set(false); }
  }
}
