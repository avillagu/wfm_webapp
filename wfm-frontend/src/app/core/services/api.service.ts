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
          active: u.is_active,
          current_activity: u.current_activity,
          activity_updated_at: u.activity_updated_at,
          activity_start_time: u.activity_start_time
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

  updateActivity(activity: string): Observable<any> {
    return this.http.put(`${this.base}/users/me/activity`, { activity }, { headers: this.headers });
  }

  moveShift(shiftId: string, payload: Partial<Shift>): Observable<any> {
    const startTime = payload.start?.split('T')[1]?.substring(0, 5);
    const endTime = payload.end?.split('T')[1]?.substring(0, 5);
    
    let shiftType = 'work';
    if (payload.color === '#16a34a') shiftType = 'descanso';
    else if (payload.color === '#ca8a04') shiftType = 'permiso';
    else if (payload.color === '#dc2626') shiftType = 'incapacidad';
    
    if (startTime && endTime && endTime <= startTime && shiftType === 'work') {
      shiftType = 'NIGHT';
    }
    
    const backendPayload = {
      userId: payload.empId,
      shiftDate: payload.start?.split('T')[0],
      startTime,
      endTime,
      shiftType
    };
    return this.http.put(`${this.base}/shifts/${shiftId}`, backendPayload, { headers: this.headers });
  }

  deleteShift(shiftId: string): Observable<any> {
    return this.http.delete(`${this.base}/shifts/${shiftId}`, { headers: this.headers });
  }

  bulkDeleteShifts(userIds: string[], startDate: string, endDate: string, groupId: string): Observable<any> {
    return this.http.post(`${this.base}/shifts/bulk-delete`, { userIds, startDate, endDate, groupId }, { headers: this.headers });
  }

  bulkCreateShifts(shifts: Shift[]): Observable<any> {
    const backendShifts = shifts.map(s => {
      const startTime = s.start.split('T')[1].substring(0, 5);
      const endTime = s.end.split('T')[1].substring(0, 5);
      let shiftType = s.color === '#16a34a' ? 'descanso' : 'work';
      if (endTime <= startTime && shiftType !== 'descanso') {
        shiftType = 'NIGHT';
      }
      return {
        userId: s.empId,
        groupId: parseInt(s.group) || s.group,
        shiftDate: s.start.split('T')[0],
        startTime,
        endTime,
        shiftType
      };
    });
    return this.http.post(`${this.base}/shifts/bulk`, { shifts: backendShifts }, { headers: this.headers });
  }

  getActivePunch(): Observable<any> {
    return this.http.get<any>(`${this.base}/punches/active`, { headers: this.headers });
  }

  listRequests(): Observable<ChangeRequest[]> {
    return this.http.get<ChangeRequest[]>(`${this.base}/change-requests`, { headers: this.headers });
  }

  getPunches(startDate: string, endDate: string, groupId?: string): Observable<any[]> {
    const params: any = { startDate, endDate };
    if (groupId) params.groupId = groupId;
    return this.http.get<any[]>(`${this.base}/punches`, { params, headers: this.headers });
  }

  private mapShiftsToDays(shifts: any[], startDate: string): ShiftDay[] {
    const parts = startDate.split('-').map(Number);
    // Create date in local time to avoid UTC shifts
    const start = new Date(parts[0], parts[1] - 1, parts[2]);
    const days: ShiftDay[] = [];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      
      // Manual ISO construction to avoid UTC offsets from toISOString()
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      const dayIso = `${y}-${m}-${dayStr}`;

      days.push({
        date: dayIso,
        shifts: (shifts || []).filter(s => {
          const sDate = String(s.shift_date).substring(0, 10);
          return sDate === dayIso;
        }).map(s => ({
          id: s.id,
          empId: s.user_id,
          agent: s.first_name + ' ' + s.last_name,
          role: s.role_name,
          group: String(s.group_id),
          start: `${String(s.shift_date).substring(0, 10)}T${s.start_time}`,
          end: `${String(s.shift_date).substring(0, 10)}T${s.end_time}`,
          status: 'planned',
          color: s.shift_type === 'descanso' ? '#16a34a' :
                 s.shift_type === 'permiso' ? '#ca8a04' :
                 s.shift_type === 'incapacidad' ? '#dc2626' : '#0284c7' 
        }))
      });
    }
    return days;
  }
}
