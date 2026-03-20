import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { Observable } from 'rxjs';
import { DashboardMetrics } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';

interface Permission {
  label: string;
  analyst: boolean;
  supervisor: boolean;
  admin: boolean;
  locked: boolean;   // admin always has all
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, AsyncPipe, NgIf, NgFor, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  metrics$: Observable<DashboardMetrics> = this.api.getDashboardSnapshot();
  showAlertsModal = false;
  realAlerts: { type: string, msg: string, time: string }[] = [];

  permissions: Permission[] = [
    { label: 'Ver propio horario',           analyst: true,  supervisor: true,  admin: true, locked: false },
    { label: 'Ver calendarios del grupo',    analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Ver todos los calendarios',    analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Editar / Arrastrar turnos',    analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Programación masiva',          analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Solicitar novedad/cambio',     analyst: true,  supervisor: true,  admin: true, locked: false },
    { label: 'Aprobar solicitudes',          analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Crear / Gestionar grupos',     analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Crear / Gestionar empleados',  analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Configurar reglas WFM',        analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Ver métricas de asistencia',   analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Exportar reportes',            analyst: false, supervisor: true,  admin: true, locked: false },
  ];

  constructor(protected api: ApiService, protected auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.calculateRealAlerts();
  }

  calculateRealAlerts() {
    const today = new Date().toISOString().substring(0, 10);
    const end = new Date(); end.setDate(end.getDate() + 7);
    this.api.getSchedule({ from: today, to: end.toISOString().substring(0, 10) }).subscribe(days => {
      this.realAlerts = [];
      days.forEach(day => {
        // Group shifts by employee for this day
        const byEmp: Record<string, any[]> = {};
        day.shifts.forEach(s => {
          if (!byEmp[s.empId!]) byEmp[s.empId!] = [];
          byEmp[s.empId!].push(s);
        });

        Object.keys(byEmp).forEach(empId => {
          const s = byEmp[empId];
          const name = s[0].agent;
          
          // Double shift or overlap detection
          if (s.length > 1) {
            const hasDescanso = s.some(x => x.color === '#16a34a');
            const hasTurno = s.some(x => x.color === '#0284c7');
            if (hasDescanso && hasTurno) {
              this.realAlerts.push({ type: 'warning', msg: `${name} tiene turno y descanso superpuestos el ${day.date}`, time: 'Detectado' });
            } else {
              this.realAlerts.push({ type: 'danger', msg: `${name} tiene ${s.length} turnos asignados el mismo día ${day.date}`, time: 'Crítico' });
            }
          }
          
          // Shift over 12 hours check (if only 1 shift)
          if (s.length === 1 && s[0].color === '#0284c7') {
             const startH = parseInt(s[0].start.split('T')[1].substring(0,2));
             const endH = parseInt(s[0].end.split('T')[1].substring(0,2));
             if ((endH < startH ? endH + 24 - startH : endH - startH) >= 12) {
               this.realAlerts.push({ type: 'danger', msg: `${name} asignado a un turno de más de 12 horas el ${day.date}`, time: 'Regla WFM' });
             }
          }
        });
      });
    });
  }

  goToRequests() {
    this.router.navigate(['/requests']);
  }

  savePermissions() {
    // In a real implementation this would POST to the backend
    alert('Permisos actualizados correctamente.');
  }
}
