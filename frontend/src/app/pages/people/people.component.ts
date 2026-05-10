import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsersService, User, CreateUserPayload } from '../../core/services/users.service';
import { ToastService } from '../../core/ui/toast.service';

type Role = 'admin' | 'teacher' | 'student';

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1>Personas</h1>
      </div>
      <div class="actions">
        <button class="btn primary" (click)="openNew()">+ Nueva persona</button>
      </div>
    </div>

    <div class="tabs" style="margin-bottom:18px">
      <button class="tab" [class.active]="activeTab() === 'teacher'" (click)="setTab('teacher')">
        🎓 Profesores ({{ countByRole('teacher') }})
      </button>
      <button class="tab" [class.active]="activeTab() === 'student'" (click)="setTab('student')">
        👤 Alumnos ({{ countByRole('student') }})
      </button>
      <button class="tab" [class.active]="activeTab() === 'admin'" (click)="setTab('admin')">
        🛡 Administradores ({{ countByRole('admin') }})
      </button>
    </div>

    @if (loading()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="login-error">{{ error() }}</p>
    } @else {
      <div class="card">
        <table class="tbl">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Estado</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (u of filtered(); track u.id) {
              <tr>
                <td style="font-weight:500">{{ u.full_name }}</td>
                <td class="mono" style="font-size:13px">{{ u.email }}</td>
                <td><span class="chip" [class]="statusClass(u.status)">{{ u.status === 'active' ? 'Activo' : 'Inactivo' }}</span></td>
                <td class="muted" style="font-size:12.5px">{{ u.created_at.substring(0, 10) }}</td>
                <td style="display:flex;gap:6px;justify-content:flex-end">
                  <button class="btn sm ghost" (click)="openEdit(u)">Editar</button>
                  <button class="btn sm danger" (click)="onDelete(u)" [disabled]="u.role === 'admin'">Inactivar</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">No hay {{ tabLabel() }}.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (modal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3 style="margin:0">{{ editing() ? 'Editar persona' : 'Nueva persona' }}</h3>
            <button class="btn icon sm ghost" (click)="closeModal()">✕</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
            <div class="field">
              <label>Nombre completo *</label>
              <input class="input" [(ngModel)]="form.full_name" placeholder="Ej: Ana López"/>
            </div>
            <div class="field">
              <label>Email *</label>
              <input class="input" type="email" [(ngModel)]="form.email" [disabled]="!!editing()"
                     placeholder="ejemplo@dominio.com"/>
            </div>
            <div class="field">
              <label>Rol *</label>
              <select class="select" [(ngModel)]="form.role">
                <option value="teacher">🎓 Profesor</option>
                <option value="student">👤 Alumno</option>
                <option value="admin">🛡 Administrador</option>
              </select>
            </div>
            @if (!editing()) {
              <div class="field">
                <label>Contraseña inicial *</label>
                <input class="input" type="text" [(ngModel)]="form.password"
                       placeholder="mín. 8 caracteres"/>
                <span class="muted" style="font-size:12px">El usuario podrá cambiarla después.</span>
              </div>
            }
            @if (modalError()) { <p class="login-error" style="margin:0">{{ modalError() }}</p> }
          </div>
          <div class="modal-foot">
            <button class="btn ghost" (click)="closeModal()">Cancelar</button>
            <button class="btn primary" (click)="save()" [disabled]="saving()">
              {{ saving() ? 'Guardando…' : (editing() ? 'Guardar' : 'Crear') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop { position:fixed; inset:0; background:rgba(15,26,61,0.45); display:grid; place-items:center; z-index:80; animation:fadeIn 160ms ease-out; }
    .modal { background:var(--surface); border-radius:14px; width:min(560px, 92vw); box-shadow:var(--shadow-pop); overflow:hidden; }
    .modal-head { padding:18px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
    .modal-body { padding:18px 20px; }
    .modal-foot { padding:14px 20px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; background:var(--surface-2); }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  `],
})
export class PeopleComponent implements OnInit {
  private readonly svc = inject(UsersService);
  private readonly toast = inject(ToastService);

  users = signal<User[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<Role>('teacher');

  modal = signal(false);
  editing = signal<User | null>(null);
  saving = signal(false);
  modalError = signal<string | null>(null);
  form: CreateUserPayload = { email: '', password: '', full_name: '', role: 'teacher' };

  filtered = computed(() => this.users().filter(u => u.role === this.activeTab()));
  tabLabel = computed(() => {
    const map: Record<Role, string> = { teacher: 'profesores', student: 'alumnos', admin: 'administradores' };
    return map[this.activeTab()];
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.svc.list());
    } catch {
      this.error.set('No se pudieron cargar los usuarios.');
    } finally { this.loading.set(false); }
  }

  setTab(r: Role): void { this.activeTab.set(r); }

  countByRole(role: Role): number {
    return this.users().filter(u => u.role === role).length;
  }

  statusClass(status: string): string {
    return status === 'active' ? 'success' : 'danger';
  }

  openNew(): void {
    this.editing.set(null);
    this.form = { email: '', password: '', full_name: '', role: this.activeTab() };
    this.modalError.set(null);
    this.modal.set(true);
  }

  openEdit(u: User): void {
    this.editing.set(u);
    this.form = { email: u.email, password: '', full_name: u.full_name, role: u.role };
    this.modalError.set(null);
    this.modal.set(true);
  }

  closeModal(): void { this.modal.set(false); this.modalError.set(null); }

  async save(): Promise<void> {
    if (!this.form.full_name.trim() || !this.form.email.trim()) {
      this.modalError.set('Nombre y email son requeridos.');
      return;
    }
    if (!this.editing() && (!this.form.password || this.form.password.length < 8)) {
      this.modalError.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    this.saving.set(true); this.modalError.set(null);
    try {
      if (this.editing()) {
        await this.svc.update(this.editing()!.id, {
          full_name: this.form.full_name,
          role: this.form.role,
          status: this.editing()!.status,
        });
      } else {
        await this.svc.create(this.form);
      }
      await this.refresh();
      this.modal.set(false);
      this.toast.success(this.editing() ? 'Persona actualizada.' : 'Persona creada.');
    } catch (err: unknown) {
      const e = err as { error?: { error?: { message?: string } } };
      this.modalError.set(e.error?.error?.message ?? 'Error al guardar.');
    } finally { this.saving.set(false); }
  }

  async onDelete(u: User): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Inactivar persona',
      message: `¿Inactivar a ${u.full_name}? No podrá iniciar sesión hasta que la reactives.`,
      confirmLabel: 'Inactivar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.svc.delete(u.id);
      await this.refresh();
      this.toast.success('Persona inactivada.');
    } catch {
      this.toast.error('No se pudo inactivar.');
    }
  }
}
