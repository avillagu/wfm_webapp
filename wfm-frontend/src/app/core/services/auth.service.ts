import { Injectable, computed, effect, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { tap, catchError } from 'rxjs/operators';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentUser, UserRole } from '../models/models';

interface AuthState {
  user: CurrentUser | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'wfm.auth';
  private state = signal<AuthState>({ user: null });

  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => !!this.state().user?.token);
  readonly role = computed(() => this.state().user?.role?.toLowerCase() as UserRole ?? null);

  constructor(private router: Router, private http: HttpClient) {
    this.restore();
    effect(() => {
      const snapshot = this.state();
      if (snapshot.user) {
        localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
      } else {
        localStorage.removeItem(this.storageKey);
      }
    });
  }

  login(username: string, password: string) {
    console.log('Iniciando intento de login para:', username);
    return this.http.post<any>(`${environment.apiBaseUrl}/auth/login`, { username, password })
      .pipe(
        tap(res => {
          console.log('Respuesta del servidor:', res);
          // Validación de integridad de la respuesta del backend
          if (!res || !res.token || !res.user) {
            throw new Error('Respuesta del servidor inválida (Capa de seguridad disparada)');
          }
          const user: CurrentUser = {
            id: res.user.id,
            name: `${res.user.first_name} ${res.user.last_name}`,
            role: res.user.role_name.toLowerCase() as UserRole,
            group: res.user.group_name,
            token: res.token
          };
          this.state.set({ user });
        }),
        catchError(err => {
          console.error('Error de autenticación:', err);
          this.state.set({ user: null });
          return throwError(() => err);
        })
      );
  }

  logout() {
    this.state.set({ user: null });
    localStorage.removeItem(this.storageKey);
    this.router.navigateByUrl('/login');
  }

  isAdmin() {
     return this.role() === 'admin';
  }

  private restore() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthState;
      // Una precaución adicional para limpiar tokens de simulación antiguos
      if (parsed?.user?.token && parsed.user.token.length > 50) { 
        this.state.set(parsed);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  }
}
