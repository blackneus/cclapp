import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { uploadToDriveWithProgress } from '../../core/utils/drive-upload';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Cuenta</p>
        <h1>Mi perfil</h1>
      </div>
    </div>

    <div class="card" style="max-width:640px">
      <div class="card-body" style="display:flex;flex-direction:column;gap:18px">
        <div class="avatar-row">
          <div class="avatar-preview" [class.empty]="!avatarUrl()">
            @if (avatarSrc(); as src) {
              <img [src]="src" alt="Avatar"/>
            } @else {
              <span>{{ initials() }}</span>
            }
          </div>
          <div class="avatar-actions">
            <input #fileInput type="file" accept="image/*" (change)="onAvatarFile($event)" hidden />
            <button type="button" class="btn ghost sm" (click)="fileInput.click()" [disabled]="uploadingAvatar()">
              {{ uploadingAvatar() ? 'Subiendo… ' + avatarPct() + '%' : (avatarUrl() ? 'Cambiar foto' : 'Subir foto') }}
            </button>
            @if (avatarUrl() && !uploadingAvatar()) {
              <button type="button" class="btn ghost sm" (click)="removeAvatar()">Quitar</button>
            }
            @if (uploadingAvatar()) {
              <div class="cover-progress"><i [style.width.%]="avatarPct()"></i></div>
            }
          </div>
        </div>

        <div class="field">
          <label for="fullName">Nombre completo</label>
          <input id="fullName" class="input" type="text" [(ngModel)]="fullName" name="full_name" />
        </div>

        <div class="field" style="max-width:240px">
          <label for="birthday">Cumpleaños</label>
          <input id="birthday" class="input" type="date" [(ngModel)]="birthday" name="birthday" />
        </div>

        <div class="field" style="max-width:360px">
          <label>Email</label>
          <input class="input" type="text" [value]="auth.user()?.email ?? ''" disabled />
          <span class="muted" style="font-size:11px">El email no es editable.</span>
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
    .avatar-row { display:flex; gap:18px; align-items:center }
    .avatar-preview { width:96px; height:96px; border-radius:50%; background:#3a4cce; color:#fff; display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:600; overflow:hidden; flex-shrink:0 }
    .avatar-preview img { width:100%; height:100%; object-fit:cover }
    .avatar-preview.empty { background:#3a4cce }
    .avatar-actions { display:flex; flex-direction:column; gap:8px; align-items:flex-start }
    .cover-progress { width:200px; height:4px; background:#e3e5ec; border-radius:2px; overflow:hidden }
    .cover-progress i { display:block; height:100%; background:#3a4cce; transition:width .2s ease }
  `],
})
export class ProfileComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  fullName = '';
  birthday = '';
  readonly avatarUrl = signal('');
  readonly uploadingAvatar = signal(false);
  readonly avatarPct = signal(0);
  readonly saving = signal(false);

  readonly initials = computed(() => {
    const n = this.auth.user()?.full_name ?? '';
    return n.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  });

  readonly avatarSrc = computed(() => {
    const u = this.avatarUrl();
    if (!u) return null;
    const m = u.match(/(?:\/file\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w256` : u;
  });

  ngOnInit(): void {
    const u = this.auth.user();
    if (u) {
      this.fullName = u.full_name ?? '';
      this.birthday = (u.birthday ?? '').substring(0, 10);
      this.avatarUrl.set(u.avatar_url ?? '');
    }
  }

  async onAvatarFile(ev: Event): Promise<void> {
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
    this.uploadingAvatar.set(true);
    this.avatarPct.set(0);
    try {
      const res = await uploadToDriveWithProgress(
        this.http, f, (p) => this.avatarPct.set(p), 'me/avatar',
      );
      this.avatarUrl.set(`https://drive.google.com/uc?export=view&id=${res.file_id}`);
      this.toast.success('Foto cargada.');
    } catch {
      this.toast.error('No se pudo subir la foto.');
    } finally {
      this.uploadingAvatar.set(false);
      target.value = '';
    }
  }

  removeAvatar(): void { this.avatarUrl.set(''); }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.updateProfile({
        full_name: this.fullName.trim(),
        avatar_url: this.avatarUrl(),
        birthday: this.birthday,
      });
      this.toast.success('Perfil actualizado.');
    } catch {
      this.toast.error('No se pudo guardar el perfil.');
    } finally {
      this.saving.set(false);
    }
  }
}
