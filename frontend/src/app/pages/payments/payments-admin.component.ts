import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Payment, PaymentsService } from '../../core/services/payments.service';
import { ToastService } from '../../core/ui/toast.service';

interface PaymentGroup {
  groupId: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  receiptUrl: string;
  createdAt: string;
  total: number;
  items: Payment[];
}

const MONTH_LABELS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

@Component({
  selector: 'app-payments-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1>Pagos por verificar</h1>
      </div>
      <button class="btn ghost" (click)="reload()" [disabled]="loading()">
        Refrescar
      </button>
    </div>

    @if (rejecting(); as r) {
      <div class="modal-backdrop" (click)="cancelReject()">
        <div class="modal" (click)="$event.stopPropagation()" style="max-width:440px">
          <header class="modal-head">
            <h3>Rechazar pago</h3>
            <button class="btn icon sm ghost" (click)="cancelReject()" aria-label="Cerrar">✕</button>
          </header>
          <div class="modal-body">
            <p style="margin:0 0 10px">Indica el motivo para rechazar el pago de <strong>{{ r.studentName }}</strong>.</p>
            <textarea class="reason-input" rows="3" [ngModel]="rejectReason()" (ngModelChange)="rejectReason.set($event)" placeholder="Ej. el monto no coincide, falta legibilidad…"></textarea>
          </div>
          <footer class="modal-foot">
            <button class="btn ghost" (click)="cancelReject()">Cancelar</button>
            <button class="btn primary" (click)="confirmReject()" [disabled]="!rejectReason().trim()">Rechazar</button>
          </footer>
        </div>
      </div>
    }

    @if (loading()) {
      <p class="muted">Cargando…</p>
    } @else if (groups().length === 0) {
      <div class="card card-pad" style="text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:12px">✓</div>
        <h3 style="margin-bottom:8px">No hay pagos pendientes</h3>
        <p class="muted">Cuando un alumno suba un comprobante aparecerá aquí.</p>
      </div>
    } @else {
      <div class="payments-list">
        @for (g of groups(); track g.groupId) {
          <article class="card pay-card">
            <header class="pay-head">
              <div>
                <h3>{{ g.studentName }}</h3>
                <p class="muted" style="font-size:13px">{{ g.studentEmail }} · {{ g.courseTitle }}</p>
              </div>
              <div style="text-align:right">
                <div class="amt">{{ fmt(g.total) }}</div>
                <div class="muted" style="font-size:12px">{{ fmtDate(g.createdAt) }}</div>
              </div>
            </header>

            <ul class="pay-items">
              @for (it of g.items; track it.id) {
                <li>
                  <span class="kind" [class.fee]="it.kind === 'enrollment'">{{ kindLabel(it) }}</span>
                  <span class="muted">{{ it.reference_code }}</span>
                  <span style="margin-left:auto">{{ fmtAmount(it.amount) }}</span>
                </li>
              }
            </ul>

            @if (g.receiptUrl && previewUrl(g); as src) {
              <div class="receipt-preview">
                <iframe [src]="src" frameborder="0" allow="autoplay"></iframe>
              </div>
            } @else if (!g.receiptUrl) {
              <p class="muted" style="font-size:13px;padding:10px 0">Sin comprobante (pago en efectivo).</p>
            }

            <footer class="pay-foot">
              @if (g.receiptUrl) {
                <a [href]="g.receiptUrl" target="_blank" rel="noopener" class="btn ghost sm">
                  Abrir en pestaña ↗
                </a>
              } @else {
                <span></span>
              }
              <div style="display:flex;gap:8px">
                <button class="btn ghost sm" (click)="reject(g)">Rechazar</button>
                <button class="btn primary sm" (click)="verify(g)">Verificar</button>
              </div>
            </footer>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    .page-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px }
    .eyebrow { color:#6b7088; font-size:11px; letter-spacing:.06em; text-transform:uppercase; margin:0 0 4px }
    h1 { margin:0; font-size:22px; color:#1a2547 }
    .payments-list { display:grid; gap:14px }
    .pay-card { padding:16px; border:1px solid #e3e5ec; border-radius:12px }
    .pay-head { display:flex; justify-content:space-between; gap:14px }
    .pay-head h3 { margin:0; font-size:15px; color:#1a2547 }
    .pay-head .amt { font-weight:700; color:#1a2547; font-size:18px }
    .pay-items { list-style:none; padding:0; margin:12px 0; display:flex; flex-direction:column; gap:6px }
    .pay-items li { display:flex; gap:10px; align-items:center; font-size:13px; padding:6px 10px; background:#f8f9fc; border-radius:6px }
    .kind { padding:2px 8px; background:#dde1f5; color:#3a4cce; border-radius:10px; font-size:11px; font-weight:600; text-transform:uppercase }
    .kind.fee { background:#fff4d8; color:#9a6800 }
    .pay-foot { display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #eef0f4 }
    .receipt-preview { margin:6px 0 12px; border:1px solid #e3e5ec; border-radius:8px; overflow:hidden; background:#f4f6fb }
    .receipt-preview iframe { display:block; width:100%; height:420px; border:0 }
    .modal-backdrop { position:fixed; inset:0; background:rgba(7,12,40,.5); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px }
    .modal { background:#fff; border-radius:14px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,.3); display:flex; flex-direction:column }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #eef0f4 }
    .modal-head h3 { margin:0; font-size:16px; color:#1a2547 }
    .modal-body { padding:18px 20px }
    .modal-foot { display:flex; gap:8px; justify-content:flex-end; padding:14px 20px; border-top:1px solid #eef0f4; background:#f8f9fc }
    .reason-input { width:100%; padding:10px; border:1px solid #d3d6e0; border-radius:8px; font-family:inherit; font-size:14px; resize:vertical }
  `],
})
export class PaymentsAdminComponent implements OnInit {
  private readonly payments = inject(PaymentsService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal(false);
  readonly raw = signal<Payment[]>([]);

  private readonly previewCache = new Map<string, SafeResourceUrl>();

  previewUrl(g: PaymentGroup): SafeResourceUrl | null {
    if (!g.receiptUrl) return null;
    const cached = this.previewCache.get(g.groupId);
    if (cached) return cached;
    const m = g.receiptUrl.match(/\/file\/d\/([^/]+)/);
    if (!m) return null;
    const url = `https://drive.google.com/file/d/${m[1]}/preview`;
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.previewCache.set(g.groupId, safe);
    return safe;
  }

  readonly groups = computed<PaymentGroup[]>(() => {
    const byGroup = new Map<string, PaymentGroup>();
    for (const p of this.raw()) {
      const key = p.receipt_group_id ?? p.id;
      const existing = byGroup.get(key);
      const amt = parseFloat(p.amount) || 0;
      if (existing) {
        existing.items.push(p);
        existing.total += amt;
      } else {
        byGroup.set(key, {
          groupId: key,
          studentName: p.student_name ?? '—',
          studentEmail: p.student_email ?? '',
          courseTitle: p.course_title ?? '',
          receiptUrl: p.receipt_file_url,
          createdAt: p.created_at,
          total: amt,
          items: [p],
        });
      }
    }
    return Array.from(byGroup.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });

  ngOnInit(): void {
    this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.raw.set(await this.payments.listPending());
    } catch {
      this.toast.error('No se pudieron cargar los pagos.');
    } finally {
      this.loading.set(false);
    }
  }

  kindLabel(p: Payment): string {
    if (p.kind === 'enrollment') return 'Inscripción';
    if (p.period_year && p.period_month) {
      return `${MONTH_LABELS[p.period_month - 1]} ${p.period_year}`;
    }
    return 'Mensualidad';
  }

  fmt(amount: number): string {
    return '$' + amount.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' MXN';
  }

  fmtAmount(amount: string): string {
    return this.fmt(parseFloat(amount) || 0);
  }

  fmtDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  }

  async verify(g: PaymentGroup): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Verificar pago',
      message: `¿Confirmas verificar el pago de ${g.studentName} (${this.fmt(g.total)})?`,
      confirmLabel: 'Verificar',
    });
    if (!ok) return;
    try {
      await this.payments.verifyGroup(g.groupId);
      this.toast.success('Pago verificado.');
      await this.reload();
    } catch {
      this.toast.error('No se pudo verificar el pago.');
    }
  }

  readonly rejecting = signal<PaymentGroup | null>(null);
  readonly rejectReason = signal('');

  reject(g: PaymentGroup): void {
    this.rejectReason.set('');
    this.rejecting.set(g);
  }

  cancelReject(): void {
    this.rejecting.set(null);
  }

  async confirmReject(): Promise<void> {
    const g = this.rejecting();
    const reason = this.rejectReason().trim();
    if (!g || !reason) return;
    try {
      await this.payments.rejectGroup(g.groupId, reason);
      this.toast.success('Pago rechazado.');
      this.rejecting.set(null);
      await this.reload();
    } catch {
      this.toast.error('No se pudo rechazar el pago.');
    }
  }
}
