import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toast-stack">
      @for (t of svc.toasts(); track t.id) {
        <div class="toast" [class]="'kind-' + t.kind" (click)="svc.dismiss(t.id)">
          <span class="toast-ico">{{ icon(t.kind) }}</span>
          <span class="toast-body">{{ t.message }}</span>
          <button class="toast-close" (click)="svc.dismiss(t.id); $event.stopPropagation()" aria-label="Cerrar">✕</button>
        </div>
      }
    </div>

    @if (svc.confirmDialog(); as c) {
      <div class="toast-confirm-backdrop" (click)="svc.resolveConfirm(false)">
        <div class="toast-confirm" (click)="$event.stopPropagation()">
          <div class="toast-confirm-head">{{ c.title }}</div>
          <div class="toast-confirm-body">{{ c.message }}</div>
          <div class="toast-confirm-foot">
            <button class="btn ghost" (click)="svc.resolveConfirm(false)">{{ c.cancelLabel }}</button>
            <button class="btn" [class.primary]="!c.destructive" [class.danger]="c.destructive"
                    (click)="svc.resolveConfirm(true)">{{ c.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ToastHostComponent {
  readonly svc = inject(ToastService);

  icon(kind: string): string {
    return { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' }[kind] ?? '•';
  }
}
