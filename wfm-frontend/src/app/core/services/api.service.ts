import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ChangeRequest, DashboardMetrics, Employee, Group, Shift, ShiftDay } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiBaseUrl;

  private _mockGroups: Group[] = [
    { id: 'g1', name: 'CX-Norte', code: 'CX-N' },
    { id: 'g2', name: 'CX-Sur', code: 'CX-S' },
    { id: 'g3', name: 'Backoffice', code: 'BK-1' }
  ];

  private _mockEmployees: Employee[] = [
    { id: 'e1', name: 'Ana Velasco', username: 'ana', role: 'analyst', groupId: 'g1', groupName: 'CX-Norte', active: true },
    { id: 'e2', name: 'Luis Duarte', username: 'luis', role: 'supervisor', groupId: 'g1', groupName: 'CX-Norte', active: true },
    { id: 'e3', name: 'Camila Ríos', username: 'camila', role: 'analyst', groupId: 'g2', groupName: 'CX-Sur', active: true },
    { id: 'e4', name: 'Jorge Valdés', username: 'jorge', role: 'analyst', groupId: 'g3', groupName: 'Backoffice', active: true }
  ];

  private _mockShifts: Shift[] = [];

  constructor(private http: HttpClient) {}

  getDashboardSnapshot(): Observable<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`${this.base}/dashboard/metrics`).pipe(
      this.fallback<DashboardMetrics>({ onClock: 18, offClock: 7, pendingRequests: 5, alerts: 2 })
    );
  }

  getSchedule(range: { from: string; to: string; group?: string }): Observable<ShiftDay[]> {
    return this.http
      .get<ShiftDay[]>(`${this.base}/scheduling`, { params: { ...range } })
      .pipe(this.fallback(this.mockSchedule(range)));
  }

  moveShift(shiftId: string, payload: Partial<Shift>): Observable<{ success: boolean }> {
    const idx = this._mockShifts.findIndex(s => s.id === shiftId);
    if (idx !== -1) {
      this._mockShifts[idx] = { ...this._mockShifts[idx], ...payload };
    } else {
      this._mockShifts.push(payload as Shift);
    }
    return this.http
      .patch<{ success: boolean }>(`${this.base}/scheduling/${shiftId}`, payload)
      .pipe(this.fallback<{ success: boolean }>({ success: true }));
  }

  deleteShift(shiftId: string): Observable<{ success: boolean }> {
    this._mockShifts = this._mockShifts.filter(s => s.id !== shiftId);
    return this.http.delete<{ success: boolean }>(`${this.base}/scheduling/${shiftId}`).pipe(this.fallback<{ success: boolean }>({ success: true }));
  }

  bulkCreateShifts(shifts: Shift[]): Observable<{ success: boolean }> {
    this._mockShifts.push(...shifts);
    return this.http.post<{ success: boolean }>(`${this.base}/scheduling/bulk`, { shifts }).pipe(this.fallback<{ success: boolean }>({ success: true }));
  }

  clock(direction: 'in' | 'out'): Observable<{ timestamp: string }> {
    return this.http.post<{ timestamp: string }>(`${this.base}/attendance/clock-${direction}`, {}).pipe(
      this.fallback<{ timestamp: string }>({ timestamp: new Date().toISOString() })
    );
  }

  listRequests(): Observable<ChangeRequest[]> {
    return this.http.get<ChangeRequest[]>(`${this.base}/requests`).pipe(this.fallback<ChangeRequest[]>([]));
  }

  listGroups(): Observable<Group[]> {
    return this.http.get<Group[]>(`${this.base}/admin/groups`).pipe(this.fallback([...this._mockGroups]));
  }

  saveGroup(payload: Partial<Group>): Observable<Group> {
    return this.http.post<Group>(`${this.base}/admin/groups`, payload).pipe(this.fallback(this._simulateSaveGroup(payload)));
  }

  deleteGroup(id: string): Observable<boolean> {
    return this.http.delete<boolean>(`${this.base}/admin/groups/${id}`).pipe(this.fallback(this._simulateDeleteGroup(id)));
  }

  listEmployees(groupId?: string): Observable<Employee[]> {
    return this.http
      .get<Employee[]>(`${this.base}/admin/employees`, { params: { groupId: groupId ?? '' } })
      .pipe(this.fallback(groupId ? this._mockEmployees.filter(e => e.groupId === groupId) : [...this._mockEmployees]));
  }

  saveEmployee(payload: Partial<Employee>): Observable<Employee> {
    return this.http.post<Employee>(`${this.base}/admin/employees`, payload).pipe(this.fallback(this._simulateSaveEmployee(payload)));
  }

  deleteEmployee(id: string): Observable<boolean> {
    return this.http.delete<boolean>(`${this.base}/admin/employees/${id}`).pipe(this.fallback(this._simulateDeleteEmployee(id)));
  }

  // --- INTERNAL MOCK STATE ENGINE ---
  private _simulateSaveGroup(payload: Partial<Group>): Group {
    const existing = this._mockGroups.find(g => g.id === payload.id);
    if (existing) {
      Object.assign(existing, payload);
      return existing;
    }
    const newGroup = { ...payload, id: 'g' + Date.now() } as Group;
    this._mockGroups.push(newGroup);
    return newGroup;
  }

  private _simulateDeleteGroup(id: string): boolean {
    this._mockGroups = this._mockGroups.filter(g => g.id !== id);
    return true;
  }

  private _simulateSaveEmployee(payload: Partial<Employee>): Employee {
    const existing = this._mockEmployees.find(e => e.id === payload.id);
    const groupName = this._mockGroups.find(g => g.id === payload.groupId)?.name;
    if (existing) {
      Object.assign(existing, { ...payload, groupName });
      return existing;
    }
    const newEmp = { ...payload, id: 'e' + Date.now(), active: payload.active ?? true, groupName } as Employee;
    this._mockEmployees.push(newEmp);
    return newEmp;
  }

  private _simulateDeleteEmployee(id: string): boolean {
    this._mockEmployees = this._mockEmployees.filter(e => e.id !== id);
    return true;
  }

  private fallback<T>(mock: T) { return (source: Observable<T>) => source.pipe(catchError(() => of(mock))); }

  private mockSchedule(range: { from: string; to: string; group?: string }): ShiftDay[] {
    const start = new Date(range.from);
    const days: ShiftDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = date.toISOString().substring(0, 10);
      days.push({
        date: iso,
        shifts: this._mockShifts.filter(s => s.start.startsWith(iso) && (range.group ? s.group === range.group : true))
      });
    }
    return days;
  }
}
