# 0004 — Backend en TypeScript sobre Cloudflare Workers

**Fecha:** 2026-09-07
**Estado:** aceptada
**Sustituye la elección de stack de backend previa** (FastAPI + SQLModel + aiogram), tomada el mismo día y nunca implementada.

## Contexto

El requisito era alojar GymBuddy **gratis y sin depender del ordenador de casa**. La decisión [`0002`](0002-pwa-instalable-en-vez-de-app-nativa.md) ya obligaba a tener un backend siempre disponible, así que había que encontrar dónde ponerlo. El repaso de opciones (7 de septiembre de 2026) dejó poco en pie:

| Opción | Veredicto |
|---|---|
| Fly.io | Su plan gratuito desapareció: 2 horas de prueba y tarjeta. Entre 2 y 6 $/mes. |
| Render (free) | Se duerme a los 15 min y tarda ~1 min en despertar, **no admite disco persistente** y su Postgres gratuito **se borra a los 30 días**. |
| PythonAnywhere (free) | Sin soporte ASGI: FastAPI no arranca. |
| Oracle Cloud Always Free | Gratis de verdad y con máquina ARM real, pero exige administrar un servidor y en junio de 2026 Oracle **recortó a la mitad** el free tier ARM sin anunciarlo. |
| Cloudflare Workers + D1 + Pages | Gratis, sin arranque en frío y sin servidor que mantener. **No ejecuta Python.** |

## Decisión

Todo el proyecto va sobre **Cloudflare y en TypeScript**:

*   **Workers** — la API y el webhook del bot, con **Hono** como router y **grammY** como framework de Telegram.
*   **D1** — la base de datos (SQLite en el edge), con **Drizzle ORM** y sus migraciones.
*   **Pages** — la PWA de React.
*   **Zod** — los esquemas del contrato de la API, en un paquete compartido que importan el Worker y la PWA.

Se descarta el backend en Python (FastAPI + SQLModel + aiogram): Workers no lo ejecuta, y su soporte de Python no da para ese stack.

## Porqué

**Es la única opción gratis que además es cero mantenimiento.** Oracle también es gratis, pero a cambio de un servidor que hay que parchear, respaldar y vigilar para que no lo reclamen por inactividad — y de un proveedor que ya demostró que recorta el free tier sin avisar. Para una herramienta que se usa tres veces por semana en el gimnasio, que funcione sola pesa más que conservar el lenguaje.

**El coste del cambio era cero.** No existía ni una línea de código cuando se tomó la decisión. Hacerlo seis fases más tarde habría sido un rediseño.

**Los límites del plan gratuito no se rozan.** 100.000 peticiones/día en Workers y, en D1, 5 GB, 5 millones de filas leídas y 100.000 escritas al día. Una sesión de entrenamiento son unas 35 escrituras y el catálogo entero son 1323 filas.

**El proyecto pasa a un solo lenguaje, y eso elimina un bug de raíz.** El frontend ya era React + TypeScript. Con el backend también en TS, el contrato de la API deja de ser un `types/api.ts` sincronizado a mano contra unos esquemas Pydantic: pasa a ser **el mismo módulo importado por los dos lados**. La lógica de dominio pura —progresión, 1RM, estado de la mascota— vive igualmente en `packages/shared` y se ejecuta tanto en el Worker como en la PWA, con un solo juego de tests.

## Consecuencias

*   **El límite de 10 ms de CPU por invocación condiciona la sincronización del catálogo.** No se puede procesar los 1323 ejercicios de una vez: se sincroniza **un grupo muscular por invocación** (19 en total), encadenados por un Cron Trigger. Es natural, porque la API de origen ya está partida por músculo.
*   Se pierde el ecosistema Python (Pandas, NumPy) para análisis. GymBuddy no lo necesitaba: la matemática de progresión es aritmética de enteros.
*   `Decimal` no existe en TypeScript, pero **deja de hacer falta**: los pesos se guardan como enteros de gramos y toda la aritmética es entera y exacta. Donde una fórmula produce fracción (el 1RM de Epley), se redondea a gramos de forma explícita.
*   No hay `docker compose`: el desarrollo local es `wrangler dev`, que ejecuta el Worker y una D1 local de verdad.
*   Se depende de un único proveedor.

*   Se depende de un único proveedor. Es asumible: Drizzle habla SQLite estándar y Hono corre en Node, Bun y Deno, así que una mudanza sería cambiar el adaptador y el despliegue, no reescribir el dominio.

## Revisión — 2026-09-11

**grammY sale del stack** junto con el bot ([`0005`](0005-identidad-propia-con-passkeys.md)): el
Worker ya no recibe el webhook de Telegram. Entra `@simplewebauthn/server` para verificar las
passkeys. El resto de la decisión —Workers, D1, Pages, Hono, Drizzle y Zod, todo en TypeScript— no
cambia.

## Revisión — 2026-09-14: la PWA la sirve el mismo Worker, no Pages

**Pages sale del stack.** La PWA ya construida se sube con el Worker como *static assets*
(`[assets]` en `wrangler.toml`) y todo vive en un solo origen gratuito,
`gymbuddy.<subdominio de la cuenta>.workers.dev`. Lo decidió Juan el 14 de septiembre entre las tres
formas gratuitas de publicarla:

| Opción | Por qué no / por qué sí |
|---|---|
| PWA en `*.pages.dev` y API en `*.workers.dev` | Dos orígenes: CORS en el Worker y, sobre todo, listar las cabeceras de renovación de la sesión en `Access-Control-Expose-Headers`. Olvidarlo no rompe nada visible: la sesión deja de renovarse y caduca al mes. |
| `*.pages.dev` con la API detrás de una Pages Function | Un solo origen, pero una pieza más (la función con su *service binding*) que desplegar y mantener. |
| **Un solo Worker con la PWA como *static assets*** | Un origen, un despliegue y ningún CORS. Las peticiones a ficheros estáticos no cuentan en la cuota del plan gratuito. |

**Cómo queda.** `not_found_handling = "single-page-application"` devuelve el `index.html` en las
rutas de la app que no son un fichero, y `run_worker_first = ["/api/*"]` manda siempre la API al
Worker: sin eso, una ruta de la API que no existe respondería con la app en vez de con el error del
contrato. La PWA llama a la API por ruta relativa (`VITE_API_URL` vacío), y el Worker pasa a llamarse
`gymbuddy`, que es lo que forma la dirección.

**Consecuencias.**

*   **El dominio de las passkeys es el `*.workers.dev`** (ADR [`0005`](0005-identidad-propia-con-passkeys.md)).
    Renombrar el Worker o el subdominio de la cuenta obliga a todos a crear su llave otra vez.
*   **La PWA se construye antes que el Worker**: `pnpm build` va en ese orden, y `wrangler deploy` sube
    lo que haya en `apps/web/dist`. En desarrollo nada cambia: Vite sirve la app y hace de proxy de
    `/api`, y el script `dev` del Worker solo crea la carpeta vacía para que `wrangler dev` arranque.
*   Si algún día se compra un dominio, se enruta al mismo Worker; la mudanza es de passkeys, no de
    código.
