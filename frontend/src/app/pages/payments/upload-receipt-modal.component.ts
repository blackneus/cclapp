import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PaymentsService, Period, EnrollmentPaymentSummary } from '../../core/services/payments.service';
import { DrivePickerService } from '../../core/services/drive-picker.service';
import { ToastService } from '../../core/ui/toast.service';

const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

@Component({
  selector: 'app-upload-receipt-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop" (click)="onCancel()">
      <div class="modal" (click)="$event.stopPropagation()" style="max-width:560px">
        <header class="modal-head">
          <h3>Subir comprobante de pago</h3>
          <button class="btn icon sm ghost" (click)="onCancel()" aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="modal-body">
          @if (loading()) {
            <p class="muted">Cargando estado de pagos…</p>
          } @else if (summary(); as s) {
            <p style="margin-bottom:8px"><strong>{{ s.course_title }}</strong></p>

            @if (s.enrollment_fee_status === 'unpaid') {
              <label class="check-row">
                <input type="checkbox" [checked]="includeFee()" (change)="includeFee.set($any($event.target).checked)" name="fee"/>
                <span>Cuota de inscripción — {{ fmt(s.enrollment_fee) }}</span>
              </label>
            } @else if (s.enrollment_fee_status === 'verifying') {
              <p class="muted" style="font-size:13px;margin:6px 0">Tu cuota de inscripción está en revisión.</p>
            } @else if (s.enrollment_fee_status === 'paid') {
              <p class="muted" style="font-size:13px;margin:6px 0">✓ Inscripción pagada.</p>
            }

            @if (pendingMonths().length > 0) {
              <p style="margin-top:14px;margin-bottom:6px;font-weight:600;font-size:13px">Mensualidades pendientes:</p>
              <div class="periods-grid">
                @for (p of pendingMonths(); track p.year + '-' + p.month) {
                  <label class="check-row" [class.checked]="isSelected(p)">
                    <input type="checkbox" [checked]="isSelected(p)" (change)="togglePeriod(p)"/>
                    <span>{{ monthLabel(p) }}</span>
                  </label>
                }
              </div>
            } @else {
              <p class="muted" style="font-size:13px;margin-top:14px">Tus mensualidades están al día.</p>
            }

            <div class="totals">
              <span>Total a pagar:</span>
              <strong>{{ fmt(totalAmount()) }}</strong>
            </div>

            <div style="margin-top:14px">
              <label style="display:block;font-weight:600;margin-bottom:6px;font-size:13px">Archivo del comprobante (imagen o PDF)</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <input type="file" accept="image/*,application/pdf" (change)="onFile($event)" />
                <span class="muted" style="font-size:12px">o</span>
                <button type="button" class="btn ghost sm" (click)="pickFromDrive()" [disabled]="pickingDrive()">
                  {{ pickingDrive() ? 'Abriendo Drive…' : '📁 Tomar de Drive' }}
                </button>
              </div>
              @if (file()) {
                <p class="muted" style="font-size:12px;margin-top:6px">{{ file()!.name }} — {{ formatBytes(file()!.size) }}</p>
              } @else if (driveFile(); as df) {
                <p class="muted" style="font-size:12px;margin-top:6px">📁 {{ df.name }} <span class="muted">(de Drive)</span></p>
              }
              @if (uploading() && file()) {
                <div class="upload-progress">
                  <div class="upload-progress-bar"><i [style.width.%]="uploadPct()"></i></div>
                  <div class="upload-progress-label">
                    @if (uploadPct() < 100) {
                      Subiendo… {{ uploadPct() }}%
                    } @else {
                      Procesando en el servidor…
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
        <footer class="modal-foot">
          <button class="btn ghost" (click)="onCancel()" [disabled]="uploading()">Cancelar</button>
          <button class="btn primary" (click)="onSubmit()" [disabled]="!canSubmit() || uploading()">
            {{ uploading() ? 'Subiendo…' : 'Enviar comprobante' }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop { position:fixed; inset:0; background:rgba(7,12,40,.5); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px }
    .modal { background:#fff; border-radius:14px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,.3); display:flex; flex-direction:column; max-height:90vh; overflow:hidden }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #eef0f4 }
    .modal-head h3 { margin:0; font-size:16px; color:#1a2547 }
    .modal-body { padding:18px 20px; overflow:auto }
    .modal-foot { display:flex; gap:8px; justify-content:flex-end; padding:14px 20px; border-top:1px solid #eef0f4; background:#f8f9fc }
    .check-row { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #e3e5ec; border-radius:8px; cursor:pointer; transition:all .15s; font-size:14px }
    .check-row.checked { background:#eef2ff; border-color:#3a4cce }
    .periods-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px }
    .totals { margin-top:14px; padding:10px 12px; background:#f4f6fb; border-radius:8px; display:flex; justify-content:space-between; font-size:14px }
    .upload-progress { margin-top:10px }
    .upload-progress-bar { height:6px; background:#e3e5ec; border-radius:3px; overflow:hidden }
    .upload-progress-bar i { display:block; height:100%; background:#3a4cce; transition:width .2s ease }
    .upload-progress-label { font-size:12px; color:#6b7088; margin-top:4px }
  `],
})
export class UploadReceiptModalComponent implements OnInit {
  @Input({ required: true }) enrollmentId!: string;
  @Output() closed = new EventEmitter<{ uploaded: boolean }>();

  private readonly payments = inject(PaymentsService);
  private readonly picker = inject(DrivePickerService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly uploadPct = signal(0);
  readonly pickingDrive = signal(false);
  readonly summary = signal<EnrollmentPaymentSummary | null>(null);
  readonly includeFee = signal(false);
  readonly selectedPeriods = signal<Period[]>([]);
  readonly file = signal<File | null>(null);
  readonly driveFile = signal<{ fileId: string; name: string; mimeType: string } | null>(null);

  readonly pendingMonths = computed<Period[]>(() => this.summary()?.pending_periods ?? []);

  readonly totalAmount = computed<string>(() => {
    const s = this.summary();
    if (!s) return '0';
    let total = 0;
    if (this.includeFee()) total += parseFloat(s.enrollment_fee) || 0;
    const monthly = parseFloat(s.monthly_fee) || 0;
    total += monthly * this.selectedPeriods().length;
    return total.toFixed(2);
  });

  readonly canSubmit = computed<boolean>(() => {
    if (!this.file() && !this.driveFile()) return false;
    const s = this.summary();
    if (!s) return false;
    const monthlyChosen = this.selectedPeriods().length > 0;
    const feeChosen = this.includeFee();
    return monthlyChosen || feeChosen;
  });

  async ngOnInit(): Promise<void> {
    try {
      const summary = await this.payments.summaryForEnrollment(this.enrollmentId);
      this.summary.set(summary);
      // Por defecto preseleccionar todos los meses pendientes + inscripción si aplica.
      if (summary.enrollment_fee_status === 'unpaid') this.includeFee.set(true);
      this.selectedPeriods.set([...summary.pending_periods]);
    } catch {
      this.toast.error('No se pudo cargar la información de pagos.');
      this.closed.emit({ uploaded: false });
    } finally {
      this.loading.set(false);
    }
  }

  onFile(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const f = target.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      this.toast.error('El archivo es demasiado grande (máx 10 MB).');
      target.value = '';
      return;
    }
    this.file.set(f);
    if (f) this.driveFile.set(null);
  }

  async pickFromDrive(): Promise<void> {
    this.pickingDrive.set(true);
    try {
      const df = await this.picker.open(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
      this.driveFile.set(df);
      this.file.set(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'cancelled') {
        this.toast.error('No se pudo abrir Drive.');
      }
    } finally {
      this.pickingDrive.set(false);
    }
  }

  isSelected(p: Period): boolean {
    return this.selectedPeriods().some(s => s.year === p.year && s.month === p.month);
  }

  togglePeriod(p: Period): void {
    const cur = this.selectedPeriods();
    if (this.isSelected(p)) {
      this.selectedPeriods.set(cur.filter(s => !(s.year === p.year && s.month === p.month)));
    } else {
      this.selectedPeriods.set([...cur, p]);
    }
  }

  monthLabel(p: Period): string {
    return `${MONTH_LABELS[p.month - 1]} ${p.year}`;
  }

  fmt(amount: string): string {
    const n = parseFloat(amount);
    if (isNaN(n)) return amount;
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' MXN';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  async onSubmit(): Promise<void> {
    const f = this.file();
    const df = this.driveFile();
    if (!f && !df) return;
    this.uploading.set(true);
    this.uploadPct.set(0);
    try {
      if (df) {
        await this.payments.uploadFromDrive({
          enrollmentId: this.enrollmentId,
          includeEnrollmentFee: this.includeFee(),
          periods: this.selectedPeriods(),
          driveFileId: df.fileId,
        });
      } else if (f) {
        await this.payments.upload({
          enrollmentId: this.enrollmentId,
          includeEnrollmentFee: this.includeFee(),
          periods: this.selectedPeriods(),
          file: f,
          onProgress: (pct) => this.uploadPct.set(pct),
        });
      }
      this.toast.success('Comprobante enviado. Está en revisión.');
      this.closed.emit({ uploaded: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir el comprobante.';
      this.toast.error(msg);
    } finally {
      this.uploading.set(false);
    }
  }

  onCancel(): void {
    if (this.uploading()) return;
    this.closed.emit({ uploaded: false });
  }
}
