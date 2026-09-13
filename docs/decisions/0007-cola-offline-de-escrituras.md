# 0007 — Cola offline de las escrituras de la sesión

**Fecha:** 2026-09-13
**Estado:** aceptada

## Contexto

En muchos gimnasios no hay cobertura, o hay una barra que no deja pasar nada. Registrar una serie
sin red tiene que funcionar y llegar después al Worker, que sigue siendo la única fuente de verdad
(el mismo Worker y la misma D1 para todos los dispositivos de una cuenta).

El Worker ya estaba preparado desde la API de entrenamiento: abrir sesión y registrar serie son
idempotentes por el id que pone el cliente (200 con lo que hay, `conflicting_write` si el mismo id
llega con otros datos), corregir manda los mismos valores, borrar una serie que ya no está responde
204 y cerrar dos veces no mueve la hora de cierre. Faltaba decidir qué hace la PWA.

## Decisión

*   **Una cola en IndexedDB** con las cinco escrituras de la sesión: abrir, registrar, corregir y
    borrar una serie, y cerrar. Cada entrada lleva una **secuencia** (el orden de envío), **la cuenta**
    que la hizo y la escritura validada con los esquemas del contrato. IndexedDB y no `localStorage`:
    sobrevive igual a cerrar la app y no compite con el resto de lo que guarda el navegador.
*   **Envío híbrido.** Con red y nada pendiente, la escritura sale directa y la pantalla ve la
    respuesta como siempre (las marcas batidas se celebran en el momento, un rechazo se enseña en la
    hoja). Si falla por algo que se arregla esperando —sin red, un 5xx, un 408 o 429, la sesión
    caducada— se encola. **Con algo ya pendiente, todo lo nuevo se encola detrás**: una serie no puede
    llegar antes que la apertura de su sesión.
*   **Los ids y las horas se fijan en el dispositivo.** El id de un alta se fija al montar su
    formulario, no al pulsar, así que un reintento o un doble toque son la misma escritura. La hora de
    comienzo, de la serie y de cierre se sella al pulsar: sin eso, el Worker pondría la hora a la que
    volvió la red.
*   **Se drena de una en una y en orden**, al abrir la app, con el evento `online`, al volver a la app
    y cada 30 segundos mientras quede algo (el evento `online` no salta con una red que no deja pasar
    nada). El drenado **se para en el primer fallo que se arregla esperando** y **retira con aviso lo
    que el Worker rechaza** (`session_closed` porque otro móvil cerró la sesión, `session_already_open`,
    `conflicting_write`, cualquier otro 4xx): repetirlo daría lo mismo para siempre.
*   **La pantalla pinta la cola encima de lo que devuelve el Worker**: las series pendientes aparecen
    marcadas «Sin sincronizar», una sesión abierta sin red se ve abierta y una cerrada sin red deja de
    verse. Un aviso sobre cualquier pantalla dice cuántos cambios esperan y qué se rechazó.
*   **Los conflictos no se resuelven, se evitan.** Las series son inserciones con id propio y hora
    propia, así que dos móviles escribiendo en la misma sesión no se pisan: cada serie entra con su
    `completed_at`. Lo único que puede chocar es la sesión (cerrada u otra abierta desde otro móvil), y
    eso se enseña en vez de adivinar.

## Consecuencias

*   Lo encolado de una cuenta **no lo manda otra** que entre después en el mismo móvil: espera a que
    vuelva la suya.
*   Una serie que entra desde la cola **no celebra sus marcas**: la respuesta llega cuando ya no se
    está mirando. Las marcas se escriben igual y se ven en la ficha del ejercicio.
*   Si la apertura de una sesión se rechaza (había otra abierta desde otro móvil), sus series se
    rechazan detrás una por una y cada una se avisa; no se mueven solas a la otra sesión.
*   Las horas son las del reloj del móvil. Un reloj muy atrasado podría cerrar una sesión antes de su
    comienzo (`validation_failed`), y ese cierre se avisaría como rechazado.
*   La cola solo cubre la sesión. Seguir un ejercicio, las rutinas o las invitaciones siguen
    necesitando red, y lo dicen al fallar.
