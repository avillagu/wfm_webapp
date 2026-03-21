import { CommonModule, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from '../../core/services/schedule.service';
import { Employee, Group, Shift, ShiftDay } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-scheduling',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf, FormsModule, DatePipe],
  templateUrl: './scheduling.component.html',
  styleUrl: './scheduling.component.scss'
})
export class SchedulingComponent implements OnInit {
  group = signal('');
  groups = signal<Group[]>([]);
  rangeStart = signal(new Date());
  days = signal<ShiftDay[]>([]);
  employees = signal<Employee[]>([]);

  // Popup / Modal state
  showBulkModal = signal(false);
  showDeleteModal = signal(false);
  showAddPopup = signal<{ empId: string; date: string } | null>(null);

  // Time & Type Selection
  customStartTime = '08:00';
  customEndTime = '16:00';
  customType: 'turno' | 'descanso' | 'permiso' | 'incapacidad' = 'turno';

  // Drag state (native HTML5)
  private draggingShift: Shift | null = null;

  // Bulk scheduling
  selectedBulkEmployees: string[] = [];
  bulkStartDate = '';
  bulkEndDate = '';
  bulkType: 'turno' | 'descanso' | 'permiso' | 'incapacidad' = 'turno';
  selectedBulkDays: number[] = [1, 2, 3, 4, 5, 6, 0]; // 0=Sunday, 1=Monday...

  // Bulk delete
  deleteEmpIds: string[] = [];
  deleteDateFrom = '';
  deleteDateTo = '';

  typeConfig: Record<string, { label: string; color: string; borderColor: string }> = {
    turno:       { label: 'Turno',       color: '#e0f2fe', borderColor: '#0284c7' },
    descanso:    { label: 'Descanso',    color: '#dcfce7', borderColor: '#16a34a' },
    permiso:     { label: 'Permiso',     color: '#fef9c3', borderColor: '#ca8a04' },
    incapacidad: { label: 'Incapacidad', color: '#fee2e2', borderColor: '#dc2626' }
  };

  constructor(
    private scheduling: ScheduleService,
    protected auth: AuthService,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.loadGroups();
    this.load();
    this.scheduling.listenUpdates().subscribe(event => { if (event) this.load(); });
  }

  // ── LOADING ──────────────────────────────────────────
  loadGroups() {
    this.api.listGroups().subscribe(groups => {
      this.groups.set(groups);
      if (groups.length && !this.group()) this.group.set(groups[0].id);
      this.loadEmployees();
    });
  }

  loadEmployees() {
    this.api.listEmployees(this.group()).subscribe(list => {
      this.employees.set(list);
      this.selectedBulkEmployees = list.map(e => e.id);
      this.deleteEmpIds = list.map(e => e.id);
    });
  }

  load() {
    if (!this.group() && this.groups().length) this.group.set(this.groups()[0].id);
    const start = this.toIso(this.rangeStart());
    const endDate = new Date(this.rangeStart());
    endDate.setDate(endDate.getDate() + 6);
    const to = this.toIso(endDate);
    this.scheduling.load({ from: start, to, group: this.group() }).subscribe(days => {
      this.days.set(days);
      this.bulkStartDate = start;
      this.bulkEndDate = to;
      this.deleteDateFrom = start;
      this.deleteDateTo = to;
    });
    this.loadEmployees();
  }

  // ── CELL HELPERS ──────────────────────────────────────
  getCellShifts(empId: string, date: string): Shift[] {
    const day = this.days().find(d => d.date === date);
    return day ? day.shifts.filter(s => s.empId === empId) : [];
  }

  getShiftLabel(shift: Shift): string {
    const c = shift.color;
    if (c === '#16a34a') return 'Descanso';
    if (c === '#ca8a04') return 'Permiso';
    if (c === '#dc2626') return 'Incapacidad';
    const s = shift.start.split('T')[1]?.substring(0, 5) || '';
    const e = shift.end.split('T')[1]?.substring(0, 5) || '';
    return `${s} – ${e}`;
  }

  getSpanishDay(isoDate: string): string {
    const d = new Date(isoDate + 'T12:00:00Z'); // force midday to avoid timezone shift
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[d.getUTCDay()];
  }

  // ── ADD SHIFT ─────────────────────────────────────────
  openAddPopup(emp: Employee, date: string) {
    this.customType = 'turno';
    this.customStartTime = '08:00';
    this.customEndTime = '16:00';
    this.showAddPopup.set({ empId: emp.id, date });
  }

