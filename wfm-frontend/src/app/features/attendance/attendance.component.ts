import { CommonModule, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
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
      const parts = new Date().toLocaleDateString('en-CA').split('-'); // YYYY-MM-DD local
      const today = `${parts[0]}-${parts[1]}-${parts[2]}`;
      const now = new Date();

      // Parallel data fetching
      forkJoin({
        emps: this.api.listEmployees(),
        shifts: this.api.getSchedule({ from: today, to: today }),
        punches: this.api.getPunches(today, today)
      }).subscribe({
        next: (data: any) => {
          const todayShifts = data.shifts.length > 0 ? data.shifts[0].shifts : [];
          
          const list = data.emps.map((e: any) => {
            const shift = todayShifts.find((s: any) => s.empId === e.id);
            const userPunches = data.punches.filter((p: any) => String(p.user_id) === String(e.id));
            
            // Calculate REAL punch times
            let shiftStart = '-';
            let shiftEnd = '-';
            
            if (userPunches.length > 0) {
              // Earliest punch in
              const sortedIns = [...userPunches]
                .filter(p => p.punch_in)
                .sort((a, b) => new Date(a.punch_in).getTime() - new Date(b.punch_in).getTime());
              
              if (sortedIns.length > 0) {
                shiftStart = new Date(sortedIns[0].punch_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              }

              // Latest punch out
              const sortedOuts = [...userPunches]
                .filter(p => p.punch_out)
                .sort((a, b) => new Date(b.punch_out).getTime() - new Date(a.punch_out).getTime());

              if (sortedOuts.length > 0) {
                shiftEnd = new Date(sortedOuts[0].punch_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              }
            }

            let currentStatus = e.current_activity || 'Fuera de turno';
            let timeInState = '-';
            let totalTime = '-';

            // If user is currently doing something, that IS their status!
            if (currentStatus !== 'Fuera de turno') {
              // Activity takes priority over schedule rules
              if (shift) {
                const schedEnd = shift.end.split('T')[1]?.substring(0, 5) || '23:59';
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const endMins = parseInt(schedEnd.split(':')[0]) * 60 + parseInt(schedEnd.split(':')[1]);
                if (nowMins > endMins) {
                  currentStatus = `${currentStatus} (Extra)`;
                }
              }
            } else if (shift) {
              // If Fuera de turno, check if they SHOULD be working
              const schedStart = shift.start.split('T')[1]?.substring(0, 5) || '00:00';
              const schedEnd = shift.end.split('T')[1]?.substring(0, 5) || '23:59';
              
              if (shift.color === '#16a34a') {
                currentStatus = 'Descanso programado';
              } else {
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const startMins = parseInt(schedStart.split(':')[0]) * 60 + parseInt(schedStart.split(':')[1]);
                const endMins = parseInt(schedEnd.split(':')[0]) * 60 + parseInt(schedEnd.split(':')[1]);

                if (nowMins >= startMins && nowMins <= endMins) {
                  currentStatus = 'En turno (Pendiente)';
                } else if (nowMins < startMins) {
                  currentStatus = 'Turno pendiente';
                  timeInState = `Inicia a las ${schedStart}`;
                } else {
                   currentStatus = shiftEnd === '-' ? 'Turno finalizado (Sin salida)' : 'Fuera de turno';
                }
              }
            }
            
            // Calculate time in status
            if (e.activity_start_time && e.current_activity !== 'Fuera de turno') {
              const diffMs = Math.abs(now.getTime() - new Date(e.activity_start_time).getTime());
              const diffMins = Math.floor(diffMs / 60000);
              timeInState = `${diffMins} min`;
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
        error: (err: any) => {
          console.error("Error loading monitor status:", err);
        }
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
