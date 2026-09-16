# 0009 — El aviso de fin de descanso llega por Web Push desde el Worker

**Fecha:** 2026-09-16
**Estado:** aceptada (primera porción construida: el permiso y la suscripción)

## Contexto

Entre serie y serie, el móvil se bloquea o se cambia de app, y el cronómetro del descanso deja de verse. Juan pidió que el fin del descanso avise **con la app cerrada**. Se investigaron los límites reales antes de construir nada:

*   **La web no tiene notificaciones locales programadas.** La Notification Triggers API (`TimestampTrigger`) la abandonó Chrome y nunca llegó a Safari.
*   **iOS congela la PWA en segundo plano.** Ni `setTimeout`, ni el service worker, ni sonido, ni Background Sync. El cronómetro de la pantalla solo sirve con la app delante.
*   **Lo único que despierta al móvil es un Web Push enviado desde el servidor.** En iOS 16.4 o posterior, solo con la PWA **instalada en la pantalla de inicio**, con el permiso pedido desde un toque, y **cada push tiene que enseñar una notificación** (si no, Safari retira la suscripción).

En el gimnasio de Juan hay **poca cobertura**. Por eso se hizo antes un Atajo de iOS que arranca el Temporizador del sistema sin red. Juan lo probó y funciona. El push se añade además, no en su lugar.

## Decisión

*   **El aviso es un Web Push firmado con VAPID que manda el Worker** cuando acaba el descanso. Se construye en tres porciones: (1) permiso y suscripción; (2) un Durable Object por usuario con una alarma, que se programa al empezar el descanso, se reprograma al cambiar el objetivo y se borra al registrar la siguiente serie o al terminar, y que manda el push; (3) el manejador `push` / `notificationclick` en el service worker, que abre `/session`. El Cron cada cinco minutos no sirve: un descanso de noventa segundos necesita precisión de segundos.
*   **Las dos mitades de la clave VAPID van por `wrangler secret`** (`VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`), aunque la pública no sea secreta. Se generan juntas, y ponerlas por el mismo camino impide desplegar una con la pareja de otra. Formato: la pública como punto P-256 sin comprimir (65 bytes) y la privada como su escalar (32 bytes), las dos en base64url. `GET /api/v1/push/config` da la pública **solo si están las dos y la pública es válida**; si no, da `null` y la PWA no ofrece el aviso.
*   **Una fila por navegador en `push_subscription`** (migración 0011), con el `endpoint` como clave. `PUT /api/v1/push/subscription` guarda (204 idempotente) y pisa la fila si el endpoint ya existía, **también si era de otra cuenta**: el navegador pasa a ser de quien ha entrado. `DELETE /api/v1/push/subscription` con el endpoint solo retira filas de la propia cuenta. Borrar la cuenta se lleva sus filas en cascada.
*   **Tope de diez suscripciones por cuenta**, retirando las más viejas en el mismo lote. Un móvil que reinstala la app se suscribe con otro endpoint, y el viejo no avisa de que ha muerto.
*   **En la PWA, el aviso es del dispositivo, no de la cuenta.** Se enciende en Ajustes › Descanso con un interruptor que lee el estado **del navegador** (permiso concedido y suscripción viva). El navegador va detrás de una interfaz (`PushBrowser`), igual que las passkeys, para que ningún test toque el servicio de push.
    *   **El permiso se pide dentro del mismo toque**, antes de cualquier espera. iOS no enseña la pregunta si la petición llega después de un `await`. Por eso la clave del servidor se carga al abrir Ajustes y no al pulsar.
    *   **Encender:** si el Worker no guarda la suscripción, la recién creada se retira. Un navegador suscrito del que el servidor no sabe nada enseñaría «encendido» sin que llegara ningún aviso. Si ya había una suscripción con otra clave (claves rotadas), se retira y se crea otra.
    *   **Apagar:** primero se retira la suscripción del navegador. Desde ese momento el endpoint está muerto y no puede llegar nada, haya red o no. Decírselo al Worker es limpieza: sin cobertura el fallo solo se registra, y la fila muerta se retirará cuando el servicio de push responda 404 o 410 al mandarle un aviso (porción 2).
    *   **iPhone sin instalar:** se pide instalar antes de mirar el navegador. Safari en una pestaña no tiene `PushManager`, y un «no compatible» haría creer que el iPhone no puede. Con el permiso negado, la app explica que solo se desbloquea desde los ajustes del sistema.

## Consecuencias

*   **Lo que no se puede prometer:** sin cobertura al empezar el descanso no hay aviso, porque el Worker no se entera; es justo el caso del gimnasio sin red, y para eso está el Atajo. Sin cobertura al acabar, el aviso llega tarde o no llega (se mandará con un TTL corto para que no suene a destiempo). APNs añade unos segundos. No hay sonido propio ni vibración a medida.
*   **Todo cabe en el plan gratuito:** una fila por navegador; la alarma del Durable Object es una fila escrita por descanso; el cifrado del push hay que medirlo contra los 10 ms de CPU en la porción 2.
*   **Cerrar sesión no retira la suscripción** del navegador. Los avisos solo salen de los descansos de la propia cuenta, así que un móvil del que se salió no recibe nada. Si entra otra cuenta y enciende el aviso, la fila pasa a ella.
*   Hasta la porción 3, un push que llegara no tendría manejador en el service worker. No se manda ninguno hasta la porción 2, y la PWA lo dice debajo del interruptor encendido.
