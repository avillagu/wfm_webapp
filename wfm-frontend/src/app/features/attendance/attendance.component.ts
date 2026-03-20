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
    if (this.auth.role() === 'admin' || this.auth.role() === 'supervisor') {
      this.api.listEmployees().subscribe(emps => {
        const statuses = ['En turno', 'En descanso', 'En baño', 'Fuera de turno'];
        const list = emps.map(e => ({
          ...e,
          currentStatus: statuses[Math.floor(Math.random() * statuses.length)],
          timeInStatus: Math.floor(Math.random() * 120) + ' min'
        }));
        this.employeesStatus.set(list);
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
