# Copia de seguridad de la D1

Todo lo que GymBuddy sabe de quien entrena vive en una sola base: la D1 `gymbuddy` de producción
(una sola fuente de verdad, sin estado divergente). Este documento es la maniobra completa: qué se
copia, cómo se hace la copia, cómo se restaura y qué no devuelve una restauración.

Los comandos de aquí se ejecutaron de verdad el **2026-09-20** contra la cuenta: la copia, y la
restauración entera sobre una D1 recién creada, comprobando que los recuentos coinciden. Lo que
dice este documento sobre el comportamiento de D1 está medido, no supuesto.

## Qué hay dentro de la base y qué se queda fuera

Dentro, las dieciséis tablas del esquema: las cuentas y sus passkeys (la clave pública y el
contador), las invitaciones y los códigos de dispositivo, los ejercicios seguidos con su peso
habitual, las sesiones y sus series, las rutinas, las marcas personales, las suscripciones de aviso
de descanso, los metadatos de las fotos y vídeos de la técnica, y el snapshot del catálogo remoto
(1323 ejercicios).

Fuera de la base, y por tanto fuera de la copia:

*   **Los ficheros de foto y vídeo**, que están en el cubo R2 `gymbuddy-media`. No se copian (lo
    decidió Juan: «copia sin ficheros»). Lo que sí viaja es la fila de `exercise_media`, así que
    tras una restauración la ficha de un ejercicio puede referirse a un objeto que ya no está.
*   **Los secretos** (`JWT_SECRET`, `ADMIN_TOKEN`, las dos claves VAPID). Van por
    `wrangler secret` y se anotan aparte, nunca en el repositorio.
*   **Las passkeys**. Viven en el dispositivo y en el llavero de su plataforma; la base solo guarda
    su clave pública. Ninguna copia de la D1 las recupera y ninguna hace falta para conservarlas.
*   **El catálogo de ejercicios**, que es remoto y estático: si su snapshot se perdiese, se vuelve
    a poblar con diecinueve `POST /api/v1/admin/catalog/sync`.

## Tres redes, en el orden en que se usan

1.  **Time Travel**, que Cloudflare mantiene solo y gratis: devuelve *la misma* base a cualquier
    punto de los **últimos 30 días**. Es la primera opción ante un borrado accidental o una
    migración que salió mal, porque no necesita ningún fichero.
2.  **La copia lógica en SQL** (`apps/api/scripts/backup-d1.sh`), un volcado fuera de Cloudflare que
    no caduca. Es lo que queda cuando el daño es más viejo que esos 30 días o cuando la base entera
    ha desaparecido.
3.  **El export JSON de la app** (pantalla `/backup`), que es de una cuenta, no de la base, y lo
    hace Juan desde el móvil sin wrangler. Importar usa ids derivados de la cuenta de destino (ADR
    [`0006`](../decisions/0006-importar-copias-con-ids-derivados.md)), así que reimportar no
    duplica. No sustituye a las dos anteriores: no lleva passkeys, ni invitaciones, ni el catálogo.

La copia en SQL **se lanza a mano desde el portátil**: exportar una D1 es una operación del plano de
control (wrangler o la API REST), no algo que el Worker pueda hacer desde su binding, así que no hay
forma de dejarla en un Cron Trigger. La costumbre es hacerla **antes de cada migración en
producción** —así se hizo con la 0008, la 0009 y la 0010— y cada vez que se acumulan sesiones que
dolería perder; entre copia y copia, cubre Time Travel.

## Hacer la copia

```bash
cd apps/api
pnpm run db:export:remote                 # → .wrangler/backups/prod-<fecha UTC>.sql
pnpm run db:export:remote before-0013     # antes de aplicar la migración 0013
```

La etiqueta es opcional y entra en el nombre del fichero. El script exporta con
`wrangler d1 export … --remote --env production`, y **comprueba el volcado antes de dar la copia por
buena**: que no salió vacío y que declara todas las tablas del esquema Drizzle, que es de donde saca
la lista (una tabla nueva se vigila sin tocar el script). Si falta alguna, falla y lo dice: una copia
incompleta que parece buena es peor que un error.

Las copias caen en `apps/api/.wrangler/backups/`, que está en `.gitignore` con el resto de
`.wrangler/` porque **contienen datos reales**: nunca se versionan. El portátil no es un sitio
seguro para la única copia de nada, así que conviene mover el `.sql` a donde estén las demás cosas
importantes.

