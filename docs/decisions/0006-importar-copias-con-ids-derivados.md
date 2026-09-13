# 0006 — Importar una copia de seguridad con ids derivados de la cuenta de destino

**Fecha:** 2026-09-13
**Estado:** aceptada

## Contexto

Con la identidad propia ([`0005`](0005-identidad-propia-con-passkeys.md)) las llaves de acceso viven
en los móviles. Si se pierden todos, la cuenta queda inaccesible, y la única salida es abrir otra con
una invitación nueva y recuperar en ella el fichero que descarga la pantalla de copia de seguridad.

Los identificadores de las filas los genera el cliente (UUID, para que la cola offline pueda
reenviar sin duplicar) y en la base son **claves primarias globales, no por usuario**. Eso choca con
el caso que motiva importar:

*   Reutilizar los ids del fichero en la cuenta nueva **choca con la cuenta vieja**, que sigue
    existiendo aunque nadie pueda entrar en ella.
*   Generar ids nuevos al azar deja la importación **sin idempotencia**: un historial de años se sube
    en decenas de peticiones, y si una se corta, repetirla duplicaría todo lo que ya había entrado.

Además, el plan gratuito da **10 ms de CPU por invocación** y D1 admite **cien parámetros por
consulta**, así que el fichero no puede subirse de una vez.

## Decisión

*   **Cada fila entra con un id derivado** de la cuenta de destino y del id que traía en el fichero:
    los primeros 16 bytes de `SHA-256("gymbuddy-import|<usuario>|<id>")`, con los bits de versión y de
    variante de un **UUID de versión 8** (RFC 9562). En otra cuenta sale otro id, así que no choca con
    la de origen; en la misma cuenta sale siempre el mismo, así que repetir un lote o reanudar una
    importación cortada no duplica nada. La función vive en `packages/shared` y la usan los dos lados.
*   **Se sube por lotes, en orden**: ejercicios, rutinas y sesiones (con sus series y las marcas de
    cada serie). Cada lote tiene tope de entradas y de filas, se escribe con
    `insert … on conflict (id) do nothing` en un único `db.batch` —una transacción en D1— y lo que ya
    estaba no se reescribe. La PWA valida el fichero entero con el esquema de exportación antes de
    mandar el primero, y reparte los lotes con la misma función que el Worker usa para sus topes.
*   **Un ejercicio del catálogo que la cuenta ya sigue con otra ficha detiene la importación** con
    `import_conflict` (409), antes de escribir nada. Fusionar dos historiales en una ficha es otra
    decisión, que queda para cuando haga falta.
*   **Un ejercicio del catálogo que el destino no tiene sincronizado entra como propio**, con el
    nombre, el músculo y la parte del cuerpo que trae el fichero: perderlo se llevaría sus series.
*   **Una sesión que en el fichero seguía abierta entra cerrada** a la hora de su última serie (o de
    su comienzo, si no tiene ninguna): una cuenta solo puede tener una abierta, y un entrenamiento de
    un móvil perdido no se va a continuar.
*   **Las marcas personales se copian tal cual**, sin recalcularlas: son la historia de cada vez que
    se superó una, y recalcular sobre años de series no cabe en el límite de CPU.
*   **El perfil no se importa.** El nombre, el idioma y las unidades son los que se eligieron al abrir
    la cuenta nueva.

## Consecuencias

*   Importar una copia en la **misma cuenta que la exportó** no la reconoce como propia: los ids
    derivados son otros y el primer ejercicio del catálogo ya seguido la detiene. No es un caso que
    haga falta, porque esa cuenta ya tiene sus datos.
*   Un id derivado que ya existe **en otra cuenta** solo aparece si alguien lo fabricó a propósito con
    los ids de la copia; el Worker comprueba de quién es cada ejercicio, rutina y sesión antes de
    escribir y responde `conflicting_write`, para que ninguna serie acabe colgada de una fila ajena.
*   Una sesión o una rutina con más filas de las que caben en un lote no se puede importar; la PWA lo
    detecta al leer el fichero y no empieza. Con un tope de 150 filas no le pasa a un entrenamiento
    real.
*   Cambiar la forma del fichero sigue siendo subir su versión: el importador lee la versión 1 y
    rechaza cualquier otra con un aviso que dice que el problema es la app, no la copia.
