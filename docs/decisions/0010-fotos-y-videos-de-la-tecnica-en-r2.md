# 0010 — La foto (y después el vídeo) de la técnica se re-codifica en el móvil y se guarda en R2

**Fecha:** 2026-09-16
**Estado:** aceptada; construidas las fotos (porción 1) y la prueba de convertir vídeo en el móvil (porción 2). Guardar el vídeo y la caché sin red van en porciones siguientes.

## Contexto

Juan pidió poder ponerle a un ejercicio propio una foto o un vídeo de cómo se hace, guardado en Cloudflare (R2) y **procesado antes de subirlo**: lo que graba un iPhone pesa mucho y luego tardaría en cargar. Y puso una condición: **no quiere pagar nada**. Antes de construir se investigó qué se podía prometer:

*   **R2 gratuito:** 10 GB-mes, un millón de operaciones de clase A (escrituras) y diez millones de clase B (lecturas) al mes, sin coste de salida. Solo la clase Standard. **Pasarse cobra**, y Cloudflare no deja ponerle un tope a la cuenta.
*   **Worker gratuito:** 10 ms de CPU y 100 MB de cuerpo por petición. No puede transcodificar nada, pero pasar un fichero en streaming a R2 casi no gasta CPU (es espera de E/S).
*   **Cloudflare Stream** no tiene plan gratuito. **Media Transformations** exige una zona (dominio propio; `workers.dev` no lo es) o un binding que estaba en beta, sin precio cerrado y sin decir si entra en el plan gratuito. Además prefiere H.264 (el iPhone graba en HEVC), no pasa de 100 MB de entrada y obliga a subir el original entero con la poca cobertura del gimnasio.
*   **En el móvil:** Safari de iOS tiene `VideoEncoder` desde la 16.4 (H.264 por hardware) y `AudioEncoder` solo desde Safari 26. Una foto se re-codifica con `createImageBitmap` y un `<canvas>`, sin librerías.

## Decisión

*   **Todo se re-codifica en el móvil y el Worker solo acepta lo ya reducido.** Fotos: JPEG de 1600 px de lado largo como mucho, con calidad 0,82 (unos 300–500 KB). El Worker admite **solo** `image/jpeg` y **3 MB como máximo**: el original de un iPhone no pasa. Vídeo, en su porción: 720p en H.264, **sin sonido** y 60 s como máximo (unos 15 MB), con Mediabunny sobre WebCodecs y cargado solo al elegir un vídeo. Si el móvil no puede convertirlo, se rechaza y nunca se sube el original.
*   **Un medio por ejercicio, y solo en los propios** (los del catálogo ya tienen su GIF): `media_not_allowed` (409) en uno del catálogo.
*   **El fichero va en el cuerpo de `PUT /api/v1/exercises/{id}/media`, no en JSON**, y el Worker lo pasa a R2 en streaming. Exige `Content-Length`, porque R2 necesita saber la longitud y porque así rechaza uno grande sin leerlo (`media_too_large`, 413). Lo copia a través de un `FixedLengthStream` contando los bytes: si llegan más o menos de los declarados, no se guarda nada (400). No hay URL prefirmada: pediría claves S3 como secreto y CORS en el cubo, y con un solo origen no hace falta.
*   **Primero R2 y después D1.** La fila solo se apunta cuando el fichero está guardado, así que nunca señala un fichero que no existe. Si D1 falla, el fichero nuevo se borra. El viejo se borra al final. Un borrado de R2 que falla solo deja un huérfano que ocupa sitio: se registra y no tumba la petición.
*   **Cada subida tiene un id nuevo** (`media_id`), que forma la clave en R2 (`exercise-media/{usuario}/{id}`) y la dirección `GET /api/v1/exercises/{id}/media/{mediaId}`. Esa dirección no se reutiliza nunca, así que se sirve con `Cache-Control: private, max-age=31536000, immutable`. Una foto ya sustituida responde 404 aunque su fichero siguiera en R2.
*   **Los topes del gratuito los hace cumplir el Worker, contando todas las cuentas:** 5 GB guardados (la mitad del gratuito, con margen para huérfanos y subidas simultáneas; la foto que se sustituye no cuenta) y 3.000 subidas al mes (tabla `media_upload_month`, en UTC). Por encima, `media_quota_exceeded` (507) antes de escribir nada en R2. Un bucle de lecturas tampoco llega a las diez millones: el propio Worker se queda en 100.000 peticiones al día.
*   **Tabla propia, `exercise_media`** (migración 0012), y no columnas en `tracked_exercise`. La regla «todo o nada» de esas columnas necesitaría un CHECK de tabla, y añadirlo a una tabla que ya existe obliga a reconstruirla, que en D1 dispara las cascadas (migración 0008). La clase (`photo`) no lleva CHECK por lo mismo: añadir `video` sería otra reconstrucción, así que se valida al leer con el enum del contrato.
*   **En la PWA, subir y quitar van directos al Worker, fuera de la cola offline**: un fichero no cabe en la cola de IndexedDB junto a las series, y sin red se dice. La foto se descarga con `fetch` y la sesión, porque una etiqueta `<img>` no manda la cabecera `Authorization`. Se pinta con una dirección `blob:` que se libera al desmontar la imagen. El codificador del navegador va detrás de una interfaz (`PhotoCodec`) para probar la lógica sin canvas.

