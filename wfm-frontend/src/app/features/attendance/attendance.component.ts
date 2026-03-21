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
  shiftStartTime = signal<string | null>(null);

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
    // Refresh every 30 seconds
    setInterval(() => this.loadEmployeesStatus(), 30000);
  }

  loadMyStatus() {
    if (this.auth.role() === 'analyst') {
      this.api.getActivePunch().subscribe({
        next: (punch: any) => {
          if (punch && punch.punch_in && !punch.punch_out) {
            this.status.set('En turno');
            this.lastAction.set(punch.punch_in);
            this.shiftStartTime.set(punch.punch_in);
          }
        },
        error: () => { /* no active punch */ }
      });

      // Get current activity from user profile
      this.api.listEmployees().subscribe(emps => {
        const me = emps.find(e => e.id === this.auth.user()?.id);
        if (me) {
          if (me.current_activity && me.current_activity !== 'Fuera de turno') {
            this.status.set(me.current_activity as any);
            if (me.activity_start_time) {
              this.lastAction.set(me.activity_start_time);
            }
          }
        }
      });
    }
  }

  loadEmployeesStatus() {
    if (this.auth.role() === 'admin' || this.auth.role() === 'supervisor') {
      const today = new Date().toISOString().substring(0, 10);
      const now = new Date();

      // Get employees AND today's schedule in parallel
      this.api.listEmployees().subscribe(emps => {
        this.api.getSchedule({ from: today, to: today }).subscribe({
          next: (days) => {
            const todayShifts = days.length > 0 ? days[0].shifts : [];

            const list = emps.map(e => {
              const shift = todayShifts.find(s => s.empId === e.id);
              let currentStatus = e.current_activity || 'Sin turno programado';
              let timeInState = '-';
              let shiftStart = '-';
              let shiftEnd = '-';
              let totalTime = '-';

              if (shift) {
                const shiftStartTime = shift.start.split('T')[1]?.substring(0, 5) || '00:00';
                const shiftEndTime = shift.end.split('T')[1]?.substring(0, 5) || '23:59';
                shiftStart = shiftStartTime;
                shiftEnd = shiftEndTime;

                if (shift.color === '#16a34a') {
                  currentStatus = 'Descanso programado';
                } else {
                  // Check if within shift hours
                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const startMins = parseInt(shiftStartTime.split(':')[0]) * 60 + parseInt(shiftStartTime.split(':')[1]);
                  const endMins = parseInt(shiftEndTime.split(':')[0]) * 60 + parseInt(shiftEndTime.split(':')[1]);

                  if (nowMins >= startMins && nowMins <= endMins) {
                    // Within shift - use activity if set
                    if (e.current_activity && e.current_activity !== 'Fuera de turno') {
                      currentStatus = e.current_activity;
                    } else {
                      currentStatus = 'En turno';
                    }

                    // Calculate time in current state
                    if (e.activity_start_time) {
                      const activityStart = new Date(e.activity_start_time);
                      const activityStartMins = activityStart.getHours() * 60 + activityStart.getMinutes();
                      const elapsed = nowMins - activityStartMins;
                      timeInState = `${elapsed} min`;
                    } else {
                      const elapsed = nowMins - startMins;
                      timeInState = `${elapsed} min`;
                    }

                    // Calculate total time in shift
                    totalTime = `${nowMins - startMins} min`;
                  } else if (nowMins < startMins) {
                    currentStatus = 'Turno pendiente';
                    timeInState = `Inicia a las ${shiftStartTime}`;
                  } else {
                    currentStatus = 'Turno finalizado';
                    timeInState = `Terminó a las ${shiftEndTime}`;
                  }
                }
              }

              return {
                ...e,
                currentStatus,
                timeInState,
                shiftStart,
                shiftEnd,
                totalTime
              };
            });
            this.employeesStatus.set(list);
          },
          error: () => {
            const list = emps.map(e => ({
              ...e,
              currentStatus: e.current_activity || 'Sin datos',
              timeInState: '-',
              shiftStart: '-',
              shiftEnd: '-',
              totalTime: '-'
            }));
            this.employeesStatus.set(list);
          }
        });
      });
    }
  }

  listenToUpdates() {
    this.realtime.on('user:activity').subscribe((data: any) => {
      console.log('Activity update received:', data);
      this.loadEmployeesStatus();
      // If I'm the analyst who changed activity, reload my status too
      if (this.auth.role() === 'analyst' && data.userId === this.auth.user()?.id) {
        this.loadMyStatus();
      }
    });

    this.realtime.on('punch:updated').subscribe((data: any) => {
      console.log('Punch update received:', data);
      if (this.auth.role() === 'analyst' && data.userId === this.auth.user()?.id) {
        this.loadMyStatus();
      }
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
          this.shiftStartTime.set(null);
        },
        error: () => {
          this.status.set(newStatus);
          this.lastAction.set(null);
          this.shiftStartTime.set(null);
        }
      });
    } else if (newStatus === 'En turno' && this.status() === 'Fuera de turno') {
      this.api.clock('in').subscribe({
        next: (res: any) => {
          this.status.set(newStatus);
          this.lastAction.set(new Date().toISOString());
          this.shiftStartTime.set(res.timestamp);
        },
        error: () => {
          this.status.set(newStatus);
          this.lastAction.set(new Date().toISOString());
        }
      });
    } else {
      this.status.set(newStatus);
      this.lastAction.set(new Date().toISOString());
    }
  }
}
