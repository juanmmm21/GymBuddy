# 0008 — Una sesión se cierra sola tras veinte minutos sin actividad

**Fecha:** 2026-09-14
**Estado:** aceptada
**Sustituye** la regla de la Fase 11 (2026-09-11) de que el Worker nunca cierra una sesión solo y la mascota pide cerrarla tras seis horas.

## Contexto

La primera prueba en el móvil de producción lo dejó claro: la gente se va del gimnasio sin pulsar «Terminar». Con la regla anterior, una sesión olvidada seguía abierta hasta que alguien la cerraba a mano. Eso estropeaba su duración (una tarde entera), el calendario y el botón de empezar del día siguiente, y la mascota tardaba seis horas en avisar. Juan pidió que la sesión se corte sola a los veinte minutos sin hacer nada, **descontando esos veinte minutos**.

La regla anterior se había tomado por dos miedos, y los dos siguen siendo ciertos:

*   **Una hora de cierre inventada es un dato falso** en el historial.
*   **La cola offline puede llegar tarde.** En un gimnasio sin cobertura, las series esperan en el móvil. Si el Worker diera la sesión por cerrada mientras tanto, al volver la red las rechazaría con `session_closed` y se perderían.

## Decisión

*   **Una sesión abierta se da por terminada cuando pasan `SESSION_IDLE_LIMIT_MINUTES` (20) desde su última actividad**: su comienzo o su serie más reciente. **La hora de cierre es esa última actividad**, no la del momento en que se nota. Así no hay hora inventada: es la de la última serie, como si se hubiese pulsado «Terminar» justo después.
*   **La regla es una función pura** en `packages/shared/src/domain/session-idle.ts`, que usan el Worker y la PWA. Las horas se comparan como instantes, porque el contrato admite desfase horario y como texto no ordenan bien.
*   **El Worker la aplica al leer**, sin Cron. El middleware `closeIdleSessions` va detrás de `requireUser` en sesiones, historial, estadísticas y copia: ninguna respuesta enseña abierta una sesión abandonada, y abrir la siguiente no choca con ella. Los datos de un usuario solo los lee él, así que no hace falta barrerlos antes.
*   **La columna `workout_session.ended_automatically`** distingue el cierre automático del que hace quien entrena. **Solo una sesión cerrada sola puede reabrirse**:
    *   una **serie** que llega de la cola y cuya hora continúa la actividad (menos de veinte minutos después de la última) la reabre, entra, y la sesión se vuelve a cerrar a su hora si con ella sigue inactiva. Así se reconstruye la cadena de un entrenamiento hecho entero sin cobertura. No se reabre si ya hay otra sesión abierta;
    *   una **corrección o un borrado** de la cola entran sin más;
    *   un **«Terminar»** de la cola dentro del margen deja la hora de quien entrenaba y la marca como cierre manual.
*   **La PWA aplica la misma regla** en `useOpenSession` (`withoutIdleSession`), contando las series que esperan en la cola. Sin red, quien vuelve tras veinte minutos parado ve «Empezar» y no una sesión en la que su siguiente serie ya no entraría. Lo encolado de la sesión anterior sigue en la cola y llega igual. Redondea al minuto hacia arriba: como mucho la da por cerrada un minuto antes que el Worker, nunca después.
*   **La mascota pierde su regla de «sesión olvidada»** (`forgotten_session` y `STALE_SESSION_HOURS`): con este cierre ya no puede darse.

## Consecuencias

*   **Un descanso de más de veinte minutos corta la sesión**, aunque se siga en el gimnasio. La serie siguiente abre otra. Es el precio de la regla y lo aceptó Juan. Cambiar el límite es tocar una constante del dominio compartido.
*   **Una sesión empezada y sin ninguna serie se cierra a la hora a la que empezó** y queda en el historial con duración cero. No se borra: borrar datos del usuario sin que lo pida es peor que una fila vacía.
*   La cola descarta con aviso una serie que ya no continúa la actividad. Solo pasa si el móvil estuvo más de veinte minutos sin registrar nada y, sin red, no llegó a ver la sesión cerrada.
*   Leer entrenamiento cuesta una o dos consultas más por petición (la sesión abierta y las horas de sus series). Solo escribe cuando de verdad cierra algo.
