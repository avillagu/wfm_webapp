import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ChangeRequest, DashboardMetrics, Employee, Group, Shift, ShiftDay } from '../models/models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private get headers() {
    const token = this.auth.user()?.token;
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  getDashboardSnapshot(): Observable<DashboardMetrics> {
    return this.http.get<any>(`${this.base}/reports/dashboard`, { headers: this.headers }).pipe(
      map(res => ({
        onClock: res.on_clock || 0,
        offClock: res.off_clock || 0,
        pendingRequests: res.pending_requests || 0,
        alerts: 0
      })),
      catchError(err => {
        console.error('Error fetching dashboard summary:', err);
        return throwError(() => err);
      })
    );
  }

  getSchedule(range: { from: string; to: string; group?: string }): Observable<ShiftDay[]> {
    return this.http.get<any[]>(`${this.base}/shifts/calendar`, { 
      params: { 
        startDate: range.from, 
        endDate: range.to,
        groupId: range.group || ''
      }, 
      headers: this.headers 
    }).pipe(
      map(res => this.mapShiftsToDays(res, range.from))
    );
  }

  saveGroup(payload: Partial<Group>): Observable<Group> {
    const isNew = !payload.id;
    // Auto-generate code from name if not provided
    const code = (payload as any).code || payload.name?.substring(0, 10).toUpperCase().replace(/\s+/g, '-') || 'GRP';
    const body = { ...payload, code };
    if (isNew) {
      return this.http.post<any>(`${this.base}/groups`, body, { headers: this.headers }).pipe(
        map(res => res.group || res)
      );
    } else {
      return this.http.put<any>(`${this.base}/groups/${payload.id}`, body, { headers: this.headers }).pipe(
        map(res => res.group || res)
      );
    }
  }

  listGroups(): Observable<Group[]> {
    return this.http.get<Group[]>(`${this.base}/groups`, { headers: this.headers });
  }

  deleteGroup(id: string): Observable<any> {
    return this.http.delete(`${this.base}/groups/${id}`, { headers: this.headers });
  }

  listEmployees(groupId?: string): Observable<Employee[]> {
    const url = groupId ? `${this.base}/users/group/${groupId}` : `${this.base}/users`;
    return this.http.get<any[]>(url, { headers: this.headers }).pipe(
      map(list => {
        const data = Array.isArray(list) ? list : (list as any).users || [];
        return data.map((u: any) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          username: u.username,
          role: u.role_name?.toLowerCase() || 'analyst',
          groupId: u.group_id,
          groupName: u.group_name,
          active: u.is_active
        }));
      })
    );
  }

  saveEmployee(payload: any): Observable<any> {
    const isNew = !payload.id;
    const nameParts = (payload.name || '').split(' ');
    const generatedUsername = payload.username || (payload.name || 'user').toLowerCase().replace(/\s+/g, '.');
    const backendPayload: any = {
      firstName: nameParts[0] || generatedUsername,
      lastName: nameParts.slice(1).join(' ') || '-',
      roleId: payload.role === 'admin' ? 1 : (payload.role === 'supervisor' ? 2 : 3),
      username: generatedUsername,
      email: payload.email || `${generatedUsername}@mapo.com`,
      password: payload.password || 'welcome123',
      groupId: payload.groupId ? parseInt(payload.groupId) : null,
      employeeCode: payload.employeeCode || `EMP${Date.now().toString().slice(-6)}`,
      isActive: payload.active !== false
    };
    
    if (isNew) {
      return this.http.post<any>(`${this.base}/users`, backendPayload, { headers: this.headers }).pipe(
        map(res => res.user || res)
      );
    } else {
      return this.http.put<any>(`${this.base}/users/${payload.id}`, backendPayload, { headers: this.headers }).pipe(
        map(res => res.user || res)
      );
    }
  }

  deleteEmployee(id: string): Observable<any> {
    return this.http.delete(`${this.base}/users/${id}`, { headers: this.headers });
  }

  clock(direction: 'in' | 'out'): Observable<any> {
    return this.http.post<any>(`${this.base}/punches/clock-${direction}`, {}, { headers: this.headers }).pipe(
      map(res => ({
        timestamp: direction === 'in' ? res.punch.punch_in : res.punch.punch_out
      }))
    );
  }

  moveShift(shiftId: string, payload: Partial<Shift>): Observable<any> {
    const backendPayload = {
      user_id: payload.empId,
      shift_date: payload.start?.split('T')[0],
      start_time: payload.start?.split('T')[1]?.substring(0, 5),
      end_time: payload.end?.split('T')[1]?.substring(0, 5),
      shift_type: payload.color === '#16a34a' ? 'descanso' : 'work'
    };
    return this.http.put(`${this.base}/shifts/${shiftId}`, backendPayload, { headers: this.headers });
  }

  deleteShift(shiftId: string): Observable<any> {
    return this.http.delete(`${this.base}/shifts/${shiftId}`, { headers: this.headers });
  }

  bulkCreateShifts(shifts: Shift[]): Observable<any> {
    const backendShifts = shifts.map(s => ({
      userId: s.empId,
      groupId: s.group,
      shiftDate: s.start.split('T')[0],
      startTime: s.start.split('T')[1].substring(0, 5),
      endTime: s.end.split('T')[1].substring(0, 5),
      shiftType: s.color === '#16a34a' ? 'descanso' : 'work'
    }));
    return this.http.post(`${this.base}/shifts/bulk`, { shifts: backendShifts }, { headers: this.headers });
  }

  listRequests(): Observable<ChangeRequest[]> {
    return this.http.get<ChangeRequest[]>(`${this.base}/change-requests`, { headers: this.headers });
  }

  private mapShiftsToDays(shifts: any[], startDate: string): ShiftDay[] {
    const start = new Date(startDate);
    const days: ShiftDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().substring(0, 10);
      days.push({
        date: iso,
        shifts: (shifts || []).filter(s => s.shift_date === iso).map(s => ({
          id: s.id,
          empId: s.user_id,
          agent: s.first_name + ' ' + s.last_name,
          role: s.role_name,
          group: s.group_id,
          start: `${s.shift_date}T${s.start_time}`,
          end: `${s.shift_date}T${s.end_time}`,
          status: 'planned',
          color: s.shift_type === 'descanso' ? '#16a34a' : '#0284c7' 
        }))
      });
    }
    return days;
  }
}
