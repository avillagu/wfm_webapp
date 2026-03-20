import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent {
  
  export(type: string) {
    // Simulate generation delay
    setTimeout(() => {
      alert(`El reporte de ${type} ha sido generado y descargado con éxito.`);
    }, 1000);
  }
}
