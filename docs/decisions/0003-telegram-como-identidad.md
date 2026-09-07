# 0003 — Telegram es el sistema de identidad; se entra por enlace del bot

**Fecha:** 2026-09-07
**Estado:** aceptada
**Revisada** el mismo día tras la decisión [`0004`](0004-cloudflare-y-backend-typescript.md): el mecanismo pasa del Login Widget a un enlace de un solo uso del bot. La decisión de fondo —la identidad es Telegram— no cambia.

## Contexto

La PWA y el bot tienen que escribir en el mismo historial. Eso exige saber que el usuario del navegador y el usuario del chat son la misma persona. La vía habitual sería un sistema de cuentas (email y contraseña, o passkeys) más un flujo de vinculación con el bot.

## Decisión

El **`telegram_user_id` es la identidad**, y se obtiene mediante un **enlace de un solo uso generado por el bot**:

1.  La PWA pide un `nonce` al Worker, que lo guarda en D1 con caducidad corta, y abre `https://t.me/<bot>?start=<nonce>`.
2.  El usuario pulsa *Start*. El bot recibe `/start <nonce>` junto con su `telegram_user_id`, que Telegram ya trae autenticado.
3.  El Worker asocia el `nonce` a ese usuario y lo marca como consumido.
4.  La PWA canjea el `nonce` por un JWT de sesión firmado con la Web Crypto API.

No hay contraseñas, ni verificación de correo, ni recuperación de cuenta que mantener.

## Porqué

El bot de Telegram es un requisito del producto, no un añadido. Dado que la identidad de Telegram va a existir sí o sí, construir un segundo sistema de cuentas encima solo añade superficie de ataque, formularios y un flujo de vinculación que puede fallar. Reutilizarla elimina de golpe todo el trabajo de autenticación, que en una app de una sola persona es puro coste sin valor.

Frente al **Telegram Login Widget**, que era la opción inicial, el enlace del bot gana por una razón práctica: el widget obliga a registrar el dominio en BotFather con `/setdomain`, lo que **ata el despliegue a un dominio fijo** y añade un paso manual de configuración. El enlace de un solo uso funciona en cualquier origen —incluido el `*.pages.dev` gratuito de Cloudflare— y no necesita nada en BotFather más allá del propio bot. Además reutiliza el canal que el usuario ya tiene abierto: si va a usar el bot, ya tiene Telegram instalado y la sesión iniciada.

## Consecuencias

*   Se depende de Telegram para entrar. Es aceptable: sin Telegram tampoco habría bot.
*   El `nonce` es material sensible durante su corta vida: se genera con `crypto.getRandomValues`, caduca en minutos, es de un solo uso y se compara en tiempo constante. Los cuatro puntos llevan test.
*   El canje del `nonce` hay que hacerlo sin dejar una ventana de sondeo abierta indefinidamente: la PWA reintenta con backoff y se rinde cuando el `nonce` caduca.
*   El `TELEGRAM_BOT_TOKEN` sigue siendo material sensible: controla el bot y, por tanto, el canal por el que se entra. Vive solo en los secretos del Worker, nunca en el repo.
*   El modelo de datos queda preparado para varios usuarios desde el principio (todo cuelga de `user_id`) sin coste adicional, porque la identidad ya viene resuelta de fuera.