Una copia de esta base ocupa ~1,7 MB (16 tablas, 1568 sentencias `INSERT`), casi todo el snapshot
del catálogo.

## Restaurar

### Primero: Time Travel, si el daño entra en 30 días

```bash
cd apps/api
# Qué había en ese momento (acepta Unix o RFC3339)
pnpm exec wrangler d1 time-travel info gymbuddy --env production --timestamp 2026-09-20T18:00:00Z
# Volver ahí
pnpm exec wrangler d1 time-travel restore gymbuddy --env production --timestamp 2026-09-20T18:00:00Z
```

Restaura **sobre la base de producción**, sin crear nada ni tocar `wrangler.toml`, y por eso es la
vía rápida: el Worker sigue apuntando a la misma base. Lo que se escribió después del punto elegido
se pierde, así que antes de restaurar conviene hacer una copia en SQL del estado actual (con la
etiqueta `before-time-travel`) para poder mirar luego qué había.

### Después: una base nueva desde una copia en SQL

**El volcado no se puede aplicar tal cual.** `wrangler d1 export` declara las tablas en el orden en
que las tiene SQLite, no por dependencias, así que los `INSERT` de una tabla hija llegan antes de que
exista su tabla padre; D1 aplica **siempre** las claves ajenas y el `PRAGMA defer_foreign_keys=TRUE`
que el propio volcado trae en su primera línea no sobrevive al troceado del import, que se procesa en
varias transacciones. Comprobado: `wrangler d1 execute <base> --remote --file <la copia>` falla con
`no such table: main.user`, y aplicando primero el esquema y luego los datos, con
`FOREIGN KEY constraint failed`.

`apps/api/scripts/restore-d1.sh` es lo que sí funciona: separa el esquema de los datos y **reordena
los `INSERT` por dependencias** antes de aplicarlos.

```bash
cd apps/api
pnpm exec wrangler d1 create gymbuddy-restored          # una base vacía; anota su database_id
pnpm run db:restore:remote .wrangler/backups/prod-2026-09-20T192907Z.sql gymbuddy-restored
```

Pide teclear el nombre de la base para confirmar (con `-y` al final no pregunta, para encadenarlo), y
se niega a seguir si la base destino ya tiene tablas de GymBuddy: una copia se restaura **sobre una
base vacía**, porque si el esquema falla a medias la base se queda en un estado que no es ni el de
antes ni el de la copia. Al terminar imprime los recuentos de las tablas que duele perder.

Con la base restaurada, para que la use la app: poner su `database_id` en `[[env.production.d1_databases]]`
de `apps/api/wrangler.toml` y desplegar (`pnpm build && pnpm --filter @gymbuddy/api run deploy`). Las
migraciones **no** se aplican después: el volcado trae el esquema y también la tabla `d1_migrations`,
así que la base queda ya marcada como migrada.

Restaurar esta base costó 1569 consultas y **7527 filas escritas** de las 100.000 diarias del plan
gratuito; caben varios intentos el mismo día, pero no infinitos.

### Comprobar que la restauración está entera

El script lo imprime al final, y se puede repetir cuando se quiera:

```bash
pnpm exec wrangler d1 execute gymbuddy --remote --env production --yes --json --command \
  'SELECT (SELECT COUNT(*) FROM "user") AS "user", (SELECT COUNT(*) FROM "set_entry") AS "set_entry", (SELECT COUNT(*) FROM "personal_record") AS "personal_record", (SELECT COUNT(*) FROM "catalog_exercise") AS "catalog_exercise"'
```

Los recuentos tienen que coincidir con los del `.sql` de origen, que se cuentan sin red:

```bash
grep -c '^INSERT INTO "set_entry"' .wrangler/backups/prod-2026-09-20T192907Z.sql
```

Los recuentos van como subconsultas y no como `UNION ALL` porque D1 corta los compound `SELECT` con
demasiados términos (`too many terms in compound SELECT`).

### Lo que una restauración no devuelve

*   **Las passkeys registradas después de la copia.** El dispositivo conserva la suya, pero la base
    ya no la conoce y no deja entrar: se vuelve a registrar con una invitación o con un código de
    diez minutos desde un dispositivo que sí esté dentro. Por eso la copia se hace *después* de que
    alguien suma un móvil nuevo, no antes.
*   **Las fotos y los vídeos** que ya no estén en R2, que la copia no lleva. Las filas de
    `exercise_media` sí vuelven.
*   **Los retos de passkey a medias** (`auth_challenge`): vuelven caducados, que es lo correcto —
    el barrido programado los borra.
