import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, Optional, PLATFORM_ID } from '@angular/core';
import { GoogleTagManagerConfiguration } from './google-tag-manager-config.service';
import { GoogleTagManagerConfig } from './google-tag-manager-config';

/**
 * SSR-safe Google Tag Manager service that injects GTM on BOTH the server and the
 * browser.
 *
 * Unlike the original `angular-google-tag-manager`, this service never touches the
 * global `window` / `document`. Instead it injects the {@link DOCUMENT} token from
 * `@angular/common` — provided by BOTH the legacy `@nguniversal/express-engine` and
 * the modern `@angular/ssr` server runtimes (as well as the browser) — and operates
 * only on that document. This means it can render the GTM `<script>` straight into
 * the server-side HTML (so the tag is present in the very first byte the client
 * receives) without ever throwing `window is not defined` / `document is not defined`.
 *
 * Three SSR hazards are handled explicitly in {@link addGtmToDom}:
 *   - **A dataLayer bootstrap that is lost on the server.** The `{ 'gtm.start', event:
 *     'gtm.js' }` push is what fires GTM's built-in "All Pages" / Page View trigger —
 *     and therefore the GA4 configuration and pageview tags. During server render there
 *     is no live `dataLayer` to push it onto, so instead an inline bootstrap `<script>`
 *     is serialized into the `<head>`, immediately before the async loader. The browser
 *     executes it on parse — before the loader boots — so the loader starts against a
 *     `dataLayer` that already carries the `gtm.js` event. Without this, the loader
 *     boots against an empty `dataLayer`, the trigger never fires, and GA silently
 *     records nothing.
 *   - **Duplicate injection on hydration.** If the loader was already rendered
 *     server-side, the browser re-run detects the existing `#GTMscript` element and
 *     resolves instead of injecting a second copy (the bootstrap has already run via the
 *     inline `#GTMstart` script), so the `gtm.js` event fires exactly once.
 *   - **A promise that never resolves on the server.** The script `load` event only
 *     fires in a live browser. When there is no live window (server render), the
 *     promise resolves as soon as the tag has been inserted into the server DOM,
 *     rather than waiting forever for a `load` that can never come.
 *
 * Server vs. browser is determined with Angular's `isPlatformBrowser(PLATFORM_ID)`.
 * (`DOCUMENT.defaultView` is NOT a reliable signal: Angular's server DOM — Domino —
 * exposes a non-null mock `defaultView` during render, so a `defaultView != null`
 * check wrongly reports "browser" on the server and the bootstrap never gets
 * serialized into the HTML.)
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleTagManagerService {
  private isLoaded = false;
  private config: GoogleTagManagerConfig | null;

  constructor(
    @Optional()
    @Inject(GoogleTagManagerConfiguration)
    public googleTagManagerConfiguration: GoogleTagManagerConfiguration,
    @Optional() @Inject('googleTagManagerId') public googleTagManagerId: string,
    @Optional()
    @Inject('googleTagManagerMode')
    public googleTagManagerMode: 'silent' | 'noisy' = 'noisy',
    @Optional()
    @Inject('googleTagManagerAuth')
    public googleTagManagerAuth: string,
    @Optional()
    @Inject('googleTagManagerPreview')
    public googleTagManagerPreview: string,
    @Optional()
    @Inject('googleTagManagerResourcePath')
    public googleTagManagerResourcePath: string,
    @Optional()
    @Inject('googleTagManagerCSPNonce')
    public googleTagManagerCSPNonce: string,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {
    this.config = this.googleTagManagerConfiguration?.get();
    if (this.config == null) {
      this.config = { id: null };
    }

    this.config = {
      ...this.config,
      id: googleTagManagerId || this.config.id,
      gtm_auth: googleTagManagerAuth || this.config.gtm_auth,
      gtm_preview: googleTagManagerPreview || this.config.gtm_preview,
      gtm_resource_path:
        googleTagManagerResourcePath || this.config.gtm_resource_path,
    };
    if (this.config.id == null) {
      return;
    }
  }

  /**
   * SSR-safe window accessor. Derived from the injected document rather than the
   * global `window`. Only ever dereferenced behind an `isPlatformBrowser` check — on
   * the server this may be a non-null Domino mock, which callers must not treat as a
   * real browser window.
   */
  private get windowRef(): (Window & { dataLayer?: any[] }) | null {
    return (this.document?.defaultView as Window & { dataLayer?: any[] }) ?? null;
  }

  private checkForId(): boolean {
    if (this.googleTagManagerMode !== 'silent' && !this.config?.id) {
      throw new Error('Google tag manager ID not provided.');
    } else if (!this.config?.id) {
      return false;
    }
    return true;
  }

  public getDataLayer(): any[] {
    this.checkForId();
    // On the server there is no real data layer to push into; hand back a throwaway
    // array so callers can stay agnostic without crashing during server render.
    const window = this.windowRef;
    if (!isPlatformBrowser(this.platformId) || !window) {
      return [];
    }
    window.dataLayer = window.dataLayer || [];
    return window.dataLayer;
  }

  private pushOnDataLayer(obj: object): void {
    this.checkForId();
    const dataLayer = this.getDataLayer();
    dataLayer.push(obj);
  }

  public addGtmToDom(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.isLoaded) {
        return resolve(this.isLoaded);
      }
      if (!this.checkForId()) {
        return resolve(false);
      }
      const doc = this.document;

      // Duplicate-injection guard: if the loader is already in the DOM (e.g. it was
      // rendered server-side and we are now hydrating in the browser), don't inject a
      // second copy — treat GTM as already loaded. The dataLayer bootstrap has already
      // run (server-side via the inline `#GTMstart` script below), so we must NOT push
      // it again here.
      if (doc.getElementById('GTMscript')) {
        return resolve((this.isLoaded = true));
      }

      const isBrowser = isPlatformBrowser(this.platformId);

      // Bootstrap the dataLayer with the `gtm.js` event — this is what fires GTM's
      // "All Pages" / Page View trigger (and the GA4 pageview). In a live browser we
      // push straight onto the real dataLayer; on the server there is none, so we
      // serialize an inline bootstrap script below instead.
      if (isBrowser) {
        this.pushOnDataLayer({
          'gtm.start': new Date().getTime(),
          event: 'gtm.js',
        });
      }

      const gtmScript = doc.createElement('script');
      gtmScript.id = 'GTMscript';
      gtmScript.async = true;
      gtmScript.src = this.applyGtmQueryParams(
        this.config?.gtm_resource_path
          ? this.config.gtm_resource_path
          : 'https://www.googletagmanager.com/gtm.js'
      );
      if (this.googleTagManagerCSPNonce) {
        gtmScript.setAttribute('nonce', this.googleTagManagerCSPNonce);
      }

      // `load`/`error` only fire in a live browser. During server render there is no
      // live window, so resolve as soon as the tag is in the (server) DOM instead of
      // waiting for a `load` event that can never arrive.
      if (isBrowser) {
        gtmScript.addEventListener('load', () => {
          return resolve((this.isLoaded = true));
        });
        gtmScript.addEventListener('error', () => {
          return reject(false);
        });
      }
      doc.head.insertBefore(gtmScript, doc.head.firstChild);

      if (!isBrowser) {
        // Server render: the loader is now in the head but the dataLayer bootstrap was
        // discarded (no live window). Serialize an inline `<script>` carrying that
        // bootstrap and place it immediately BEFORE the loader, so in document order the
        // browser initializes `window.dataLayer` with the `gtm.js` event before the
        // async loader executes. Without this the loader boots against an empty
        // dataLayer, the "All Pages" trigger never fires, and GA records nothing.
        const startScript = doc.createElement('script');
        startScript.id = 'GTMstart';
        startScript.textContent =
          `(window.dataLayer=window.dataLayer||[]).push(` +
          `{'gtm.start':${new Date().getTime()},event:'gtm.js'});`;
        if (this.googleTagManagerCSPNonce) {
          startScript.setAttribute('nonce', this.googleTagManagerCSPNonce);
        }
        doc.head.insertBefore(startScript, gtmScript);
        return resolve((this.isLoaded = true));
      }
    });
  }

  public pushTag(item: object): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.checkForId()) {
        return resolve();
      }

      if (!this.isLoaded) {
        this.addGtmToDom()
          .then(() => {
            this.pushOnDataLayer(item);
            return resolve();
          })
          .catch(() => reject());
      } else {
        this.pushOnDataLayer(item);
        return resolve();
      }
    });
  }

  private applyGtmQueryParams(url: string): string {
    if (url.indexOf('?') === -1) {
      url += '?';
    }

    const config = this.config ?? { id: null };
    return (
      url +
      Object.keys(config)
        .filter((k) => config[k])
        .map((k) => `${k}=${config[k]}`)
        .join('&')
    );
  }
}
