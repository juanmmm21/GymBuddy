# 0005 — Identidad propia: passkeys con código de invitación, sin Telegram

**Fecha:** 2026-09-11
**Estado:** aceptada
**Sustituye a** [`0003`](0003-telegram-como-identidad.md).

## Contexto

La decisión `0003` hizo de Telegram la identidad porque el bot era un requisito del producto: si la
cuenta de Telegram iba a existir sí o sí, un segundo sistema de cuentas solo añadía superficie.

Las dos premisas se cayeron a la vez:

*   **El bot deja de existir.** La PWA ya hace todo lo que hacía el bot, y el bot solo apareció al
    principio porque Telegram era donde se apuntaban los entrenamientos. Sin bot, pedir Telegram para
    entrar es fricción sin nada a cambio.
*   **La app la usan más personas** (ver la revisión del 2026-09-09 en
    [`0002`](0002-pwa-instalable-en-vez-de-app-nativa.md)), y no todas tienen Telegram. Instalarlo
    solo para poder entrar en una app de gimnasio era la fricción que ningún canal de distribución
    podía arreglar.

## Decisión

*   **Se entra con una passkey** (WebAuthn): la huella o la cara del propio móvil. Sin contraseñas y
    sin correo. Las credenciales son **detectables**, así que la pantalla de entrada no pide ningún
    nombre de usuario: el móvil ofrece la llave que tenga guardada para GymBuddy.
*   **Registrarse exige un código de invitación** de un solo uso: doce caracteres del alfabeto base32
    de Crockford (unos 60 bits), con caducidad. En la base se guarda **el digest SHA-256 del código**,
    no el código, por el mismo motivo por el que se guardaba el del nonce de entrada. La primera
    invitación se crea con `POST /api/v1/admin/invitations`, tras el `ADMIN_TOKEN` de siempre.
*   **La sesión sigue siendo el JWT HS256** que ya emitía el Worker. Lo que cambia es cómo se
    consigue, no qué es.
*   **El bot, su webhook, la entrada por Telegram y grammY se retiran** del código y de los secretos.
*   La verificación de WebAuthn la hace **`@simplewebauthn/server`** en el Worker; el navegador usa
    **`@simplewebauthn/browser`**. El `rpID` y el origen esperado son variables de `wrangler.toml`.

El registro va en dos pasos. Primero se piden las opciones con el código, el nombre y el idioma: el
Worker comprueba que la invitación sirve y guarda un **reto de un solo uso** que caduca en cinco
minutos. Luego llega la credencial creada: el reto se retira de la base al leerlo —tanto si la
verificación sale bien como si no—, se verifica la respuesta y **solo entonces se consume la
invitación**, con un `UPDATE` condicionado a que siga sin usar. Así dos registros simultáneos con el
mismo código no crean dos cuentas, y un intento cancelado a mitad no gasta la invitación. Entrar es
igual pero sin invitación.

## Porqué

**Passkeys frente a un enlace por correo.** El enlace se descartó por engorroso para quien lo usa, y
además obligaría a mandar correo desde el Worker a través de un tercero, con su cuenta, su dominio
verificado y su filtro de spam. Una passkey no se puede suplantar desde una web parecida —va atada al
dominio— y en la práctica se sincroniza sola dentro del llavero de Apple o del gestor de Google.

**Contraseñas, no.** Guardarlas bien, recuperarlas cuando se olvidan y convivir con que se reutilizan
es justo el sistema de cuentas que el proyecto lleva desde el principio sin querer mantener.

**Invitación, porque el plan gratuito tiene techo.** Un alta abierta a cualquiera es la forma más
directa de agotar las 100.000 escrituras diarias de D1. La app es para un grupo de amigos.

**Por qué esta librería.** Escribir a mano la verificación de WebAuthn no es opción, por el mismo
argumento por el que la firma del JWT la hace `hono/jwt`. Se compararon dos candidatas el 2026-09-11:

*   **`@passwordless-id/webauthn` 2.4.0**, sin dependencias y sobre WebCrypto, **se descartó al leer
    su código**. Al pasar la firma ECDSA de DER al formato que acepta WebCrypto da por hecho que `r` y
    `s` miden 32 bytes, pero DER acorta un entero cuyo byte alto es cero: más o menos **una de cada
    128 firmas válidas no verifica**, y alguien se quedaría fuera de la app al azar. Además, en el
    registro se fía de la clave pública que el cliente manda aparte en vez de leerla del
    `attestationObject`.
*   **`@simplewebauthn/server` 14.0.1** lee la clave del `attestationObject`, comprueba origen, reto,
    `rpIdHash`, las marcas de presencia y verificación y el contador de firmas, y arranca dentro de
    `workerd`. Cuesta **unos 121 KiB en gzip** (el Worker pasó de 232 a 353 KiB con grammY todavía
    dentro), lejos del límite de 3 MiB comprimidos del plan gratuito. Retirar grammY devuelve parte.

**`attestation: "none"` y verificación de usuario obligatoria.** No hace falta saber de qué marca es
el autenticador, y pedir la atestación arrastraría cadenas de certificados que validar. En cambio la
passkey es el único factor, así que se exige que el móvil haya comprobado la huella, la cara o el PIN.

## Consecuencias

*   **Cambiar de dominio invalida todas las passkeys.** Van atadas al `rpID`: los datos no se
    pierden, pero cada persona tendría que crear su llave otra vez. El dominio se decide **antes de que
    nadie registre una**; `*.pages.dev` vale como `rpID`.
*   **Perder todos los dispositivos es perder el acceso** mientras no existan «añadir otro
    dispositivo» y la exportación en JSON, que van detrás en la misma fase. Las passkeys se sincronizan
    dentro de Apple o dentro de Google, pero no entre los dos: pasar de iPhone a Android necesita el
    código de «añadir otro dispositivo».
*   **Pedir las opciones de entrada es público y escribe una fila**, como lo era pedir el nonce. Los
    retos caducan a los cinco minutos y el Cron Trigger los barre; el de registro, además, no se
    concede sin una invitación válida.
*   **Los fallos son `invitation_invalid` y `passkey_invalid`, con 400 y no 401.** La PWA cierra la
    sesión ante cualquier 401, y un intento de entrada fallido no tiene ninguna sesión que cerrar.
*   **Ya no hay canal rápido por chat.** Registrar una serie es cosa de la PWA; la cola offline sigue
    siendo lo que hace falta para el gimnasio sin cobertura.
*   **El navegador interno de un chat puede no admitir passkeys.** La pantalla de instalación guiada
    que ya pedía [`0002`](0002-pwa-instalable-en-vez-de-app-nativa.md) es la que dice «ábrelo en
    Safari».
*   El modelo sigue siendo multiusuario sin coste añadido: todo cuelga de `user_id`, que ahora es
    nuestro y no un identificador de Telegram.
