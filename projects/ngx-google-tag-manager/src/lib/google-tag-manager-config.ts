export interface GoogleTagManagerConfig {
  id: string | null;
  gtm_auth?: string;
  gtm_preview?: string;
  gtm_resource_path?: string;
  gtm_csp_none?: string;
  gtm_mode?: 'silent' | 'noisy';
  [key: string]: string | null | undefined;
}
