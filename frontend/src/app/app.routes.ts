import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('./pages/courses/courses-list.component').then((m) => m.CoursesListComponent),
      },
      {
        path: 'courses/new',
        loadComponent: () =>
          import('./pages/courses/course-form.component').then((m) => m.CourseFormComponent),
      },
      {
        path: 'courses/:id/edit',
        loadComponent: () =>
          import('./pages/courses/course-form.component').then((m) => m.CourseFormComponent),
      },
      {
        path: 'courses/:id/build',
        loadComponent: () =>
          import('./pages/courses/course-builder.component').then((m) => m.CourseBuilderComponent),
      },
      {
        path: 'courses/:id/learn',
        loadComponent: () =>
          import('./pages/courses/course-viewer.component').then((m) => m.CourseViewerComponent),
      },
      {
        path: 'courses/:id/learn/:lessonId',
        loadComponent: () =>
          import('./pages/courses/course-viewer.component').then((m) => m.CourseViewerComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
