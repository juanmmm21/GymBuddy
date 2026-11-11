# 0012 — Idioma elegible: el del sistema por defecto, y los textos en los dos idiomas donde se usan

**Fecha:** 2026-11-11
**Estado:** aceptada y construida.

## Contexto

La cuenta guardaba un `locale` (`es` o `en`) desde el registro, sacado de `navigator.language`, pero solo lo usaba el catálogo: toda la interfaz estaba escrita en español a mano. Se pidió poder **elegir el idioma** y que, **por defecto, sea el del sistema**.

Había que decidir tres cosas: dónde vive la elección, cómo se escriben los textos en dos idiomas sin que uno se quede atrás, y qué pasa con lo que el Worker nombra en el idioma de la cuenta.

## Decisión

*   **La preferencia es del dispositivo** (`gymbuddy.language` en el `localStorage`): `system`, `es` o `en`. Sin nada guardado es `system`, que se resuelve con el primero de `navigator.languages` que la app sabe hablar —alguien con el sistema en catalán y el español detrás la tiene en español— y, si no hay ninguno, en inglés. Con `system`, la app sigue al sistema si cambia con ella abierta (`languagechange`). «El del sistema» no significa lo mismo en dos móviles, por eso no es solo de la cuenta.
*   **Se elige en Ajustes y en la pantalla de entrada.** En Ajustes, un desplegable con «El del sistema» además de los dos idiomas. En la entrada, lo primero de la pantalla son dos botones con **bandera y nombre** (🇪🇸 Español, 🇬🇧 English), con el rótulo del grupo en los dos idiomas: quien acaba en uno que no entiende tiene que reconocer el suyo sin leer nada. Las banderas son SVG propios y no emojis, porque Windows no pinta los emojis de bandera.
*   **El idioma resuelto se lleva a la cuenta** (`PATCH /auth/me` con `locale`) cuando no coincide, para que lo que nombra el Worker —los ejercicios del catálogo en la competición, por ejemplo— salga en el mismo idioma que la pantalla. Un intento por cuenta e idioma; sin red, se reintenta la próxima vez que se abra la app. El catálogo se pide con el idioma resuelto, sin esperar a esa escritura.
*   **Cada texto se escribe en los dos idiomas en el sitio donde se usa:** `t('Hoy', 'Today')`, y `plural(n, ['serie', 'series'], ['set', 'sets'])` para las cuentas. Con dos idiomas y uno de ellos el original, un diccionario aparte con claves solo añadía una indirección y la forma más fácil de olvidar una traducción. Las tablas de etiquetas (partes del cuerpo, músculos, días) llevan una entrada por idioma.
*   **`t` lee el idioma de una variable del módulo**, no de un contexto de React: el texto también sale de funciones puras (mensajes de la mascota, errores, etiquetas) que no tienen hooks. `LanguageProvider` la fija antes de pintar y `LocaleBoundary` vuelve a montar el router al cambiar de idioma, así que nada se queda con el anterior. Por eso las constantes de texto pasaron a ser funciones: una constante se calcula una vez al cargar el módulo.
*   **El aviso de fin de descanso** se escribe en el service worker, que no lee el `localStorage`: la app le deja el idioma en la Cache Storage (`gymbuddy-language`), y sin él usa el del sistema.

## Consecuencias

*   **Los mensajes que escribe el Worker siguen en español.** La PWA ya decide por el código de error (`describeError`), y en inglés da su propia frase para cada código en vez de enseñar el texto del Worker.
*   **El manifiesto de la PWA sigue en español** (`lang: 'es'`, la descripción): es un fichero estático del build y no cambia con la preferencia.
*   **El nombre del Atajo del iPhone no se traduce** («GymBuddy descanso»): es el identificador con el que la app lo abre, y traducirlo rompería el que ya tenga creado quien cambie de idioma.
*   **Los tests leen la pantalla en español**: `test/setup.ts` pone el sistema en español antes de cada test, y los del idioma lo cambian en el suyo.
*   **Añadir un tercer idioma** obliga a tocar `t`, `plural` y las tablas: es el precio de no tener diccionario, y se paga solo si llega a hacer falta.
