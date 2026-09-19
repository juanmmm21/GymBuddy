import type { ReactNode } from 'react';
import { useNow } from '../../hooks/use-now';
import { cx } from '../../lib/cx';
import { formatStopwatch } from '../../lib/format';
import { iphoneTimerShortcutUrl } from './iphone-timer';
import { restStateAt, restTargetsFor, type RestKind } from './rest';
import styles from './RestTimer.module.css';

export interface RestTimerProps {
  /** Momento de la última serie: desde ahí se cuenta el descanso. */
  readonly lastSetAt: string;
  /** Entre series o para cambiar de ejercicio: decide el título y las opciones que se ofrecen. */
  readonly kind: RestKind;
  readonly target: number;
  readonly onTargetChange: (target: number) => void;
  /** La mascota, que descansa aquí dentro contigo y avisa cuando toca la siguiente. */
  readonly companion?: ReactNode;
  /**
   * Ofrecer el Temporizador del iPhone (encendido en Ajustes y en iOS): el único aviso que suena con
   * la app cerrada y sin cobertura.
   */
  readonly offerIphoneTimer?: boolean;
}

/**
 * El descanso, en cuenta atrás desde el objetivo y **parado en 0:00** al cumplirse: lo que se tarda
 * en hacer la serie siguiente no se ve como descanso (lo pidió Juan). No arranca al pulsar nada:
 * cuenta desde la última serie registrada, así que recargar la app o volver del catálogo no lo
 * reinicia.
 */
export function RestTimer({
  lastSetAt,
  kind,
  target,
  onTargetChange,
  companion,
  offerIphoneTimer = false,
}: RestTimerProps) {
  const now = useNow();
  const rest = restStateAt(lastSetAt, now, target);

  return (
    <section className={cx(styles.timer, rest.done && styles.timerDone)} aria-label="Descanso">
      {companion}
      <div className={styles.head}>
        <span className={styles.label}>
          {kind === 'exercise' ? 'Cambio de ejercicio' : 'Descanso'}
        </span>
        <span className={styles.value} role="timer">
          {formatStopwatch(rest.remainingSeconds)}
        </span>
      </div>

      <div
        className={styles.track}
        role="progressbar"
        aria-label="Descanso cumplido"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(target, rest.elapsedSeconds)}
      >
        <div
          // Se remonta al empezar otro descanso o al cambiar el objetivo: la barra vuelve a estar
          // llena en el acto en vez de deslizarse hacia atrás desde donde se había quedado.
          key={`${lastSetAt}:${String(target)}`}
          className={styles.fill}
          style={{ transform: `scaleX(${String(rest.remaining)})` }}
        />
      </div>

      <p className={styles.status}>
        {rest.done
          ? 'Descanso cumplido: a por la siguiente.'
          : `De ${formatStopwatch(target)}${kind === 'exercise' ? ' para cambiar de máquina' : ''}`}
      </p>

      {offerIphoneTimer && !rest.done && (
        // Un enlace y no un botón que navegue por código: iOS solo abre otra app desde un toque, y
        // el enlace lleva ya lo que queda, no el objetivo entero, porque se toca tras la serie.
        <a className={styles.iphoneTimer} href={iphoneTimerShortcutUrl(rest.remainingSeconds)}>
          Temporizador del iPhone · {formatStopwatch(rest.remainingSeconds)}
        </a>
      )}

      <div className={styles.targets} role="group" aria-label="Descanso objetivo">
        {restTargetsFor(kind).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cx(styles.target, candidate === target && styles.targetActive)}
            aria-pressed={candidate === target}
            onClick={() => {
              onTargetChange(candidate);
            }}
          >
            {formatStopwatch(candidate)}
          </button>
        ))}
      </div>
    </section>
  );
}
