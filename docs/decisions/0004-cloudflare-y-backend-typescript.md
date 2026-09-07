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
*   Se depende de un único proveedor. Es asumible: Drizzle habla SQLite estándar y Hono corre en Node, Bun y Deno, así que una mudanza sería cambiar el adaptador y el despliegue, no reescribir el dominio.
