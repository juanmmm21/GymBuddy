# 0011 — Competir con amigos: una casilla, una lista de rivales y nada guardado de la competición

**Fecha:** 2026-10-13
**Estado:** aceptada y construida; revisada el 2026-10-14 (solo por peso, sin la semana).

## Contexto

GymBuddy nació como registro de una sola persona, pero entra gente por invitación y Juan pidió poder **competir contra sus amigos**: que salga una lista de usuarios para elegir, que **solo salgan los que han marcado una casilla**, y que él, que administra la app y tiene que probarla, los vea a todos. Hay pocas cuentas, así que la lista puede enseñarlas todas sin buscador ni solicitudes de amistad.

Hasta ahora ninguna ruta devolvía nada de otra cuenta: todo lo que cuelga de un usuario se filtra por el de la sesión. Esta es la primera vez que un dato de alguien llega al móvil de otro, así que lo que había que decidir era, sobre todo, **quién ve qué y con qué permiso**.

Juan eligió entre las opciones que se le enseñaron: comparar **la semana y las marcas**, con una **lista fija de rivales** (sin retos con fecha ni invitaciones) y con la excepción de administración entendida como **«Juan ve a todos»**.

## Decisión

*   **El permiso es una casilla de la cuenta, apagada por defecto:** `user.competes`. Solo quien la enciende puede ser elegido como rival, y es lo único que se le pide: no hay solicitud que aceptar, porque encenderla ya es el consentimiento. Vive en el perfil (`PATCH /auth/me`) y se enseña en Ajustes y en la pantalla de competir.
*   **El permiso se mira al leer, no al elegir.** Quien apaga la casilla desaparece en el momento de la clasificación de todos, aunque su fila siga en la lista de quien le eligió; si la vuelve a encender, reaparece donde estaba. Ninguna escritura ajena hace falta para retirarse.
*   **Lo que ve un rival es poco y está acotado:** el nombre, los días entrenados, las series y el volumen de la semana en curso, y el peso máximo y el 1RM estimado en los ejercicios **del catálogo** que comparte con quien mira. Ni sesiones, ni series, ni ejercicios propios, ni notas, ni fotos.
*   **La lista de rivales va en un solo sentido** (tabla `rival`, clave `user_id` + `rival_user_id`). Que Juan elija a Ana pone a Ana en la clasificación de Juan, no a Juan en la de Ana. `PUT /competition/rivals` sustituye la lista entera, así que repetir la petición deja lo mismo. Tope de **diez rivales** (`MAX_RIVALS`).
*   **La cuenta de administración ve a todos.** `user.is_admin` no tiene pantalla ni ruta que la cambie: se marca a mano en la base. Hoy decide una sola cosa —a quién se puede elegir sin que haya encendido la casilla—, y la lista le dice quién no la ha encendido todavía. El `ADMIN_TOKEN` no servía para esto: protege rutas de operación sin sesión, y aquí hace falta saber qué *cuenta* es la de Juan.
*   **No se guarda nada de la competición.** La semana de cada participante es la misma lectura que pinta el calendario de Hoy (`readWeekDays`), hecha una vez por persona, y las marcas son las vigentes de `personal_record`. No hay tabla de clasificaciones ni tarea que las recalcule: con diez rivales como mucho son once lecturas pequeñas, dentro de los 10 ms de CPU.
*   **Gana la constancia, no los kilos.** La semana se ordena por días entrenados; las series desempatan y el volumen solo después, porque los kilos premian siempre al más pesado y al día de pierna. En el cara a cara manda el **1RM estimado**, que es lo que sabe comparar un 100 × 1 con un 85 × 8, y el peso máximo desempata. Las dos reglas son funciones puras de `packages/shared/src/domain/competition.ts`.
*   **Solo se comparan ejercicios del catálogo, por su `catalogId`,** y con el nombre del catálogo: un ejercicio propio no significa lo mismo para dos personas, y el nombre que cada uno le pone a uno del catálogo tampoco. Los archivados y las marcas de cero kilos (peso corporal) no entran.

## Consecuencias

*   **La semana es la del calendario de Hoy: de lunes a domingo en UTC.** Una sesión de madrugada puede caer en el día anterior para todos por igual; no se ha añadido zona horaria por cuenta.
*   **La clasificación no se actualiza sola.** Lo que cambia lo cambian otros desde su móvil, así que se vuelve a pedir cada vez que se entra en la pantalla; no hay avisos ni push de «te han adelantado».
*   **Sin red no hay competición:** no entra en la instantánea del dispositivo ni en la cola offline. Es lo único de la app que no tiene sentido sin el Worker.
*   **La copia de seguridad en JSON no lleva ni la casilla ni la lista de rivales.** Son de la cuenta y de su relación con otras, no del historial de entrenamiento; al importar una copia en otra cuenta no habría a quién apuntar.
*   **Quien enciende la casilla se enseña a cualquiera de la app,** no solo a sus amigos. Mientras se entre por invitación y haya pocas cuentas es lo que pidió Juan; si la app creciera, haría falta que el elegido aceptase.
*   **La cuenta de administración ve la semana y las marcas de quien no ha dado permiso.** Es una excepción consciente y de una sola cuenta —la misma persona que ya tiene acceso a la base—, pensada para poder probar la función.

## Revisión: solo por peso (2026-10-14)

Juan lo probó y corrigió el criterio: **«no competimos por días, solo por peso»**. Eligió entre las opciones que se le dieron que mande el **peso máximo levantado** y que la clasificación de la semana **desaparezca del todo**.

*   **Fuera la semana.** `GET /competition` ya no lee el calendario de nadie: trae `rivals` (los elegidos que siguen compitiendo) y `exercises`. Desaparecen `weekStart`, `week`, `weekTotals` y `rankWeekTotals`. Es también una lectura menos por rival.
*   **Manda el peso máximo, no el 1RM estimado.** Se lee solo la marca `max_weight` vigente; el cara a cara ordena por ella y el contrato ya no lleva `estimatedOneRepMax`. Un 100 × 1 le gana a un 95 × 8: es lo que se entiende a primera vista en el gimnasio, aunque el 1RM diga otra cosa.
*   **El marcador es por rival y se cuenta en el móvil**: un punto por ejercicio compartido para quien más levanta, comparando de dos en dos (un tercero que gana a los dos no le quita el punto a ninguno). La pantalla enseña un rival a la vez, con lo que vas perdiendo primero.
*   Lo demás no cambia: la casilla, la lista en un solo sentido, el permiso mirado al leer y la excepción de la cuenta de administración.
