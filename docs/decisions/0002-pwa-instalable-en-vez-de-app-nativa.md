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
    ya lo exigía; dónde alojarlo se resolvió en la decisión
    [`0004`](0004-cloudflare-y-backend-typescript.md).
*   El sistema de diseño se construye desde cero en CSS/TS en vez de heredar los componentes de Apple.

## Revisión — 2026-09-09

Otras personas empezaron a pedir la app, y eso obligó a revisar la decisión con un dato que en
septiembre no existía: los usuarios ya no son solo quien la escribe. La pregunta concreta era si
llevarla a la App Store con un envoltorio nativo (Capacitor / WKWebView) para que instalarla fuera
trivial. **Se mantiene la PWA**, con una consecuencia nueva.

Lo que decidió es el coste de instalar, no el de desarrollar:

*   En **Android** ya es trivial: existe `beforeinstallprompt`, así que la propia app puede ofrecer
    un botón «Instalar» y se resuelve en dos toques.
*   En **iOS** no hay equivalente: hay que abrir el enlace en Safari y usar *Compartir → Añadir a
    pantalla de inicio*. Y el enlace suele llegar por un chat, que lo abre en su navegador interno,
    donde esa opción ni siquiera aparece. Es la fricción real, y es **de una sola vez**.
*   La App Store no sale gratis a cambio: cuenta de desarrollador de pago anual, un envoltorio
    nativo que mantener, revisión en cada actualización —hoy publicar es un `push`— y la
    *guideline 4.2*, con la que Apple rechaza con frecuencia webs envueltas sin funcionalidad
    nativa propia. Sigue en pie, además, el argumento 1 de arriba: lo que se buscaba era no
    depender del ciclo de firma y publicación de Apple.
*   Y hay una fricción anterior que la App Store no resolvería: la identidad es Telegram
    ([`0003`](0003-telegram-como-identidad.md)), que hace falta igual.

**Consecuencia:** la fricción de iOS se ataca donde está, con una **pantalla de instalación guiada**
en la propia PWA —detecta la plataforma y el navegador interno de un chat, y enseña los pasos— en
lugar de con un segundo canal de distribución.

## Revisión — 2026-09-11

**El bot de Telegram se retira** y la identidad pasa a ser propia, con passkeys e invitación
([`0005`](0005-identidad-propia-con-passkeys.md)). **La decisión se mantiene**: la PWA sigue siendo la
superficie, y ahora la única.

*   La razón 2 de arriba deja de valer tal cual —ya no hay bot que obligue a tener backend—, pero el
    backend sigue haciendo falta por la razón 3: el mismo historial en varios móviles y para varias
    personas no cabe en un almacenamiento local.
*   La **Telegram Mini App** sigue descartada, y ahora con más motivo: no queda nada de Telegram.
*   La fricción de la identidad que señalaba la revisión anterior desaparece: para entrar ya no hay
    que instalar nada más que la propia app.
