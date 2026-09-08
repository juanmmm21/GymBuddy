/**
 * Los secretos no se declaran en `wrangler.toml` —van por `wrangler secret` en producción
 * y por `.dev.vars` en local—, así que `wrangler types` no los conoce y sus tipos se
 * declaran aquí, fusionándose con el `Env` generado.
 */
interface Env {
  /** Protege `/api/v1/admin/*`. Sin él, esas rutas no existen. */
  readonly ADMIN_TOKEN?: string;
}
