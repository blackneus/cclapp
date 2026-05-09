import { Component, computed, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">LM</div>
          <div class="wordmark">
            <span class="title">LICREAMO</span>
            <span class="tld">LMS</span>
          </div>
        </div>

        <div class="side-sec">
          <div class="lbl">Principal</div>
          <nav class="side-nav">
            <a routerLink="/dashboard" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Dashboard</span>
            </a>
            <a routerLink="/courses" routerLinkActive="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span>Cursos</span>
            </a>
            @if (!auth.isTeacher()) {
              <a routerLink="/enrollments" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Inscripciones</span>
              </a>
            }
            @if (auth.isAdmin()) {
              <a routerLink="/payments" routerLinkActive="active">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                <span>Pagos</span>
              </a>
            }
          </nav>
        </div>

        <div class="foot">
          <div class="user">
            <div class="avatar">{{ userInitials() }}</div>
            <div class="who">
              <span class="n">{{ auth.user()?.full_name }}</span>
              <span class="r">{{ roleLabel() }}</span>
            </div>
            <button class="btn icon sm ghost" style="color:rgba(255,255,255,0.6)" (click)="auth.logout()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <header class="topbar">
        <div class="crumbs">
          <span>LICREAMO</span>
          <span class="sep">/</span>
          <span class="cur">{{ pageTitle() }}</span>
        </div>
      </header>

      <main class="main">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userInitials = computed(() => {
    const name = this.auth.user()?.full_name ?? '';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  });

  readonly roleLabel = computed(() => {
    const map: Record<string, string> = {
      admin: 'Administrador',
      teacher: 'Maestro',
      student: 'Estudiante',
    };
    return map[this.auth.role() ?? ''] ?? '';
  });

  readonly pageTitle = computed(() => {
    const url = this.router.url;
    if (url.includes('courses')) return 'Cursos';
    if (url.includes('enrollments')) return 'Inscripciones';
    if (url.includes('payments')) return 'Pagos';
    return 'Dashboard';
  });
}
