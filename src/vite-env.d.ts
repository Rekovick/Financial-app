/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * '1' on a build for a host that cannot make cross-origin requests, such as
   * a sandboxed preview page. The app then explains that connecting to Google
   * Sheets isn't possible there rather than failing opaquely.
   */
  readonly VITE_PREVIEW_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
