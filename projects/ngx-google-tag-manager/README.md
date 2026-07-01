# @bloomscorp/ngx-google-tag-manager

[![npm version](https://img.shields.io/npm/v/@bloomscorp/ngx-google-tag-manager.svg)](https://www.npmjs.com/package/@bloomscorp/ngx-google-tag-manager)
[![license](https://img.shields.io/npm/l/@bloomscorp/ngx-google-tag-manager.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-%3E%3D18-DD0031?logo=angular&logoColor=white)](https://angular.dev)

**SSR-safe Google Tag Manager integration for Angular 18+ (and the latest Angular).**

A hardened, open-source fork of [`angular-google-tag-manager`](https://github.com/mzuccaroli/angular-google-tag-manager). It keeps the **exact same public API** (drop-in replacement) but fixes the one thing that breaks server-side rendering: the original reads the **global** `window` / `document`, which do not exist on the server.

## Features

- ✅ **SSR-safe** — never touches global `window` / `document`; renders server-side without `document is not defined`.
- ✅ **Works with both SSR runtimes** — the legacy `@nguniversal/express-engine` **and** the modern `@angular/ssr`.
- ✅ **Injects GTM into server-rendered HTML** — the loader is in the first byte the client receives, with duplicate-guarding on hydration.
- ✅ **Angular 18 → latest** — peer range `>=18.0.0`.
- ✅ **Drop-in** — identical exported symbols; migrate by changing the import path only.
- ✅ **Standalone & NgModule** APIs, zero runtime dependencies beyond `tslib`.

## Table of contents

- [Why this fork exists — SSR safety](#why-this-fork-exists--ssr-safety)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Migrating from `angular-google-tag-manager`](#migrating-from-angular-google-tag-manager)
- [Contributing](#contributing)
- [License](#license)

## Why this fork exists — SSR safety

The original service does this:

```ts
private browserGlobals = {
  windowRef() { return window; },     // ReferenceError on the server
  documentRef() { return document; }, // ReferenceError on the server
};
```

During SSR, `window` and `document` are not defined, so any code path that reaches them throws `window is not defined` / `document is not defined`.

This library instead:

- **Injects the `DOCUMENT` token** from `@angular/common` rather than reading the global `document`. The `DOCUMENT` token is provided by **both** SSR runtimes:
  - the **legacy** `@nguniversal/express-engine` (Angular ≤ 16), and
  - the **modern** `@angular/ssr` (Angular 17+).
- Derives the window from `DOCUMENT.defaultView` instead of the global `window` (no dependency on `PLATFORM_ID`).

### Server-side injection (renders the GTM tag into SSR HTML)

Because it operates on the injected `DOCUMENT`, `addGtmToDom()` injects the GTM
`<script>` on **both the server and the browser**. On a live-SSR route the loader is
written straight into the server-rendered HTML, so GTM is present in the first byte the
client receives (per Google's "as high in `<head>` as possible" guidance) instead of
waiting for Angular to bootstrap.

Two SSR hazards are handled so this is safe:

- **No duplicate on hydration** — if the loader was already rendered server-side,
  the browser re-run sees the existing `#GTMscript` and resolves instead of injecting a
  second copy.
- **Promise resolves on the server** — the script `load` event only fires in a live
  browser, so when there is no live window (`DOCUMENT.defaultView == null`) the promise
  resolves as soon as the tag is inserted, rather than hanging forever.

> ⚠️ **Server-rendered routes only.** If a route is served as a **prerendered/static**
> file (e.g. via `express.static` before your SSR handler), Angular does not run on the
> server for that request, so nothing — this library included — can inject the tag for
> it. Such routes get the tag client-side on hydration.

## Installation

```bash
npm install @bloomscorp/ngx-google-tag-manager
```

Peer dependencies: `@angular/common >=18.0.0`, `@angular/core >=18.0.0`.

## Usage

### Standalone (recommended, Angular 18+)

```ts
import { provideGoogleTagManager } from '@bloomscorp/ngx-google-tag-manager';

export const appConfig: ApplicationConfig = {
  providers: [
    provideGoogleTagManager({ id: 'GTM-XXXXXXX' }),
  ],
};
```

### NgModule

```ts
import { GoogleTagManagerModule } from '@bloomscorp/ngx-google-tag-manager';

@NgModule({
  imports: [
    GoogleTagManagerModule.forRoot({ id: 'GTM-XXXXXXX' }),
  ],
})
export class AppModule {}
```

### Injecting GTM and pushing events

```ts
import { GoogleTagManagerService } from '@bloomscorp/ngx-google-tag-manager';

constructor(private gtm: GoogleTagManagerService) {}

ngOnInit(): void {
  // Injects the GTM script — into the server-rendered HTML on live-SSR routes,
  // and in the browser. Safe to call from either environment; it de-dupes on hydration.
  this.gtm.addGtmToDom();
}

addToCart(): void {
  this.gtm.pushTag({ event: 'add_to_cart', /* ... */ });
}
```

## Configuration

```ts
interface GoogleTagManagerConfig {
  id: string | null;
  gtm_auth?: string;
  gtm_preview?: string;
  gtm_resource_path?: string;
  gtm_csp_none?: string;            // CSP nonce
  gtm_mode?: 'silent' | 'noisy';    // 'silent' = don't throw when id missing
  [key: string]: string | null | undefined;
}
```

### Public API

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `provideGoogleTagManager(config)` | function | Standalone provider (Angular 18+). |
| `GoogleTagManagerModule.forRoot(config)` | NgModule | Classic module registration. |
| `GoogleTagManagerService` | service | `addGtmToDom()`, `pushTag()`, `getDataLayer()`. |
| `GoogleTagManagerConfiguration` | service | Dynamic config holder. |
| `GoogleTagManagerConfigService` | token | DI token for the config. |
| `GoogleTagManagerConfig` | interface | Config shape. |

## Migrating from `angular-google-tag-manager`

The public API is identical, so only the import path changes:

```diff
- import { GoogleTagManagerService } from 'angular-google-tag-manager';
+ import { GoogleTagManagerService } from '@bloomscorp/ngx-google-tag-manager';
```

```diff
- import { GoogleTagManagerModule } from 'angular-google-tag-manager';
+ import { GoogleTagManagerModule } from '@bloomscorp/ngx-google-tag-manager';
```

Exported symbols (unchanged): `GoogleTagManagerService`, `GoogleTagManagerModule`, `provideGoogleTagManager`, `GoogleTagManagerConfig`, `GoogleTagManagerConfiguration`, `GoogleTagManagerConfigService`.

## Contributing

Contributions are welcome! This is a standard Angular library workspace.

```bash
# clone & install
git clone https://github.com/bloomscorp/ngx-google-tag-manager.git
cd ngx-google-tag-manager
npm install

# build the library -> dist/ngx-google-tag-manager
npm run build

# produce an installable tarball for local testing in another app
npm run pack:lib
```

The library source lives in `projects/ngx-google-tag-manager/src/`. Please open an issue
to discuss substantial changes before sending a PR, keep the public API drop-in compatible,
and make sure the library still builds cleanly under SSR.

### Publishing (maintainers)

```bash
npm run build
npm publish dist/ngx-google-tag-manager   # publishConfig.access is already "public"
```

## License

[MIT](./LICENSE) © Bloomscorp
