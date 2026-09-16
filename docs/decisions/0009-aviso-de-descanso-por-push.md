# 0009 — El aviso de fin de descanso llega por Web Push desde el Worker

**Fecha:** 2026-09-16
**Estado:** aceptada (construidas la primera porción, el permiso y la suscripción, y la segunda, la alarma y el envío en el Worker)

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
*   **Todo cabe en el plan gratuito:** una fila por navegador; la alarma del Durable Object son dos escrituras por descanso (el aviso guardado y la alarma); firmar el JWT cuesta unos 0,1 ms de CPU por navegador, y no hay cifrado.
*   **Cerrar sesión no retira la suscripción** del navegador. Los avisos solo salen de los descansos de la propia cuenta, así que un móvil del que se salió no recibe nada. Si entra otra cuenta y enciende el aviso, la fila pasa a ella.
*   Hasta la porción 3, un push que llegara no tendría manejador en el service worker, y en iOS cada push que no enseña notificación acerca a Safari a retirar la suscripción. Por eso **la PWA no programa el aviso hasta la porción 3**: el Worker ya sabe mandarlo, pero nadie se lo pide, y llamar a `PUT /push/rest-notice` llega junto con el manejador.

## Revisión — 2026-09-16: la alarma y el envío (porción 2)

*   **Un Durable Object por cuenta** (`RestNoticeAlarm`, con almacenamiento SQLite, el único del plan gratuito), con el id sacado del usuario: programar otra vez pisa el aviso anterior y nunca suenan dos, programe el móvil que programe. Guarda la cuenta, la sesión y el fin del descanso, y pone la alarma a esa hora.
*   **`PUT /api/v1/push/rest-notice`** con `{sessionId, endsAt}` programa o reprograma (204). `endsAt` lo calcula la PWA, que es quien conoce el objetivo de descanso del dispositivo. La sesión tiene que ser de la cuenta (404 si no) y estar abierta (`session_closed`). Un fin a más de quince minutos (`MAX_REST_NOTICE_DELAY_SECONDS`) es `validation_failed`; uno que ya pasó quita el aviso pendiente, porque es lo que ocurre cuando la petición sale tarde por la cobertura. Sin claves VAPID no se programa nada y se responde 204 igual. **`DELETE /api/v1/push/rest-notice`** lo quita (204 idempotente).
*   **El aviso va sin carga.** Cifrar una carga (RFC 8291) es un ECDH, un HKDF y un AES-GCM por navegador, y el texto del aviso es siempre el mismo: lo pondrá el service worker. Solo se firma el JWT ES256 de VAPID con WebCrypto, con el origen del servicio de push como audiencia, doce horas de vida y `WEBAUTHN_ORIGIN` como `sub`. Cabeceras: `TTL: 60` y `Urgency: high`.
*   **Al sonar**, la alarma olvida el aviso **antes** de mandarlo y nunca lanza: un reintento de Cloudflare avisaría dos veces o a destiempo. No manda nada si la sesión ya no está abierta (se terminó en otro móvil o se borró), si la alarma llega más de un minuto tarde o si la cuenta no tiene suscripciones. Manda a todos los navegadores de la cuenta a la vez; los que responden 404 o 410 se retiran, y un fallo en uno no deja sin aviso a los demás.
