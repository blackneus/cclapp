import { Component, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DrivePickerService } from '../../../core/services/drive-picker.service';
import { uploadToDriveWithProgress, driveMakePublic } from '../../../core/utils/drive-upload';
import { VideoRef } from './lesson-wizard.types';

@Component({
  selector: 'app-wizard-step-video',
  standalone: true,
  template: `
    <div class="wizard-step">
      <h3 class="wizard-step-title">Paso 1 — Video de la clase</h3>
      <p class="muted">Sube un archivo o selecciona uno existente desde tu Google Drive. El archivo se borra del servidor automáticamente después de subirse.</p>

      <div class="wizard-source-toggle">
        <button class="btn sm" [class.primary]="source() === 'upload'" [class.ghost]="source() !== 'upload'"
                (click)="source.set('upload')" [disabled]="uploading()">
          ⬆ Subir archivo
        </button>
        <button class="btn sm" [class.primary]="source() === 'drive'" [class.ghost]="source() !== 'drive'"
                (click)="source.set('drive')" [disabled]="uploading()">
          🎬 Desde Drive
        </button>
      </div>

      @if (source() === 'upload') {
        <input type="file" accept="video/*" class="input" (change)="onFile($event)" [disabled]="uploading()" />
      } @else {
        <button class="btn ghost" (click)="pickFromDrive()" [disabled]="uploading()">
          Seleccionar video de Drive
        </button>
      }

      @if (uploading()) {
        <div class="upload-progress">
          <div class="upload-progress-row">
            <span>{{ phase() === 'drive' ? '☁ Procesando en Google Drive…' : '⬆ Subiendo al servidor…' }}</span>
            <span class="upload-progress-pct">{{ uploadPct() }}%</span>
          </div>
          <div class="upload-progress-bar" [class.is-processing]="phase() === 'drive'">
            <div class="fill" [style.width.%]="uploadPct()"></div>
          </div>
        </div>
      }
      @if (uploadError()) { <p class="login-error" style="margin-top:8px">{{ uploadError() }}</p> }

      @if (current(); as v) {
        <div class="wizard-file-card">
          <span class="wizard-file-icon">🎬</span>
          <div>
            <div class="wizard-file-name">{{ v.name }}</div>
            <div class="muted" style="font-size:12px">Guardado en Google Drive</div>
          </div>
          <button class="btn icon sm danger" (click)="clear()" [disabled]="uploading()" title="Quitar">✕</button>
        </div>
      }
    </div>
  `,
})
export class WizardStepVideoComponent {
  private readonly http = inject(HttpClient);
  private readonly picker = inject(DrivePickerService);

  readonly current = input<VideoRef | null>(null);
  readonly courseId = input<string>('');
  readonly videoChange = output<VideoRef | null>();

  source = signal<'upload' | 'drive'>('upload');
  uploading = signal(false);
  uploadPct = signal(0);
  phase = signal<'vps' | 'drive'>('vps');
  uploadError = signal<string | null>(null);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true); this.uploadError.set(null); this.uploadPct.set(0); this.phase.set('vps');
    try {
      const res = await uploadToDriveWithProgress(this.http, file, (p) => {
        this.uploadPct.set(Math.round(p * 0.9));
        if (p >= 100) this.phase.set('drive');
      }, 'upload-video', this.courseId() || undefined);
      this.uploadPct.set(100);
      this.videoChange.emit({ ref: res.file_id, name: res.name });
    } catch {
      this.uploadError.set('Error al subir el video. Verifica que Drive esté configurado.');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  async pickFromDrive(): Promise<void> {
    this.uploadError.set(null);
    try {
      const file = await this.picker.open(['video/mp4', 'video/webm', 'video/quicktime', 'video/*']);
      await driveMakePublic(this.http, file.fileId).catch(() => {});
      this.videoChange.emit({ ref: file.fileId, name: file.name });
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'cancelled') {
        this.uploadError.set('Error al abrir el selector de Drive.');
      }
    }
  }

  clear(): void { this.videoChange.emit(null); }
}
