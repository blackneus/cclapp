import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EnrollmentsService, Enrollment } from '../../core/services/enrollments.service';
import { UsersService, User } from '../../core/services/users.service';
import { CoursesService, Course } from '../../core/services/courses.service';
import { PaymentsService } from '../../core/services/payments.service';
import { ToastService } from '../../core/ui/toast.service';
import { UploadReceiptModalComponent } from '../payments/upload-receipt-modal.component';

@Component({
  selector: 'app-course-enrollments',
  standalone: true,
  imports: [FormsModule, RouterLink, UploadReceiptModalComponent],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">
          <a routerLink="/courses" style="color:var(--c-primary)">Cursos</a> /
        </p>
        <h1>Inscripciones — {{ course()?.title ?? '…' }}</h1>
      </div>
      <div class="actions">
        <a [routerLink]="['/courses', courseId, 'build']" class="btn ghost">← Volver al curso</a>
      </div>
    </div>

    <!-- Inscribir -->
    <div class="card card-pad" style="margin-bottom:18px">
      <div style="font-size:14.5px;font-weight:600;margin-bottom:10px">Inscribir alumno</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="flex:1;min-width:280px">
          <label>Alumno</label>
          <select class="select" [(ngModel)]="selectedStudent">
            <option [ngValue]="''">— Selecciona un alumno —</option>
            @for (s of availableStudents(); track s.id) {
              <option [ngValue]="s.id">{{ s.full_name }} ({{ s.email }})</option>
            }
          </select>
        </div>
        <div class="field" style="max-width:260px">
          <label>Estado de pago</label>
          <select class="select" [(ngModel)]="paymentChoice">
            <option value="pending">Pendiente</option>
            <option value="paid_cash">Pagado — Efectivo</option>
            <option value="paid_deposit">Pagado — Depósito (comprobante)</option>
            <option value="exempt">Exento</option>
          </select>
        </div>
        <button class="btn primary" (click)="enroll()" [disabled]="!selectedStudent || enrolling()">
          {{ enrolling() ? 'Inscribiendo…' : '+ Inscribir' }}
        </button>
      </div>
      @if (allStudents().length === 0) {
        <p class="muted" style="font-size:13px;margin-top:8px">
          No hay alumnos registrados. <a routerLink="/people" style="color:var(--c-primary)">Crea uno</a>.
        </p>
      }
    </div>

    <!-- Lista -->
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Alumnos inscritos</div>
          <div class="muted" style="font-size:12.5px">{{ enrollments().length }} total</div>
        </div>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Alumno</th>
            <th>Email</th>
            <th>Estado de pago</th>
            <th>Inscrito el</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (e of enrollments(); track e.id) {
            <tr>
              <td style="font-weight:500">{{ e.student_name }}</td>
              <td class="mono" style="font-size:13px">{{ e.student_email }}</td>
              <td><span class="chip" [class]="paymentClass(e.payment_status)">{{ paymentLabel(e.payment_status) }}</span></td>
              <td class="muted" style="font-size:12.5px">{{ e.enrolled_at.substring(0, 10) }}</td>
              <td style="text-align:right">
                <button class="btn sm danger" (click)="unenroll(e)">Quitar</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">Aún no hay alumnos inscritos.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (uploadFor(); as eid) {
      <app-upload-receipt-modal [enrollmentId]="eid" (closed)="onUploadClosed($event)" />
    }
  `,
})
export class CourseEnrollmentsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly enrollSvc = inject(EnrollmentsService);
  private readonly usersSvc = inject(UsersService);
  private readonly coursesSvc = inject(CoursesService);
  private readonly paymentsSvc = inject(PaymentsService);
  private readonly toast = inject(ToastService);

  courseId = '';
  course = signal<Course | null>(null);
  enrollments = signal<Enrollment[]>([]);
  allStudents = signal<User[]>([]);
  enrolling = signal(false);
  uploadFor = signal<string | null>(null);

  selectedStudent = '';
  paymentChoice: 'pending' | 'paid_cash' | 'paid_deposit' | 'exempt' = 'pending';

  availableStudents = computed(() => {
    const enrolled = new Set(this.enrollments().map(e => e.student_id));
    return this.allStudents().filter(s => !enrolled.has(s.id));
  });

  async ngOnInit(): Promise<void> {
    this.courseId = this.route.snapshot.paramMap.get('id') ?? '';
    await Promise.all([
      this.coursesSvc.get(this.courseId).then(c => this.course.set(c)).catch(() => {}),
      this.refresh(),
      this.usersSvc.list('student').then(s => this.allStudents.set(s)).catch(() => {}),
    ]);
  }

  async refresh(): Promise<void> {
    try {
      this.enrollments.set(await this.enrollSvc.listByCourse(this.courseId));
    } catch { /* ignore */ }
  }

  async enroll(): Promise<void> {
    if (!this.selectedStudent) return;
    this.enrolling.set(true);
    try {
      // Mapeo: la inscripción siempre arranca pendiente o exenta; los pagos se
      // registran después según el método elegido.
      const initialStatus = this.paymentChoice === 'exempt' ? 'exempt' : 'awaiting_payment';
      const enr = await this.enrollSvc.create(this.courseId, this.selectedStudent, initialStatus);
      this.selectedStudent = '';
      await this.refresh();

      if (this.paymentChoice === 'paid_cash') {
        const now = new Date();
        const summary = await this.paymentsSvc.summaryForEnrollment(enr.id);
        const includeFee = summary.enrollment_fee_status === 'unpaid';
        const periods = parseFloat(summary.monthly_fee) > 0
          ? [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
          : [];
        if (includeFee || periods.length > 0) {
          await this.paymentsSvc.cash({
            enrollmentId: enr.id,
            includeEnrollmentFee: includeFee,
            periods,
          });
          await this.refresh();
        }
        this.toast.success('Alumno inscrito y pago en efectivo registrado.');
      } else if (this.paymentChoice === 'paid_deposit') {
        this.uploadFor.set(enr.id);
        this.toast.success('Alumno inscrito. Sube el comprobante para activar.');
      } else {
        this.toast.success('Alumno inscrito.');
      }
    } catch {
      this.toast.error('No se pudo inscribir al alumno.');
    } finally { this.enrolling.set(false); }
  }

  async onUploadClosed(event: { uploaded: boolean }): Promise<void> {
    this.uploadFor.set(null);
    if (event.uploaded) await this.refresh();
  }

  async unenroll(e: Enrollment): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Quitar inscripción',
      message: `¿Quitar a ${e.student_name} del curso?`,
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.enrollSvc.delete(this.courseId, e.id);
      await this.refresh();
      this.toast.success('Alumno removido del curso.');
    } catch {
      this.toast.error('No se pudo quitar.');
    }
  }

  paymentClass(status: string): string {
    const map: Record<string, string> = {
      paid: 'success',
      awaiting_payment: 'warn',
      exempt: '',
    };
    return map[status] ?? '';
  }

  paymentLabel(status: string): string {
    const map: Record<string, string> = {
      paid: 'Pagado',
      awaiting_payment: 'Pendiente',
      exempt: 'Exento',
    };
    return map[status] ?? status;
  }
}
