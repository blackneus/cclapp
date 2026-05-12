import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { TenantService } from '../../core/services/tenant.service';
import { ToastService } from '../../core/ui/toast.service';
import { uploadToDriveWithProgress } from '../../core/utils/drive-upload';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1>Configuración del tenant</h1>
      </div>
    </div>

    <div class="card" style="max-width:640px">
      <div class="card-body" style="display:flex;flex-direction:column;gap:18px">
        <div class="logo-row">
          <div class="logo-preview" [class.empty]="!logoUrl()">
            @if (logoSrc(); as src) {
              <img [src]="src" alt="Logo"/>
            } @else {
              <span>{{ tenantInitials() }}</span>
            }
          </div>
          <div class="logo-actions">
            <input #fileInput type="file" accept="image/*" (change)="onLogoFile($event)" hidden />
            <button type="button" class="btn ghost sm" (click)="fileInput.click()" [disabled]="uploadingLogo()">
              {{ uploadingLogo() ? 'Subiendo… ' + logoPct() + '%' : (logoUrl() ? 'Cambiar logo' : 'Subir logo') }}
            </button>
            @if (logoUrl() && !uploadingLogo()) {
              <button type="button" class="btn ghost sm" (click)="removeLogo()">Quitar</button>
            }
            @if (uploadingLogo()) {
              <div class="cover-progress"><i [style.width.%]="logoPct()"></i></div>
            }
          </div>
        </div>

        <div class="field">
          <label for="name">Nombre del tenant</label>
          <input id="name" class="input" type="text" [(ngModel)]="name" name="name" placeholder="LICREAMO" />
          <span class="muted" style="font-size:11px">Se mostrará en el sidebar.</span>
        </div>
      </div>
      <div class="card-foot">
        <a routerLink="/dashboard" class="btn ghost">Cancelar</a>
        <button type="button" class="btn primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .page-head { margin-bottom:18px }
    .eyebrow { color:#6b7088; font-size:11px; letter-spacing:.06em; text-transform:uppercase; margin:0 0 4px }
    h1 { margin:0; font-size:22px; color:#1a2547 }
    .logo-row { display:flex; gap:18px; align-items:center }
    .logo-preview { width:96px; height:96px; border-radius:14px; background:#3a4cce; color:#fff; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:700; overflow:hidden; flex-shrink:0 }
    .logo-preview img { width:100%; height:100%; object-fit:cover }
    .logo-actions { display:flex; flex-direction:column; gap:8px; align-items:flex-start }
    .cover-progress { width:200px; height:4px; background:#e3e5ec; border-radius:2px; overflow:hidden }
    .cover-progress i { display:block; height:100%; background:#3a4cce; transition:width .2s ease }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly tenant = inject(TenantService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  name = '';
  readonly logoUrl = signal('');
  readonly uploadingLogo = signal(false);
  readonly logoPct = signal(0);
  readonly saving = signal(false);

  readonly tenantInitials = computed(() => {
    const n = this.name || '';
    return n.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'L';
  });

  readonly logoSrc = computed<string | null>(() => {
    const u = this.logoUrl();
    if (!u) return null;
    const m = u.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w256` : u;
  });

  async ngOnInit(): Promise<void> {
    const t = await this.tenant.load();
    if (t) {
      this.name = t.name ?? '';
      this.logoUrl.set(t.logo_url ?? '');
    }
  }

  async onLogoFile(ev: Event): Promise<void> {
    const target = ev.target as HTMLInputElement;
    const f = target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      this.toast.error('El archivo debe ser una imagen.');
      target.value = '';
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      this.toast.error('Imagen muy grande (máx 5 MB).');
      target.value = '';
      return;
    }
    this.uploadingLogo.set(true);
    this.logoPct.set(0);
    try {
      const res = await uploadToDriveWithProgress(
        this.http, f, (p) => this.logoPct.set(p), 'me/avatar',
      );
      this.logoUrl.set(`https://drive.google.com/uc?export=view&id=${res.file_id}`);
      this.toast.success('Logo cargado.');
    } catch {
      this.toast.error('No se pudo subir el logo.');
    } finally {
      this.uploadingLogo.set(false);
      target.value = '';
    }
  }

  removeLogo(): void { this.logoUrl.set(''); }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.tenant.update({
        name: this.name.trim(),
        logo_url: this.logoUrl(),
      });
      this.toast.success('Configuración actualizada.');
    } catch {
      this.toast.error('No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }
}
