import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Bienvenido</p>
        <h1>Dashboard</h1>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--s-5)">
      <div class="card">
        <div class="card-body" style="text-align:center;padding:var(--s-8)">
          <div style="font-size:var(--fs-32);font-weight:700;color:var(--c-primary)">—</div>
          <div style="font-size:var(--fs-13);color:var(--c-muted);margin-top:var(--s-1)">Cursos activos</div>
        </div>
      </div>
      @if (!auth.isStudent()) {
        <div class="card">
          <div class="card-body" style="text-align:center;padding:var(--s-8)">
            <div style="font-size:var(--fs-32);font-weight:700;color:var(--c-primary)">—</div>
            <div style="font-size:var(--fs-13);color:var(--c-muted);margin-top:var(--s-1)">Inscripciones pendientes</div>
          </div>
        </div>
      }
    </div>

    <div style="margin-top:var(--s-7)">
      <div class="card">
        <div class="card-head">
          <h3>Accesos rápidos</h3>
        </div>
        <div class="card-body" style="display:flex;gap:var(--s-3);flex-wrap:wrap">
          <a routerLink="/courses" class="btn primary">Ver cursos</a>
          @if (auth.isAdmin() || auth.isTeacher()) {
            <a routerLink="/courses/new" class="btn ghost">Nuevo curso</a>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
}
