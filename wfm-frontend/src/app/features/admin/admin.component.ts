import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Employee, Group } from '../../core/models/models';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Permission {
  label: string;
  analyst: boolean;
  supervisor: boolean;
  admin: boolean;
  locked: boolean;   // admin always has all
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AsyncPipe, NgFor, NgIf],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  groups = signal<Group[]>([]);
  employees = signal<Employee[]>([]);
  selectedGroupId = signal<string | null>(null);

  showGroupForm = signal(false);
  showEmpForm = signal(false);

  // RBAC State
  editingPermissions = signal(false);
  permissions = signal<Permission[]>([
    { label: 'Ver propio horario',           analyst: true,  supervisor: true,  admin: true, locked: false },
    { label: 'Ver calendarios del grupo',    analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Ver todos los calendarios',    analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Editar / Arrastrar turnos',    analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Programación masiva',          analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Solicitar novedad/cambio',     analyst: true,  supervisor: true,  admin: true, locked: false },
    { label: 'Aprobar solicitudes',          analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Crear / Gestionar grupos',     analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Crear / Gestionar empleados',  analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Configurar reglas WFM',        analyst: false, supervisor: false, admin: true, locked: false },
    { label: 'Ver métricas de asistencia',   analyst: false, supervisor: true,  admin: true, locked: false },
    { label: 'Exportar reportes',            analyst: false, supervisor: true,  admin: true, locked: false },
  ]);

  groupForm = this.fb.group({
    id: [''],
    name: ['', Validators.required]
  });

  employeeForm = this.fb.group({
    id: [''],
    name: ['', Validators.required],
    username: [''],
    role: ['analyst', Validators.required],
    groupId: ['', Validators.required],
    active: [true]
  });

  constructor(private api: ApiService, private fb: FormBuilder) {}

  ngOnInit(): void {
    this.loadGroups();
  }

  loadGroups() {
    this.api.listGroups().subscribe((groups) => {
      this.groups.set(groups);
      if (!this.selectedGroupId() && groups.length) {
        this.selectedGroupId.set(groups[0].id);
      }
      this.employeeForm.patchValue({ groupId: this.selectedGroupId() ?? '' });
      this.loadEmployees();
    });
  }

  loadEmployees() {
    this.api.listEmployees(this.selectedGroupId() ?? undefined).subscribe((list) => this.employees.set(list));
  }

  editGroup(group: Group) {
    this.groupForm.patchValue(group);
    this.showGroupForm.set(true);
  }

  editEmployee(emp: Employee) {
    this.employeeForm.patchValue(emp);
    this.selectedGroupId.set(emp.groupId);
    this.showEmpForm.set(true);
  }

  saveGroup() {
    if (this.groupForm.invalid) return;
    const payload = { ...this.groupForm.getRawValue(), id: this.groupForm.value.id || undefined } as Partial<Group>;
    this.api.saveGroup(payload).subscribe(() => {
      this.groupForm.reset({ id: '', name: '' });
      this.showGroupForm.set(false);
      this.loadGroups();
    });
  }

  deleteGroup(id: string | null | undefined) {
    if (!id) return;
    this.api.deleteGroup(id).subscribe(() => {
      this.groupForm.reset();
      this.loadGroups();
    });
  }

  saveEmployee() {
    if (this.employeeForm.invalid) return;
    const payload = { ...this.employeeForm.getRawValue(), id: this.employeeForm.value.id || undefined } as Partial<Employee>;
    this.api.saveEmployee(payload).subscribe(() => {
      this.employeeForm.reset({ id: '', name: '', username: '', role: 'analyst', groupId: this.selectedGroupId() ?? '', active: true });
      this.showEmpForm.set(false);
      this.loadEmployees();
    });
  }

  deleteEmployee(id: string | null | undefined) {
    if (!id) return;
    this.api.deleteEmployee(id).subscribe(() => {
      this.employeeForm.reset();
      this.loadEmployees();
    });
  }

  onGroupFilterChange(id: string | null) {
    const value = id ?? '';
    this.selectedGroupId.set(value);
    this.employeeForm.patchValue({ groupId: value });
    this.loadEmployees();
  }

  toggleEditPermissions() {
    this.editingPermissions.set(!this.editingPermissions());
  }

  savePermissions() {
    // In a real implementation this would POST to the backend
    this.editingPermissions.set(false);
  }
}
