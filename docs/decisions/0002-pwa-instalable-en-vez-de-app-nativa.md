# 0002 — PWA instalable como superficie principal, no app iOS nativa

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

GymBuddy se usa desde el móvil, en el gimnasio. El resto de proyectos móviles del ecosistema
(Latent, TunnelVision, Wond...) son SwiftUI nativo, así que lo natural habría sido repetir stack.

## Decisión

La superficie principal es una **PWA instalable** en React + TypeScript + Vite, con el bot de
Telegram como canal secundario de entrada rápida.

## Porqué

Tres razones, en orden de peso:

1.  **Distribución.** Sin cuenta de desarrollador de pago, una app iOS instalada por Xcode caduca a
    los 7 días y hay que recompilarla. Para una herramienta de uso diario eso es inaceptable. Una PWA
    se añade a la pantalla de inicio una vez y no caduca nunca.
2.  **El bot obliga a un backend igualmente.** El requisito de poder cambiar los pesos desde Telegram
    implica un servidor con la base de datos. Si el backend existe de todos modos, una app nativa solo
    añade un segundo stack y un problema de sincronización que la PWA no tiene: la PWA ya habla con
    ese backend directamente.
3.  **Una sola fuente de verdad.** Con SwiftData local + un bot escribiendo en otra base, hay dos
    copias del historial y un sync que mantener. Con la PWA hay una.

Se descartó la **Telegram Mini App** (la app web dentro de Telegram) pese a ser la opción de menor
fricción de despliegue: encajona el producto en el marco de Telegram, sin icono propio, sin pantalla
completa y con la mascota reducida a poco más que un sticker. El objetivo explícito era que esto se
sintiera una app de verdad, no una conversación.

## Consecuencias

*   Hay que resolver offline a mano: service worker para el shell y los GIFs vistos, y una cola de
    escrituras en IndexedDB que se drena al recuperar cobertura. En un gimnasio sin señal, registrar
    una serie tiene que funcionar igual.
*   No hay acceso a HealthKit ni a las capacidades nativas de iOS. Hoy no se necesitan.
*   Requiere hosting, a diferencia de una app puramente local. Se asume conscientemente porque el bot
    ya lo exigía.
*   El sistema de diseño se construye desde cero en CSS/TS en vez de heredar los componentes de Apple.
