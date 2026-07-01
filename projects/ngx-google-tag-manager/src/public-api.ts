/*
 * Public API Surface of @bloomscorp/ngx-google-tag-manager
 *
 * Drop-in compatible with `angular-google-tag-manager`: the exported symbol names
 * (GoogleTagManagerService, GoogleTagManagerModule, provideGoogleTagManager,
 * GoogleTagManagerConfig, GoogleTagManagerConfiguration, GoogleTagManagerConfigService)
 * are identical, so consuming apps only need to change the import path.
 */

export * from './lib/google-tag-manager-config';
export * from './lib/google-tag-manager-config.service';
export * from './lib/google-tag-manager.module';
export * from './lib/google-tag-manager.providers';
export * from './lib/google-tag-manager.service';
