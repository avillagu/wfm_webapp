import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket?: Socket;

  connect(token?: string) {
    if (this.socket) return;
    this.socket = io(environment.socketUrl, {
      transports: ['websocket'],
      auth: token ? { token } : undefined
    });
  }

  on<T>(event: string) {
    return new Observable<T>((observer) => {
      this.socket?.on(event, (payload: T) => observer.next(payload));
      return () => this.socket?.off(event);
    });
  }

  emit<T>(event: string, payload: T) {
    this.socket?.emit(event, payload);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
