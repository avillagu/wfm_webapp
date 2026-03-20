import { Injectable, computed, effect, signal } from '@angular/core';
import { Router } from '@angular/router';
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
  readonly role = computed(() => this.state().user?.role ?? null);

  constructor(private router: Router) {
    this.restore();
    effect(() => {
      const snapshot = this.state();
      localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
    });
  }

  login(email: string, _password: string, role: UserRole, group?: string) {
    const token = crypto.randomUUID(); // placeholder until backend integration
    const user: CurrentUser = {
      id: crypto.randomUUID(),
      name: email.split('@')[0] ?? 'usuario',
      role,
      group,
      token
    };
    this.state.set({ user });
    return user;
  }

  logout() {
    this.state.set({ user: null });
    localStorage.removeItem(this.storageKey);
    this.router.navigateByUrl('/login');
  }

  private restore() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthState;
      if (parsed?.user?.token) {
        this.state.set(parsed);
      }
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  }
}
