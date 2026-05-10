import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Module } from '../../../core/services/modules.service';

export interface MetaPatch {
  title?: string;
  description?: string;
  moduleId?: string | null;
  newModuleTitle?: string;
}

@Component({
  selector: 'app-wizard-step-meta',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wizard-step">
      <h3 class="wizard-step-title">Paso 3 — Información de la clase</h3>

      <div class="field">
        <label>Título *</label>
        <input class="input" [ngModel]="title()" (ngModelChange)="emit({ title: $event })"
               placeholder="Ej: Listas y estructuras iterativas (Parte 1)" />
      </div>

      <div class="field">
        <label>Descripción</label>
        <textarea class="textarea" rows="3" [ngModel]="description()"
                  (ngModelChange)="emit({ description: $event })"
                  placeholder="Breve descripción de lo que aprenderán."></textarea>
      </div>

      <div class="field">
        <label>Tema (módulo) *</label>
        @if (!creatingNew()) {
          <div style="display:flex;gap:8px;align-items:center">
            <select class="select" [ngModel]="moduleId()"
                    (ngModelChange)="emit({ moduleId: $event, newModuleTitle: '' })">
              <option [ngValue]="null">— Selecciona un tema —</option>
              @for (m of modules(); track m.id) {
                <option [ngValue]="m.id">{{ m.title }}</option>
              }
            </select>
            <button class="btn ghost sm" (click)="startNew()">+ Nuevo tema</button>
          </div>
        } @else {
          <div style="display:flex;gap:8px;align-items:center">
            <input class="input" placeholder="Nombre del nuevo tema"
                   [ngModel]="newModuleTitle()"
                   (ngModelChange)="emit({ newModuleTitle: $event, moduleId: null })" />
            <button class="btn ghost sm" (click)="cancelNew()">← Usar existente</button>
          </div>
        }
      </div>
    </div>
  `,
})
export class WizardStepMetaComponent {
  readonly title = input<string>('');
  readonly description = input<string>('');
  readonly moduleId = input<string | null>(null);
  readonly newModuleTitle = input<string>('');
  readonly modules = input<Module[]>([]);

  readonly metaChange = output<MetaPatch>();

  creatingNew = signal(false);

  emit(patch: MetaPatch): void { this.metaChange.emit(patch); }

  startNew(): void { this.creatingNew.set(true); this.emit({ moduleId: null }); }
  cancelNew(): void { this.creatingNew.set(false); this.emit({ newModuleTitle: '' }); }
}
