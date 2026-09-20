# Despliegue

GymBuddy es **un solo Worker** en `https://gymbuddy.juanmmm21.workers.dev`: la API responde en
`/api/*` y el mismo Worker sirve la PWA ya construida como *static assets*, así que hay un único
origen y ni CORS ni cabeceras expuestas (ADR
[`0004`](../decisions/0004-cloudflare-y-backend-typescript.md), revisión del 2026-09-14). Esa
dirección es además el `rpID` de las passkeys: **cambiarla obliga a cada persona a registrar la suya
otra vez** (ADR [`0005`](../decisions/0005-identidad-propia-con-passkeys.md)).

Producción vive en el entorno `[env.production]` de `apps/api/wrangler.toml`, con su propia D1. El
nivel superior del fichero es el de desarrollo, y apunta a `localhost`.

## Desplegar un cambio

Desde la raíz del repositorio, con la sesión de wrangler abierta:

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test   # lo mismo que la CI
pnpm build                                                # la PWA y el bundle del Worker
pnpm --filter @gymbuddy/api run db:migrate:remote          # solo si hay migración nueva
pnpm --filter @gymbuddy/api run deploy
```

Tres cosas que ya han mordido:

*   **`run deploy`, no `deploy`.** `pnpm deploy` a secas es un comando propio de pnpm que copia el
    paquete a otro directorio y no despliega nada.
*   **Nunca `wrangler deploy` sin `--env production`.** Los scripts lo llevan puesto. Sin él se
    subirían los `[vars]` de desarrollo —`WEBAUTHN_RP_ID = "localhost"`— y ninguna passkey
    funcionaría, y la migración apuntaría a la base local.
*   **La migración va antes del despliegue** cuando el código nuevo cuenta con la columna nueva, y
    **siempre después de una copia de seguridad** de la base (ver
    [copia de seguridad de la D1](copia-de-seguridad-de-la-d1.md)).

Un despliegue conserva los secretos que ya están puestos: no hay que repetirlos.

## Comprobar que salió

```bash
curl -s https://gymbuddy.juanmmm21.workers.dev/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' https://gymbuddy.juanmmm21.workers.dev/api/v1/sessions/active
```

El primero da 200; el segundo, 401 sin sesión (si diera 200 con HTML, `run_worker_first` no estaría
mandando `/api/*` al Worker). Y en la app, que el `index-*.js` que sirve producción sea el del
`pnpm build`.

## Los secretos

Los cuatro van por `wrangler secret` y **nunca** por `wrangler.toml`; el Worker los lee con
`readSecret` de `src/http/env.ts`, nunca como `c.env.X`, porque `wrangler types` los declara
obligatorios u opcionales según exista un `.dev.vars` en la máquina.

```bash
cd apps/api
pnpm exec wrangler secret put JWT_SECRET --env production
pnpm exec wrangler secret put ADMIN_TOKEN --env production
pnpm exec wrangler secret put VAPID_PUBLIC_KEY --env production
pnpm exec wrangler secret put VAPID_PRIVATE_KEY --env production
pnpm exec wrangler secret list --env production           # cuáles hay puestos
```

En local van en `apps/api/.dev.vars` (gitignorado); `.dev.vars.example` dice para qué es cada uno.

El par VAPID se genera con Node, sin dependencias, en el formato que espera el Worker (la pública,
un punto P-256 sin comprimir de 65 bytes; la privada, su escalar de 32; las dos en base64url):

```bash
node --input-type=module -e '
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", publicKey));
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
console.log("VAPID_PUBLIC_KEY=" + pub.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + jwk.d);
'
```

Las dos mitades se cambian **juntas**: una pública con la privada de otro par deja el aviso de
descanso roto sin que nada lo avise. Al rotarlas, las suscripciones guardadas siguen valiendo (son
del navegador), pero el servicio de push rechazará los envíos firmados con la clave nueva para las
suscripciones creadas con la vieja, así que hay que volver a activar el aviso en cada dispositivo.

## Poner en pie un despliegue desde cero

Solo hace falta si se pierde la cuenta o se cambia de dominio. **El paso 4 fija el `rpID`: decídelo
antes de que nadie registre una passkey.**

1.  `pnpm exec wrangler login`.
2.  `pnpm exec wrangler d1 create gymbuddy` → su `database_id` va a
    `[[env.production.d1_databases]]` de `wrangler.toml`.
3.  `pnpm exec wrangler r2 bucket create gymbuddy-media` (las fotos y vídeos de la técnica; ADR
    [`0010`](../decisions/0010-fotos-y-videos-de-la-tecnica-en-r2.md)). R2 hay que activarlo una vez
    en el panel de Cloudflare.
4.  `WEBAUTHN_RP_ID` (el dominio, sin esquema) y `WEBAUTHN_ORIGIN` (con `https://`) en
    `[env.production.vars]`. Son públicos y por eso van en el fichero, no en un secreto.
5.  Los cuatro secretos, como arriba.
6.  `pnpm --filter @gymbuddy/api run db:migrate:remote`.
7.  `pnpm build && pnpm --filter @gymbuddy/api run deploy`.
8.  Poblar el catálogo: **diecinueve** llamadas, una por grupo muscular, porque cada invocación
    tiene 10 ms de CPU (el Cron Trigger cada cinco minutos también las va dando solas):

    ```bash
    curl -X POST https://gymbuddy.juanmmm21.workers.dev/api/v1/admin/catalog/sync \
      -H "x-gymbuddy-admin-token: $ADMIN_TOKEN"
    curl -s https://gymbuddy.juanmmm21.workers.dev/api/v1/admin/catalog/status \
      -H "x-gymbuddy-admin-token: $ADMIN_TOKEN"     # hasta ver los 1323 ejercicios
    ```

9.  Una invitación para la primera cuenta (de un solo uso; en la base queda solo su digest):

    ```bash
    curl -X POST https://gymbuddy.juanmmm21.workers.dev/api/v1/admin/invitations \
      -H "x-gymbuddy-admin-token: $ADMIN_TOKEN"
    ```

10. Registrar la passkey desde el móvil y comprobar «añadir otro dispositivo» con el código de diez
    minutos.

## Integración continua

`.github/workflows/ci.yml` corre `typecheck`, `lint`, `format`, `test` y `build` en cada push a
`main`. **No despliega**: el despliegue se lanza a mano con los comandos de arriba, que es lo que
quiere una app de una persona —nada se va a producción sin que alguien lo mire.
