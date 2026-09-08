interface ImportMetaEnv {
  /** Origen del Worker en producción. Vacío en desarrollo: el proxy de Vite hace el trabajo. */
  readonly VITE_API_URL?: string;
}
