import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  form = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });
  
  error = '';
  loading = false;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  submit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    
    const { username, password } = this.form.value;
    
    this.auth.login(username!, password!).subscribe({
      next: () => {
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Error al iniciar sesión. Verifique sus credenciales.';
      }
    });
  }
}
