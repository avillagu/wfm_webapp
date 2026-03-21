export type UserRole = 'admin' | 'supervisor' | 'analyst';

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  token: string;
  group?: string;
  groupId?: string;
}

export interface DashboardMetrics {
  onClock: number;
  offClock: number;
  pendingRequests: number;
  alerts: number;
}

export interface Shift {
  id: string;
  empId?: string;
  agent: string;
  role: string;
  group: string;
  start: string; // ISO string
  end: string;   // ISO string
  status: 'planned' | 'in-progress' | 'completed';
  color?: string;
}

export interface ShiftDay {
  date: string; // YYYY-MM-DD
  shifts: Shift[];
}

export interface ChangeRequestStep {
  label: string;
  status: 'pending' | 'done' | 'rejected';
  owner: string;
}

export interface ChangeRequest {
  id: string;
  employee: string;
  type: 'swap' | 'rest-day' | 'overtime';
  submittedAt: string;
  steps: ChangeRequestStep[];
}

export interface Group {
  id: string;
  name: string;
  code: string;
}

export interface Employee {
  id: string;
  name: string;
  username?: string;
  email?: string;
  role: UserRole;
  groupId: string;
  groupName?: string;
  active: boolean;
  current_activity?: string;
  activity_updated_at?: string;
  activity_start_time?: string;
}
