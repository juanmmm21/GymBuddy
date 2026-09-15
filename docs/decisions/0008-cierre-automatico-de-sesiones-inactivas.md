# 0008 — Una sesión se cierra sola tras un rato sin actividad

**Fecha:** 2026-09-14
**Estado:** aceptada (límite revisado el 2026-09-15: de veinte a sesenta minutos, ver abajo)
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

*   **Un descanso de más del límite corta la sesión**, aunque se siga en el gimnasio. La serie siguiente abre otra. Es el precio de la regla y lo aceptó Juan. Cambiar el límite es tocar una constante del dominio compartido.
*   **Una sesión empezada y sin ninguna serie se cierra a la hora a la que empezó** y queda en el historial con duración cero. No se borra: borrar datos del usuario sin que lo pida es peor que una fila vacía.
*   La cola descarta con aviso una serie que ya no continúa la actividad. Solo pasa si el móvil estuvo más de veinte minutos sin registrar nada y, sin red, no llegó a ver la sesión cerrada.
*   Leer entrenamiento cuesta una o dos consultas más por petición (la sesión abierta y las horas de sus series). Solo escribe cuando de verdad cierra algo.

## Revisión — 2026-09-15: sesenta minutos, y el cardio en marcha no cuenta como inactividad

Juan entrenó con la regla y **veinte minutos cortaban entrenamientos de verdad**: esperar a un amigo antes del cardio, o el cardio mismo, que dura treinta minutos sin registrar ninguna serie y dejaba la sesión cerrada antes de apuntarlo. Se le propusieron un límite más largo, uno configurable, no contar el cardio en marcha o quitar el cierre, y eligió **juntar dos**: el límite más largo y que el cardio en marcha no cuente:

*   **`SESSION_IDLE_LIMIT_MINUTES` pasa de 20 a 60.** Todo lo demás de esta decisión sigue igual: la hora de cierre es la de la última actividad, la cola reabre con series que continúan la actividad (ahora, a menos de una hora) y la PWA aplica la misma regla. No hace falta migración: la regla se aplica al leer, y una sesión que ya se cerró sola con el límite viejo se queda cerrada (reabrirla solo lo hace una serie de la cola que la continúe).
*   **Un cardio en marcha tiene que contar como actividad** y no dejar que la sesión se cierre mientras dura. Hoy no existe: una serie es peso y repeticiones, y el cardio con duración es otra petición de Juan todavía por hacer. Cuando llegue, `SessionActivity` tendrá que incluir el cardio en curso además de las horas de las series, en la misma función pura, para que el Worker y la PWA lo sigan decidiendo igual.

Consecuencia: una sesión olvidada queda abierta hasta una hora antes de cerrarse sola, pero la duración no se estropea, porque la hora de cierre sigue siendo la de la última serie.

## Revisión — 2026-09-15: el cardio en marcha, construido

El cardio se apunta al acabarlo, con su duración, así que mientras dura no llega nada al Worker. Para que no cuente como inactividad, **la sesión guarda cuándo empezó el cardio en marcha**:

*   **`workout_session.cardio_started_at`** (migración 0009) lo fija `PUT /sessions/{id}/cardio` —con la hora del móvil, como una serie— y lo quita `DELETE /sessions/{id}/cardio` (204 aunque no hubiera ninguno). El detalle de la sesión lo expone como `cardioStartedAt`. Pasa por la cola offline igual que las series.
*   **La regla sigue siendo una sola función pura** (`idleSessionEndAt` en `packages/shared/src/domain/session-idle.ts`): empezar el cardio es actividad, y mientras está en marcha la sesión no se cierra. **Tiene tope: `CARDIO_IN_PROGRESS_LIMIT_MINUTES` (180)**. Un cardio olvidado no puede dejar la sesión abierta para siempre: pasadas tres horas desde que empezó, la sesión se cierra sola a la hora en que empezó ese cardio, su última actividad conocida.
*   **Apuntar una serie de cardio lo termina** si acabó después de que empezara (`endsCardioInProgress`): una vieja que llega tarde de la cola no apaga el que sigue corriendo. Cerrar la sesión, a mano o sola, también lo quita.
*   **Una serie de cardio de la cola continúa la sesión desde que empezó** (`cardioSetStartedAt`: su hora menos su duración), no desde que se apuntó. Así, cien minutos de bici hechos sin cobertura reabren la sesión que el Worker había dado por cerrada, si empezaron dentro del margen.
*   **En la PWA**, «Empezar cardio» (en la sesión y en «Terminar sesión») lo pone en marcha; la tarjeta «Cardio en marcha» ocupa el sitio del descanso con su cronómetro, y «Apuntar cardio» abre el registro con el tiempo que lleva, redondeado al minuto.

Consecuencia: con un cardio en marcha, otro móvil ve la sesión abierta hasta tres horas. Es el precio de no cortar un cardio largo, y el tope es una constante del dominio compartido.
