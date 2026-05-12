import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Payment, PaymentsService } from '../../core/services/payments.service';
import { ToastService } from '../../core/ui/toast.service';

const MONTH_LABELS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

@Component({
  selector: 'app-my-payments',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Mis pagos</p>
        <h1>Historial de pagos</h1>
      </div>
    </div>

    @if (loading()) {
      <p class="muted">Cargando…</p>
    } @else if (payments().length === 0) {
      <div class="card card-pad" style="text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:12px">🧾</div>
        <h3 style="margin-bottom:8px">Aún no tienes pagos registrados</h3>
        <p class="muted">Cuando subas un comprobante o registres un pago aparecerá aquí.</p>
      </div>
    } @else {
      <div class="card">
        <table class="tbl">
          <thead>
            <tr>
              <th>Curso</th>
              <th>Concepto</th>
              <th>Referencia</th>
              <th>Monto</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of pagedPayments(); track p.id) {
              <tr>
                <td style="font-weight:500">{{ p.course_title }}</td>
                <td>
                  <span class="kind" [class.fee]="p.kind === 'enrollment'">{{ kindLabel(p) }}</span>
                </td>
                <td class="mono" style="font-size:12.5px">{{ p.reference_code }}</td>
                <td class="mono">{{ fmt(p.amount) }}</td>
                <td class="muted" style="font-size:12.5px">{{ fmtDate(p.created_at) }}</td>
                <td>
                  <span class="chip" [class]="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
                </td>
                <td style="text-align:right">
                  @if (p.receipt_file_url) {
                    <a [href]="p.receipt_file_url" target="_blank" rel="noopener" class="btn ghost sm">Ver</a>
                  } @else {
                    <span class="muted" style="font-size:12px">Efectivo</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <div class="pager">
          <div class="pager-left">
            <label>Por página</label>
            <select class="select" [value]="pageSize()" (change)="setPageSize($any($event.target).value)">
              <option [value]="5">5</option>
              <option [value]="10">10</option>
            </select>
          </div>
          <div class="pager-right">
            <span class="muted" style="font-size:12.5px">
              {{ rangeFrom() }}–{{ rangeTo() }} de {{ payments().length }}
            </span>
            <button class="btn ghost sm" (click)="prev()" [disabled]="page() === 1">‹ Anterior</button>
            <button class="btn ghost sm" (click)="next()" [disabled]="page() === totalPages()">Siguiente ›</button>
          </div>
        </div>
      </div>

      <div class="totals-grid">
        <div class="totals-card">
          <div class="totals-label">Total pagado</div>
          <div class="totals-amt">{{ fmtNum(totalPaid()) }}</div>
        </div>
        <div class="totals-card warn">
          <div class="totals-label">En revisión</div>
          <div class="totals-amt">{{ fmtNum(totalVerifying()) }}</div>
        </div>
        <div class="totals-card danger">
          <div class="totals-label">Rechazado</div>
          <div class="totals-amt">{{ fmtNum(totalRejected()) }}</div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page-head { margin-bottom:18px }
    .eyebrow { color:#6b7088; font-size:11px; letter-spacing:.06em; text-transform:uppercase; margin:0 0 4px }
    h1 { margin:0; font-size:22px; color:#1a2547 }
    .kind { padding:2px 8px; background:#dde1f5; color:#3a4cce; border-radius:10px; font-size:11px; font-weight:600; text-transform:uppercase }
    .kind.fee { background:#fff4d8; color:#9a6800 }
    .chip { padding:3px 9px; border-radius:10px; font-size:11px; font-weight:600; text-transform:uppercase }
    .chip.success { background:#d6f5dd; color:#1e6f3a }
    .chip.warn { background:#fff4d8; color:#9a6800 }
    .chip.danger { background:#ffd8d8; color:#a02020 }
    .totals-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:18px }
    .totals-card { padding:16px; border-radius:12px; background:#fff; border:1px solid #e3e5ec }
    .totals-card.warn { background:#fff8e8 }
    .totals-card.danger { background:#fff0f0 }
    .totals-label { font-size:11px; text-transform:uppercase; color:#6b7088; letter-spacing:.06em }
    .totals-amt { font-size:22px; font-weight:700; color:#1a2547; margin-top:4px }
    :host ::ng-deep .tbl thead tr { background:#070c28 }
    :host ::ng-deep .tbl thead th { color:#fff; background:#070c28; border-bottom:0; letter-spacing:.04em }
    .pager { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-top:1px solid #eef0f4; background:#f8f9fc; gap:14px; flex-wrap:wrap }
    .pager-left { display:flex; align-items:center; gap:8px; font-size:12.5px; color:#6b7088 }
    .pager-left .select { max-width:80px; padding:4px 8px }
    .pager-right { display:flex; align-items:center; gap:10px }
  `],
})
export class MyPaymentsComponent implements OnInit {
  private readonly paymentsSvc = inject(PaymentsService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly payments = signal<Payment[]>([]);
  readonly pageSize = signal<number>(5);
  readonly page = signal<number>(1);

  readonly totalPaid = computed(() => this.sum('paid'));
  readonly totalVerifying = computed(() => this.sum('verifying'));
  readonly totalRejected = computed(() => this.sum('rejected'));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.payments().length / this.pageSize())));
  readonly pagedPayments = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.payments().slice(start, start + this.pageSize());
  });
  readonly rangeFrom = computed(() => this.payments().length === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1);
  readonly rangeTo = computed(() => Math.min(this.page() * this.pageSize(), this.payments().length));

  setPageSize(v: string): void {
    const n = parseInt(v, 10) || 5;
    this.pageSize.set(n);
    this.page.set(1);
  }

  prev(): void { if (this.page() > 1) this.page.update(p => p - 1); }
  next(): void { if (this.page() < this.totalPages()) this.page.update(p => p + 1); }

  private sum(status: string): number {
    return this.payments()
      .filter(p => p.status === status)
      .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.payments.set(await this.paymentsSvc.listMine());
    } catch {
      this.toast.error('No se pudieron cargar tus pagos.');
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

  fmt(a: string): string { return this.fmtNum(parseFloat(a) || 0); }
  fmtNum(n: number): string {
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' MXN';
  }

  fmtDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  statusClass(s: string): string {
    return { paid: 'success', verifying: 'warn', rejected: 'danger', awaiting: 'warn' }[s] ?? '';
  }

  statusLabel(s: string): string {
    return { paid: 'Pagado', verifying: 'En revisión', rejected: 'Rechazado', awaiting: 'Pendiente' }[s] ?? s;
  }
}
