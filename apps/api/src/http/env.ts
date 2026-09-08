/**
 * Los secretos no se declaran en `wrangler.toml` —van por `wrangler secret` en producción y
 * por `.dev.vars` en local—, así que `wrangler types` solo los conoce si existe un
 * `.dev.vars` en la máquina, y entonces los declara **obligatorios**. Depender de eso haría
 * que `pnpm typecheck` diese un resultado distinto según quién lo ejecute.
 *
 * Por eso los secretos se leen siempre por aquí y nunca como `c.env.X`: el tipo de `Env` deja
 * de importar, y cada sitio que necesita uno tiene que decidir explícitamente qué hacer
 * cuando falta, que es la situación real de un Worker recién desplegado.
 */
export const SECRET_NAMES = [
  'ADMIN_TOKEN',
  'JWT_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

/** El valor del secreto, o `undefined` si no está puesto. La cadena vacía cuenta como no puesto. */
export function readSecret(env: Env, name: SecretName): string | undefined {
  // El cast es la frontera entre lo que wrangler sabe del `Env` y lo que de verdad hay en
  // ejecución: un secreto puede sencillamente no estar, lo declare como lo declare el tipo.
  const value = (env as Partial<Record<SecretName, string>>)[name];

  return value === undefined || value === '' ? undefined : value;
}