  confirmAddShift() {
    const popup = this.showAddPopup();
    if (!popup) return;
    const emp = this.employees().find(e => e.id === popup.empId);
    if (!emp) return;
    const cfg = this.typeConfig[this.customType];
    const isNovedad = this.customType !== 'turno';
    const shift: Shift = {
      id: `${emp.id}-${popup.date}-${Date.now()}`,
      empId: emp.id,
      agent: emp.name,
      role: emp.role,
      group: emp.groupId,
      start: isNovedad ? `${popup.date}T00:00:00` : `${popup.date}T${this.customStartTime}:00`,
      end:   isNovedad ? `${popup.date}T23:59:00` : `${popup.date}T${this.customEndTime}:00`,
      status: 'planned',
      color: cfg.borderColor
    };

    // Use bulkCreateShifts so it properly creates a new record in DB
    this.api.bulkCreateShifts([shift]).subscribe({
      next: () => {
        this.showAddPopup.set(null);
        this.load(); // Fetch the real database IDs and correct dates
      },
      error: (err) => {
        console.error("Error creating individual shift:", err);
        alert('Error al crear el turno: ' + (err.error?.message || err.message));
        this.showAddPopup.set(null);
        this.load();
      }
    });
  }

  // ── DELETE ────────────────────────────────────────────
  deleteShift(shift: Shift, date: string) {
    this.api.deleteShift(shift.id).subscribe(() => {
      const day = this.days().find(d => d.date === date);
      if (day) { day.shifts = day.shifts.filter(s => s.id !== shift.id); this.days.set([...this.days()]); }
    });
  }

  openDeleteModal() {
    this.deleteEmpIds = this.employees().map(e => e.id);
    this.deleteDateFrom = this.bulkStartDate;
    this.deleteDateTo = this.bulkEndDate;
    this.showDeleteModal.set(true);
  }

  confirmDeleteBulk() {
    const dates = this.buildDateRange(this.deleteDateFrom, this.deleteDateTo);
    const updated = this.days().map(day => {
      if (!dates.includes(day.date)) return day;
      const toDelete = day.shifts.filter(s => this.deleteEmpIds.includes(s.empId ?? ''));
      toDelete.forEach(s => this.api.deleteShift(s.id).subscribe());
      return { ...day, shifts: day.shifts.filter(s => !this.deleteEmpIds.includes(s.empId ?? '')) };
    });
    this.days.set(updated);
    this.showDeleteModal.set(false);
  }

  toggleDeleteEmployee(id: string) {
    const idx = this.deleteEmpIds.indexOf(id);
    if (idx !== -1) this.deleteEmpIds.splice(idx, 1); else this.deleteEmpIds.push(id);
  }

