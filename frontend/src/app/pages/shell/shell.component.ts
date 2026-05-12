import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { ToastHostComponent } from '../../core/ui/toast-host.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, ToastHostComponent],
  template: `
    <div class="app" [class.collapsed]="collapsed()">
      <aside class="sidebar">
        <button class="sidebar-toggle" (click)="toggle()" [attr.aria-label]="collapsed() ? 'Mostrar menú' : 'Ocultar menú'">
          @if (collapsed()) {
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          } @else {
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          }
        </button>
        <div class="brand">
          <div class="mark">
            @if (logoSrc(); as src) {
              <img [src]="src" alt="Logo"/>
            } @else {
              {{ brandMark() }}
            }
          </div>
          <div class="wordmark">
            <span class="title">{{ brandName() }}</span>
            <span class="tld">LMS</span>
          </div>
        </div>

        <div class="side-sec">
          <div class="lbl">Principal</div>
          <nav class="side-nav">
            <a routerLink="/dashboard" [class.active]="section() === 'dashboard'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Dashboard</span>
            </a>
            @if (!auth.isStudent()) {
              <a routerLink="/courses" [class.active]="section() === 'courses'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span>Cursos</span>
              </a>
            }
            <a routerLink="/my-courses" [class.active]="section() === 'my-courses'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>Mis cursos</span>
            </a>
            @if (auth.isAdmin()) {
              <a routerLink="/people" [class.active]="section() === 'people'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Personas</span>
              </a>
            }
            @if (auth.isStudent()) {
              <a routerLink="/my-payments" [class.active]="section() === 'my-payments'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                <span>Mis pagos</span>
              </a>
            }
            @if (auth.isAdmin()) {
              <a routerLink="/payments" [class.active]="section() === 'payments'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                <span>Pagos</span>
              </a>
              <a routerLink="/settings" [class.active]="section() === 'settings'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Configuración</span>
              </a>
            }
          </nav>
        </div>

        <div class="foot">
          <div class="user">
            <a routerLink="/profile" class="avatar avatar-link" [title]="'Editar perfil'">
              @if (avatarSrc(); as src) {
                <img [src]="src" alt="Avatar"/>
              } @else {
                <span>{{ userInitials() }}</span>
              }
            </a>
            <a routerLink="/profile" class="who" style="text-decoration:none;color:inherit">
              <span class="n">{{ auth.user()?.full_name }}</span>
              <span class="r">{{ roleLabel() }}</span>
            </a>
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

      <app-toast-host />
    </div>
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantService);
  private readonly router = inject(Router);

  readonly section = signal<string>(this.computeSection(this.router.url));
  readonly collapsed = signal<boolean>(false);

  toggle(): void {
    this.collapsed.update(v => !v);
  }

  ngOnInit(): void {
    void this.tenant.load();
  }

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.section.set(this.computeSection(e.urlAfterRedirects)));
  }

  readonly brandName = computed(() => this.tenant.info()?.name || 'LICREAMO');
  readonly brandMark = computed(() => {
    const n = this.brandName();
    return n.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'LM';
  });
  readonly logoSrc = computed<string | null>(() => {
    const u = this.tenant.info()?.logo_url;
    if (!u) return null;
    const m = u.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w128` : u;
  });

  private computeSection(url: string): string {
    // /courses/:id/learn[/:lessonId] cuenta como "my-courses" (vista alumno)
    if (/\/courses\/[^/]+\/learn(\/|$)/.test(url)) return 'my-courses';
    if (url.startsWith('/my-courses')) return 'my-courses';
    if (url.startsWith('/courses')) return 'courses';
    if (url.startsWith('/people')) return 'people';
    if (url.startsWith('/my-payments')) return 'my-payments';
    if (url.startsWith('/payments')) return 'payments';
    if (url.startsWith('/settings')) return 'settings';
    if (url.startsWith('/dashboard') || url === '/' || url === '') return 'dashboard';
    return '';
  }

  readonly userInitials = computed(() => {
    const name = this.auth.user()?.full_name ?? '';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  });

  readonly avatarSrc = computed<string | null>(() => {
    const u = this.auth.user()?.avatar_url;
    if (!u) return null;
    const m = u.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w128` : u;
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
    const map: Record<string, string> = {
      'dashboard': 'Dashboard',
      'courses': 'Cursos',
      'my-courses': 'Mis cursos',
      'people': 'Personas',
      'my-payments': 'Mis pagos',
      'payments': 'Pagos',
      'settings': 'Configuración',
    };
    return map[this.section()] ?? 'Dashboard';
  });
}
