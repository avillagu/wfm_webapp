import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { RealtimeService } from '../core/services/realtime.service';

interface NavItem {
  path: string;
  label: string;
  hint: string;
  roles?: string[]; // Roles allowed (if not specified, all roles can access)
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit {
  navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', hint: 'Control y métricas', roles: ['admin', 'supervisor'] },
    { path: '/admin', label: 'Administración', hint: 'Usuarios y grupos', roles: ['admin', 'supervisor'] },
    { path: '/scheduling', label: 'Calendario', hint: 'Drag & Drop en vivo' },
    { path: '/attendance', label: 'Asistencias', hint: 'Clock-in/out' },
    { path: '/requests', label: 'Novedades', hint: 'Aprobaciones 3 pasos' },
    { path: '/reports', label: 'Reportes', hint: 'Exportes WFM' }
  ];

  constructor(
    protected auth: AuthService,
    private realtime: RealtimeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.auth.user()) {
      this.realtime.connect(this.auth.user()?.token);
    }
  }

  goTo(path: string) {
    this.router.navigateByUrl(path);
  }

  isVisible(item: NavItem): boolean {
    if (!item.roles) return true;
    const userRole = this.auth.role();
    if (!userRole) return false;
    return item.roles.includes(userRole);
  }
}