  // ── DRAG & DROP (native HTML5) ────────────────────────
  onDragStart(shift: Shift) { this.draggingShift = shift; }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('drag-over');
  }

  onDragLeave(event: DragEvent) {
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  onDropCell(event: DragEvent, targetEmpId: string, targetDate: string) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
    const shift = this.draggingShift;
    if (!shift) return;
    this.draggingShift = null;

    const oldDate = shift.start.split('T')[0];
    const oldEmpId = shift.empId;
    if (oldEmpId === targetEmpId && oldDate === targetDate) return;

    const targetDay = this.days().find(d => d.date === targetDate);
    const existingInTarget = targetDay?.shifts.find(s => s.empId === targetEmpId);
    const oldDay = this.days().find(d => d.date === oldDate);

    // Remove dragged shift from old location
    if (oldDay) oldDay.shifts = oldDay.shifts.filter(s => s.id !== shift.id);

    // If target cell was occupied, SWAP it back to old location
    if (existingInTarget) {
      if (targetDay) targetDay.shifts = targetDay.shifts.filter(s => s.id !== existingInTarget.id);
      const oldEmp = this.employees().find(e => e.id === oldEmpId);
      if (oldEmp && oldDay) {
        existingInTarget.empId = oldEmpId;
        existingInTarget.agent = oldEmp.name;
        existingInTarget.role = oldEmp.role;
        existingInTarget.group = oldEmp.groupId;
        existingInTarget.start = `${oldDate}T${existingInTarget.start.split('T')[1]}`;
        existingInTarget.end   = `${oldDate}T${existingInTarget.end.split('T')[1]}`;
        oldDay.shifts = [...oldDay.shifts, existingInTarget];
        this.api.moveShift(existingInTarget.id, existingInTarget).subscribe();
      }
    }

    // Place dragged shift in target
    const targetEmp = this.employees().find(e => e.id === targetEmpId);
    if (targetEmp) {
      shift.empId  = targetEmpId;
      shift.agent  = targetEmp.name;
      shift.role   = targetEmp.role;
      shift.group  = targetEmp.groupId;
      shift.start  = `${targetDate}T${shift.start.split('T')[1]}`;
      shift.end    = `${targetDate}T${shift.end.split('T')[1]}`;
      if (targetDay) targetDay.shifts = [...targetDay.shifts.filter(s => s.id !== shift.id), shift];
      this.days.set([...this.days()]);
      this.api.moveShift(shift.id, shift).subscribe();
    }
  }

  // ── BULK CREATE ───────────────────────────────────────
  bulkApply() {
    const cfg = this.typeConfig[this.bulkType];
    const isNovedad = this.bulkType !== 'turno';
    const dates = this.buildDateRange(this.bulkStartDate, this.bulkEndDate);
    const newShifts: Shift[] = [];
    const deleteOps: Array<import('rxjs').Observable<any>> = [];

    // Validate that all selected employees have a group
    const employeesWithoutGroup = this.selectedBulkEmployees
      .map(id => this.employees().find(e => e.id === id))
      .filter(e => e && !e.groupId);

    if (employeesWithoutGroup.length > 0) {
      alert(`Error: Los siguientes empleados no tienen grupo asignado: ${employeesWithoutGroup.map(e => e?.name).join(', ')}`);
      return;
    }

    this.selectedBulkEmployees.forEach(empId => {
      const emp = this.employees().find(e => e.id === empId);
      if (!emp) return;
      dates.forEach(date => {
        const dObj = new Date(date + 'T12:00:00Z');
        if (!this.selectedBulkDays.includes(dObj.getUTCDay())) return;

        const day = this.days().find(d => d.date === date);
        if (day) {
          // If shift exists, queue it for deletion first to prevent duplication
          const existing = day.shifts.find(s => s.empId === empId);
          if (existing) {
            deleteOps.push(this.api.deleteShift(existing.id));
            day.shifts = day.shifts.filter(s => s.id !== existing.id);
          }
        }

        const s: Shift = {
          id: `${empId}-${date}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          empId: emp.id, agent: emp.name, role: emp.role, group: String(emp.groupId),
          start: isNovedad ? `${date}T00:00:00` : `${date}T${this.customStartTime}:00`,
          end:   isNovedad ? `${date}T23:59:00` : `${date}T${this.customEndTime}:00`,
          status: 'planned', color: cfg.borderColor
        };
        newShifts.push(s);
        if (day) day.shifts = [...day.shifts, s];
      });
    });

    if (newShifts.length > 0) {
      this.days.set([...this.days()]);

      const proceedWithCreate = () => {
        this.api.bulkCreateShifts(newShifts).subscribe({
          next: (res) => {
            this.showBulkModal.set(false);
            // Show detailed result message
            let msg = `${res.created?.length || 0} turnos creados exitosamente`;
            if (res.skipped?.length > 0) {
              msg += `. ${res.skipped.length} omitidos (por superposición o reglas WFM)`;
            }
            if (res.errors?.length > 0) {
              msg += `. ${res.errors.length} errores (ver consola)`;
              console.error("Errores en carga masiva:", res.errors);
            }
            alert(msg);
            // Reload from server to reflect what was actually saved
            this.load();
          },
          error: (err) => {
            console.error("Error salvando turnos masivos:", err);
            // Mostrar error detallado al usuario
            const errorMsg = err.error?.message || err.error?.error || err.message || 'Error desconocido';
            alert(`Hubo un problema al crear los turnos: ${errorMsg}`);
            // Reload from server to show actual state
            this.load();
          }
        });
      };

      if (deleteOps.length > 0) {
        forkJoin(deleteOps).subscribe({
          next: () => proceedWithCreate(),
          error: (err) => {
            console.error("Error en eliminaciones previas:", err);
            alert('Error al eliminar turnos existentes. Intente nuevamente.');
            this.load();
          }
        });
      } else {
        proceedWithCreate();
      }
    }
  }

  toggleBulkEmployee(id: string) {
    const idx = this.selectedBulkEmployees.indexOf(id);
    if (idx !== -1) this.selectedBulkEmployees.splice(idx, 1); else this.selectedBulkEmployees.push(id);
  }

  toggleBulkDay(dayIndex: number) {
    const idx = this.selectedBulkDays.indexOf(dayIndex);
    if (idx !== -1) this.selectedBulkDays.splice(idx, 1); else this.selectedBulkDays.push(dayIndex);
  }

  // ── NAVIGATION ────────────────────────────────────────
  onGroupChange(value: string) { this.group.set(value); this.load(); }
  onDateChange(value: string)  { this.rangeStart.set(new Date(value)); this.load(); }
  nextWeek(offset: number) {
    const d = new Date(this.rangeStart());
    d.setDate(d.getDate() + offset * 7);
    this.rangeStart.set(d);
    this.load();
  }

  // ── UTILS ─────────────────────────────────────────────
  private toIso(date: Date): string { return date.toISOString().substring(0, 10); }

  private buildDateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const curr = new Date(from);
    const end  = new Date(to);
    while (curr <= end) { dates.push(this.toIso(curr)); curr.setDate(curr.getDate() + 1); }
    return dates;
  }
}
