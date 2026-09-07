# 0001 — El catálogo de ejercicios se consume por CDN, no se vendoriza

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

GymBuddy necesita un catálogo de ejercicios con demostración visual. La fuente elegida es
[`JahelCuadrado/ExerciseGymGifsDB`](https://github.com/JahelCuadrado/ExerciseGymGifsDB): 1323 ejercicios
en 19 grupos musculares, con nombre e instrucciones en español e inglés, expuestos como una API
estática de ficheros JSON y GIFs servida por jsDelivr.

Había dos caminos: copiar el repo dentro de GymBuddy (submódulo o copia directa) para tener el
catálogo self-contained, o consumirlo en caliente desde el CDN.

## Decisión

Se consume desde jsDelivr, anclado a un tag (`@v1.1.0`). GymBuddy **no aloja ni un solo GIF**.
Lo único que se guarda en local es un snapshot de los **metadatos JSON** en la base de datos,
para poder buscar y hacer coincidencia difusa de nombres sin depender de la red.

## Porqué

El motivo determinante es de derechos, no técnico. El repo de origen **no declara licencia** y su
propio README avisa de que los GIFs fueron recopilados de internet y su autor no posee los derechos
ni puede cederlos. Copiarlos a un repositorio público a nombre de `juanmmm21` sería redistribuir
material de terceros sin permiso, con nuestro nombre encima. Enlazar al CDN deja la responsabilidad
donde ya está y permite que, si el contenido se retira aguas arriba, desaparezca también aquí.

Como efecto secundario, el repo se mantiene ligero (los GIFs son cientos de megas) y las imágenes
llegan por una CDN global en vez de por nuestro servidor.

## Consecuencias

*   Hace falta red para ver un GIF por primera vez. Se mitiga cacheándolos en el service worker de la
    PWA: un ejercicio ya visto se sigue viendo sin cobertura, que es el caso real en un gimnasio.
*   Dependemos de la disponibilidad de jsDelivr y de que el repo de origen no se borre. El snapshot de
    metadatos garantiza que la app siga siendo usable (registrar series, ver pesos, historial) aunque
    los GIFs no carguen: se degrada a una tarjeta sin imagen, no a una pantalla rota.
*   Hay que acreditar la fuente de forma visible en el README y dentro de la app.
*   La URL va anclada a un tag para que una regeneración aguas arriba no cambie el contrato en caliente.
    Subir de versión es un cambio deliberado en una constante del backend.
