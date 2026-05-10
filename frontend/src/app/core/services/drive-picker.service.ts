import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface DriveFile {
  fileId: string;
  name: string;
  mimeType: string;
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }): { requestAccessToken(): void };
    };
  };
};

declare const gapi: {
  load(lib: string, cb: () => void): void;
  client: {
    init(config: { apiKey?: string }): Promise<void>;
  };
};

declare const google_picker: {
  PickerBuilder: new () => {
    addView(view: unknown): unknown;
    setOAuthToken(token: string): unknown;
    setDeveloperKey(key: string): unknown;
    setCallback(cb: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => void): unknown;
    build(): { setVisible(v: boolean): void };
  };
  ViewId: Record<string, string>;
  Action: { PICKED: string };
};

@Injectable({ providedIn: 'root' })
export class DrivePickerService {
  private gapiLoaded = false;
  private gisLoaded = false;

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
  }

  private async ensureLoaded(): Promise<void> {
    await Promise.all([
      this.loadScript('https://apis.google.com/js/api.js').then(() =>
        new Promise<void>((res) => (window as unknown as { gapi: typeof gapi }).gapi.load('picker', () => { this.gapiLoaded = true; res(); }))
      ),
      this.loadScript('https://accounts.google.com/gsi/client').then(() => { this.gisLoaded = true; }),
    ]);
  }

  open(mimeTypes?: string[]): Promise<DriveFile> {
    return new Promise(async (resolve, reject) => {
      await this.ensureLoaded();

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: environment.googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          if (!resp.access_token) { reject(new Error('no token')); return; }
          this.buildPicker(resp.access_token, mimeTypes, resolve, reject);
        },
      });
      tokenClient.requestAccessToken();
    });
  }

  private buildPicker(
    token: string,
    mimeTypes: string[] | undefined,
    resolve: (f: DriveFile) => void,
    reject: (e: Error) => void,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gp = (window as any)['google']['picker'];

    // Note: setMimeTypes in DocsView is unreliable with Shared Drives — many files get hidden.
    // We omit the filter and accept anything; the parent flow can validate after selection if needed.
    const myDrive = new gp.DocsView(gp.ViewId.DOCS)
      .setIncludeFolders(true)
      .setOwnedByMe(true);
    const sharedWithMe = new gp.DocsView(gp.ViewId.DOCS)
      .setIncludeFolders(true)
      .setOwnedByMe(false);
    const sharedDrives = new gp.DocsView(gp.ViewId.DOCS)
      .setEnableDrives(true)
      .setIncludeFolders(true);
    void mimeTypes;

    const picker = new gp.PickerBuilder()
      .enableFeature(gp.Feature.SUPPORT_DRIVES)
      .addView(myDrive)
      .addView(sharedDrives)
      .addView(sharedWithMe)
      .setOAuthToken(token)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCallback((data: any) => {
        if (data.action === 'picked' && data.docs?.[0]) {
          const doc = data.docs[0];
          resolve({ fileId: doc.id, name: doc.name, mimeType: doc.mimeType });
        } else if (data.action === 'cancel') {
          reject(new Error('cancelled'));
        }
      })
      .build();

    picker.setVisible(true);
  }
}
