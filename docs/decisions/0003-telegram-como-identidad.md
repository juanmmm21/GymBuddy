# 0003 — Telegram es el sistema de identidad; no se construyen cuentas propias

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

La PWA y el bot tienen que escribir en el mismo historial. Eso exige saber que el usuario del
navegador y el usuario del chat son la misma persona. La vía habitual sería un sistema de cuentas
(email + contraseña, o passkeys) y un flujo de vinculación con el bot.

## Decisión

El **`telegram_user_id` es la identidad**. La PWA autentica con el
[Telegram Login Widget](https://core.telegram.org/widgets/login): Telegram devuelve un payload firmado,
el backend verifica el HMAC-SHA256 contra el token del bot y emite un JWT de sesión. El bot ya conoce
ese mismo id de forma nativa en cada mensaje. No hay contraseñas, ni verificación de email, ni
recuperación de cuenta que mantener.

## Porqué

El bot de Telegram es un requisito del producto, no un añadido. Dado que la identidad de Telegram va a
existir sí o sí, construir un segundo sistema de cuentas encima solo añade superficie de ataque,
formularios y un flujo de vinculación que puede fallar. Reutilizarla elimina de golpe el trabajo de
autenticación completo — que en una app de una sola persona es puro coste sin valor.

La verificación del payload del Login Widget es criptográfica y está bien especificada: se ordenan los
campos, se firman con `SHA256(bot_token)` como clave y se compara en tiempo constante, rechazando
además los payloads con `auth_date` viejo para cortar reenvíos.

## Consecuencias

*   Se depende de Telegram para entrar. Es aceptable: sin Telegram tampoco habría bot.
*   El Login Widget exige registrar el dominio en BotFather (`/setdomain`), lo que ata el despliegue a
    un dominio fijo. Queda documentado en el README y en el `.env.example`.
*   El token del bot es material sensible por partida doble: firma los logins **y** controla el bot.
    Vive solo en variables de entorno, nunca en el repo.
*   La comparación del HMAC debe ser en tiempo constante (`hmac.compare_digest`) y el `auth_date`
    tiene ventana de validez. Ambas cosas llevan test.
*   El modelo de datos queda preparado para varios usuarios desde el principio (todo cuelga de
    `user_id`) sin coste adicional, porque la identidad ya viene resuelta de fuera.
