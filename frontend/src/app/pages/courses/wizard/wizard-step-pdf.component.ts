import { Component, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DrivePickerService } from '../../../core/services/drive-picker.service';
import { uploadToDriveWithProgress, driveMakePublic } from '../../../core/utils/drive-upload';
import { PendingPdf } from './lesson-wizard.types';

@Component({
  selector: 'app-wizard-step-pdf',
  standalone: true,
  template: `
    <div class="wizard-step">
      <h3 class="wizard-step-title">Paso 2 — Diapositivas</h3>
      <p class="muted">Sube uno o varios archivos (PDF, PowerPoint .pptx/.ppt, Word .docx) con las diapositivas o material de la clase. Los estudiantes podrán descargarlos.</p>

      <div class="wizard-source-toggle">
        <input type="file" accept=".pdf,.pptx,.ppt,.docx,.doc,.odp,.odt,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
               multiple class="input" (change)="onFile($event)" [disabled]="uploading()" />
        <button class="btn ghost sm" (click)="pickFromDrive()" [disabled]="uploading()">+ Desde Drive</button>
      </div>

      @if (uploading()) {
        <div class="upload-progress">
          <div class="upload-progress-row">
            <span>{{ phase() === 'drive' ? '☁ Procesando en Drive' : '⬆ Subiendo' }} {{ uploadingName() }} ({{ uploadIdx() }}/{{ uploadTotal() }})</span>
            <span class="upload-progress-pct">{{ uploadPct() }}%</span>
          </div>
          <div class="upload-progress-bar" [class.is-processing]="phase() === 'drive'">
            <div class="fill" [style.width.%]="uploadPct()"></div>
          </div>
        </div>
      }
      @if (uploadError()) { <p class="login-error" style="margin-top:8px">{{ uploadError() }}</p> }

      @if ((current()).length > 0) {
        <div class="wizard-file-list">
          @for (pdf of current(); track pdf.drive_file_id) {
            <div class="wizard-file-card">
              <span class="wizard-file-icon">📄</span>
              <div class="wizard-file-name">{{ pdf.name }}</div>
              <button class="btn icon sm danger" (click)="remove(pdf)" [disabled]="uploading()" title="Quitar">✕</button>
            </div>
          }
        </div>
      } @else {
        <p class="muted" style="margin-top:12px;font-size:13px">No hay PDFs cargados aún.</p>
      }
    </div>
  `,
})
export class WizardStepPdfComponent {
  private readonly http = inject(HttpClient);
  private readonly picker = inject(DrivePickerService);

  readonly current = input<PendingPdf[]>([]);
  readonly courseId = input<string>('');
  readonly pdfsChange = output<PendingPdf[]>();

  uploading = signal(false);
  uploadPct = signal(0);
  uploadIdx = signal(0);
  uploadTotal = signal(0);
  uploadingName = signal('');
  phase = signal<'vps' | 'drive'>('vps');
  uploadError = signal<string | null>(null);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    this.uploading.set(true); this.uploadError.set(null);
    this.uploadTotal.set(files.length);
    const added: PendingPdf[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        this.uploadIdx.set(i + 1);
        this.uploadingName.set(f.name);
        this.uploadPct.set(0); this.phase.set('vps');
        const res = await uploadToDriveWithProgress(this.http, f, (p) => {
          this.uploadPct.set(Math.round(p * 0.9));
          if (p >= 100) this.phase.set('drive');
        }, 'upload', this.courseId() || undefined);
        this.uploadPct.set(100);
        added.push({ drive_file_id: res.file_id, name: res.name, mime_type: res.mime_type });
      }
      this.pdfsChange.emit([...(this.current()), ...added]);
    } catch {
      this.uploadError.set('Error al subir uno o más PDFs.');
      if (added.length > 0) this.pdfsChange.emit([...(this.current()), ...added]);
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  async pickFromDrive(): Promise<void> {
    this.uploadError.set(null);
    try {
      const file = await this.picker.open([
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.google-apps.presentation',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.google-apps.document',
        'application/vnd.oasis.opendocument.presentation',
      ]);
      await driveMakePublic(this.http, file.fileId).catch(() => {});
      this.pdfsChange.emit([
        ...(this.current()),
        { drive_file_id: file.fileId, name: file.name, mime_type: file.mimeType },
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'cancelled') {
        this.uploadError.set('Error al abrir Drive.');
      }
    }
  }

  remove(pdf: PendingPdf): void {
    this.pdfsChange.emit((this.current()).filter(p => p.drive_file_id !== pdf.drive_file_id));
  }
}
