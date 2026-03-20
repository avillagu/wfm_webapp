import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
import { Shift, ShiftDay } from '../models/models';

export interface ShiftUpdateEvent {
  shiftId: string;
  start?: string;
  end?: string;
  group?: string;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  constructor(private api: ApiService, private realtime: RealtimeService) {}

  load(range: { from: string; to: string; group?: string }): Observable<ShiftDay[]> {
    return this.api.getSchedule(range);
  }

  move(shiftId: string, patch: Partial<Shift>) {
    this.realtime.emit<ShiftUpdateEvent>('schedule:update', { shiftId, ...patch });
    return this.api.moveShift(shiftId, patch);
  }

  listenUpdates() {
    return this.realtime.on<ShiftUpdateEvent>('schedule:updated');
  }
}
