import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  readonly confirmDialog = signal<ConfirmRequest | null>(null);

  private nextId = 1;
  private readonly DEFAULT_DURATION = 3500;

  show(message: string, kind: ToastKind = 'info', duration: number = this.DEFAULT_DURATION): void {
    const id = this.nextId++;
    this.toasts.update(list => [...list, { id, kind, message }]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, duration?: number): void { this.show(message, 'success', duration); }
  error(message: string, duration: number = 5000): void { this.show(message, 'error', duration); }
  info(message: string, duration?: number): void { this.show(message, 'info', duration); }
  warn(message: string, duration?: number): void { this.show(message, 'warn', duration); }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  confirm(opts: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.confirmDialog.set({
        id: this.nextId++,
        title: opts.title ?? 'Confirmar acción',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        destructive: opts.destructive ?? false,
        resolve,
      });
    });
  }

  resolveConfirm(ok: boolean): void {
    const c = this.confirmDialog();
    if (!c) return;
    this.confirmDialog.set(null);
    c.resolve(ok);
  }
}
