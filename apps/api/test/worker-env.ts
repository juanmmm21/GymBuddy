import { env } from 'cloudflare:test';
import type { SecretName } from '../src/http/env';

/**
 * El `env` del Worker con secretos puestos, como los dejaría `wrangler secret put`. Se
 * añaden por aquí, y no en un literal de tipo `Env`, porque `wrangler types` solo declara
 * los secretos cuando existe un `.dev.vars` en la máquina: el tipo de `Env` cambiaría de un
 * ordenador a otro. En ejecución da igual, que es justo lo que resuelve `readSecret`.
 * La cadena vacía representa un secreto sin configurar.
 */
export function envWithSecrets(secrets: Partial<Record<SecretName, string>>): Env {
  // La aserción es necesaria en una máquina sin `.dev.vars`, donde `Env` no declara ningún
  // secreto; con `.dev.vars` sobra, y por eso la regla se desactiva en esta línea: sin el
  // disable, `pnpm lint` daría un resultado distinto según quién lo ejecute.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return { ...env, ...secrets } as Env;
}