## Consecuencias

*   **La copia de seguridad no lleva fotos ni vídeos** (lo aceptó Juan): el fichero JSON no los guarda y, al restaurar una copia, los ejercicios propios vuelven sin su medio.
*   **Sin probar en un iPhone real** al construir las fotos: que Safari entregue el HEIC ya como JPEG o lo decodifique `createImageBitmap`, y el tiempo de preparar la foto.
*   **Borrar la cuenta** se llevaría las filas en cascada, pero no los ficheros de R2. Hoy no hay forma de borrar una cuenta desde la app; si llega, tendrá que borrar antes el prefijo de la cuenta en R2.
*   **Lo que queda:** el vídeo, empezando por una prueba de la conversión en el iPhone de Juan; y las fotos y los vídeos ya vistos guardados para verlos sin red (Juan también quiere los vídeos).

## Revisión: la prueba de vídeo en el móvil (2026-09-16)

Antes de construir el vídeo había que comprobar en un iPhone real lo que la investigación no podía asegurar: que decodifique un vídeo de su cámara (4K en HEVC), cuánto tarda y cuánto pesa lo que sale. Para eso hay una pantalla en Ajustes, **«Prueba de vídeo»**, que convierte un vídeo **sin subirlo** y enseña las medidas y el resultado reproducible.

*   **La conversión es la definitiva, no una maqueta.** `convertVideo` (la lógica pura, con sus topes) va detrás de un puerto, `VideoConverter`, igual que las fotos con `PhotoCodec`; el del navegador usa Mediabunny sobre WebCodecs y se carga con un `import()` al elegir el vídeo. Guardar el vídeo en un ejercicio reutilizará las dos piezas.
*   **Topes en el contrato:** lado corto a 720 px y largo a 1280 (un vídeo muy apaisado tampoco se dispara), unos 2 Mbps en H.264 y un minuto como máximo; más largo se rechaza sin intentar convertirlo. Los lados salen pares, que H.264 en 4:2:0 no admite impares.
*   **El giro se hornea en los fotogramas** en vez de dejarlo en la metadata del MP4, y el índice va al principio del fichero para que el vídeo empiece a verse antes de bajarlo entero.
*   **Mediabunny va fijado a una versión exacta** que ya ha pasado la espera mínima de publicación que exige pnpm: no se abre una excepción a esa política por una dependencia recién publicada.
*   **Si la prueba sale mal** (el iPhone no decodifica el HEVC, tarda demasiado o se queda sin memoria), no se construye el vídeo así: se vuelve a decidir con Juan.

