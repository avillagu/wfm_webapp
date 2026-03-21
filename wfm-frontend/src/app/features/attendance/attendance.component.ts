import { CommonModule, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';

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

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private realtime: RealtimeService
  ) {}

  ngOnInit() {
    this.loadMyStatus();
    this.loadEmployeesStatus();
    this.listenToUpdates();
  }

  loadMyStatus() {
    if (this.auth.role() === 'analyst') {
      this.api.getActivePunch().subscribe({
        next: (punch: any) => {
          if (punch && punch.punch_in && !punch.punch_out) {
            this.status.set('En turno');
            this.lastAction.set(punch.punch_in);

            // Get exact intra-day activity if possible
            this.api.listEmployees().subscribe(emps => {
              const me = emps.find(e => e.id === this.auth.user()?.id);
              if (me && me.current_activity && me.current_activity !== 'Fuera de turno') {
                this.status.set(me.current_activity as any);
                if (me.activity_updated_at) this.lastAction.set(me.activity_updated_at);
              }
            });
          }
        },
        error: () => { /* no active punch */ }
      });
    }
  }

  loadEmployeesStatus() {
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
              let breakTime = '-';
              let bathroomTime = '-';
              let totalTime = '-';

              if (shift) {
                const shiftStart = shift.start.split('T')[1]?.substring(0, 5) || '00:00';
                const shiftEnd = shift.end.split('T')[1]?.substring(0, 5) || '23:59';

                if (shift.color === '#16a34a') {
                  currentStatus = 'Descanso programado';
                  timeInStatus = `${shiftStart} - ${shiftEnd}`;
                } else if (currentTime >= shiftStart && currentTime <= shiftEnd) {
                  // Si el sistema dice "En turno", miremos si el usuario presionó "En baño"
                  if (e.current_activity && e.current_activity !== 'Fuera de turno') {
                    currentStatus = e.current_activity;
                  } else {
                    currentStatus = 'En turno';
                  }

                  // Calculate mins since shift started or activity started
                  let startMins = parseInt(shiftStart.split(':')[0]) * 60 + parseInt(shiftStart.split(':')[1]);
                  if (e.current_activity !== 'Fuera de turno' && e.activity_updated_at) {
                    const actD = new Date(e.activity_updated_at);
                    startMins = actD.getHours() * 60 + actD.getMinutes();
                  }

                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const elapsed = nowMins - startMins;
                  timeInStatus = `${elapsed} min`;
                  
                  // Calculate total time in shift (from start to now)
                  const totalMins = nowMins - (parseInt(shiftStart.split(':')[0]) * 60 + parseInt(shiftStart.split(':')[1]));
                  totalTime = `${totalMins} min`;
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
                timeInStatus,
                breakTime,
                bathroomTime,
                totalTime
              };
            });
            this.employeesStatus.set(list);
          },
          error: () => {
            // If can't load schedule, show employees without status
            const list = emps.map(e => ({
              ...e,
              currentStatus: 'Sin datos',
              timeInStatus: '-',
              breakTime: '-',
              bathroomTime: '-',
              totalTime: '-'
            }));
            this.employeesStatus.set(list);
          }
        });
      });
    }
  }

  listenToUpdates() {
    // Listen for activity updates from other users
    this.realtime.on('user:activity').subscribe((data: any) => {
      console.log('Activity update received:', data);
      // Reload the employees status to reflect the change
      this.loadEmployeesStatus();
    });

    // Also listen for punch events
    this.realtime.on('punch:updated').subscribe((data: any) => {
      console.log('Punch update received:', data);
      // If I'm analyst, check if it's my punch
      if (this.auth.role() === 'analyst' && data.userId === this.auth.user()?.id) {
        this.loadMyStatus();
      }
      // If I'm admin/supervisor, reload the list
      if (this.auth.role() === 'admin' || this.auth.role() === 'supervisor') {
        this.loadEmployeesStatus();
      }
    });
  }

  changeStatus(newStatus: 'En turno' | 'En descanso' | 'En baño' | 'Fuera de turno') {
    // Save to the db current_activity
    this.api.updateActivity(newStatus).subscribe();

    if (newStatus === 'Fuera de turno') {
      this.api.clock('out').subscribe({
        next: (res: any) => {
          this.status.set(newStatus);
          this.lastAction.set(null);
        },
        error: () => {
          this.status.set(newStatus);
          this.lastAction.set(null);
        }
      });
    } else if (newStatus === 'En turno' && this.status() === 'Fuera de turno') {
      // Clock in if coming from completely outside
      this.api.clock('in').subscribe({
        next: (res: any) => {
          this.status.set(newStatus);
          this.lastAction.set(new Date().toISOString());
        },
        error: () => {
          this.status.set(newStatus);
          this.lastAction.set(new Date().toISOString());
        }
      });
    } else {
      // Just an intraday state change
      this.status.set(newStatus);
      this.lastAction.set(new Date().toISOString());
    }
  }
}
