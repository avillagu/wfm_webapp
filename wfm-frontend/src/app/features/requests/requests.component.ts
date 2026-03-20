import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { Observable } from 'rxjs';
import { ChangeRequest } from '../../core/models/models';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, AsyncPipe, NgFor],
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.scss'
})
export class RequestsComponent {
  requests$: Observable<ChangeRequest[]> = this.api.listRequests();

  constructor(private api: ApiService) {}
}
