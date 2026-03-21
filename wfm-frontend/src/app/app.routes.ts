import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [roleGuard(['admin', 'supervisor'])],
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'admin',
        canActivate: [roleGuard(['admin', 'supervisor'])],
        loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent)
      },
      {
        path: 'scheduling',
        loadComponent: () => import('./features/scheduling/scheduling.component').then((m) => m.SchedulingComponent)
      },
      {
        path: 'attendance',
        loadComponent: () => import('./features/attendance/attendance.component').then((m) => m.AttendanceComponent)
      },
      {
        path: 'requests',
        loadComponent: () => import('./features/requests/requests.component').then((m) => m.RequestsComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
