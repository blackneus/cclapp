import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';

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
        path: 'my-courses',
        loadComponent: () =>
          import('./pages/courses/my-courses.component').then((m) => m.MyCoursesComponent),
      },
      {
        path: 'people',
        loadComponent: () =>
          import('./pages/people/people.component').then((m) => m.PeopleComponent),
      },
      {
        path: 'payments',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/payments/payments-admin.component').then((m) => m.PaymentsAdminComponent),
      },
      {
        path: 'my-payments',
        loadComponent: () =>
          import('./pages/payments/my-payments.component').then((m) => m.MyPaymentsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'courses/:id/enrollments',
        loadComponent: () =>
          import('./pages/courses/course-enrollments.component').then((m) => m.CourseEnrollmentsComponent),
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
        path: 'courses/:id/lessons/new',
        loadComponent: () =>
          import('./pages/courses/wizard/lesson-wizard.component').then((m) => m.LessonWizardComponent),
      },
      {
        path: 'courses/:id/lessons/:lessonId/edit',
        loadComponent: () =>
          import('./pages/courses/wizard/lesson-wizard.component').then((m) => m.LessonWizardComponent),
      },
      {
        path: 'courses/:id/import',
        loadComponent: () =>
          import('./pages/courses/course-import.component').then((m) => m.CourseImportComponent),
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
