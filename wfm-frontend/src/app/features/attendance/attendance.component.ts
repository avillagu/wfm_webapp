import { CommonModule, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor, NgClass, DatePipe],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss'
})
export class AttendanceComponent implements OnInit {
  lastAction = signal<string | null>(null);
  status = signal<'En turno' | 'En descanso' | 'En baño' | 'Fuera de turno'>('Fuera de turno');
  
  employeesStatus = signal<any[]>([]);

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    // Load active punch for the current user (analysts)
    this.api.getActivePunch().subscribe({
      next: (punch: any) => {
        if (punch && punch.punch_in && !punch.punch_out) {
          this.status.set('En turno');
          this.lastAction.set(punch.punch_in);
        }
      },
      error: () => { /* no active punch */ }
    });

    if (this.auth.role() === 'admin' || this.auth.role() === 'supervisor') {
      const today = new Date().toISOString().substring(0, 10);
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Get employees AND today's schedule in parallel
      this.api.listEmployees().subscribe(emps => {
        this.api.getSchedule({ from: today, to: today }).subscribe({
          next: (days) => {
            const todayShifts = days.length > 0 ? days[0].shifts : [];
            
            const list = emps.map(e => {
              const shift = todayShifts.find(s => s.empId === e.id);
              let currentStatus = 'Sin turno programado';
              let timeInStatus = '-';
              
              if (shift) {
                const shiftStart = shift.start.split('T')[1]?.substring(0, 5) || '00:00';
                const shiftEnd = shift.end.split('T')[1]?.substring(0, 5) || '23:59';
                
                if (shift.color === '#16a34a') {
                  currentStatus = 'Descanso programado';
                  timeInStatus = `${shiftStart} - ${shiftEnd}`;
                } else if (currentTime >= shiftStart && currentTime <= shiftEnd) {
                  currentStatus = 'En turno';
                  // Calculate mins since shift started
                  const startMins = parseInt(shiftStart.split(':')[0]) * 60 + parseInt(shiftStart.split(':')[1]);
                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const elapsed = nowMins - startMins;
                  timeInStatus = `${elapsed} min (${shiftStart} - ${shiftEnd})`;
                } else if (currentTime < shiftStart) {
                  currentStatus = 'Turno pendiente';
                  timeInStatus = `Inicia a las ${shiftStart}`;
                } else {
                  currentStatus = 'Turno finalizado';
                  timeInStatus = `Terminó a las ${shiftEnd}`;
                }
              }

              return {
                ...e,
                currentStatus,
                timeInStatus
              };
            });
            this.employeesStatus.set(list);
          },
          error: () => {
            // If can't load schedule, show employees without status
            const list = emps.map(e => ({
              ...e,
              currentStatus: 'Sin datos',
              timeInStatus: '-'
            }));
            this.employeesStatus.set(list);
          }
        });
      });
    }
  }

  changeStatus(newStatus: 'En turno' | 'En descanso' | 'En baño' | 'Fuera de turno') {
    const payload = newStatus === 'Fuera de turno' ? 'out' : 'in';
    this.api.clock(payload).subscribe({
      next: (res: any) => {
        this.status.set(newStatus);
        this.lastAction.set(newStatus === 'Fuera de turno' ? null : new Date().toISOString());
      },
      error: () => {
         this.status.set(newStatus);
         this.lastAction.set(newStatus === 'Fuera de turno' ? null : new Date().toISOString());
      }
    });
  }
}
