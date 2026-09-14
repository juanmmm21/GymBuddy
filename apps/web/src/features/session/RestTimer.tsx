import type { ReactNode } from 'react';
import { useNow } from '../../hooks/use-now';
import { cx } from '../../lib/cx';
import { formatStopwatch } from '../../lib/format';
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
}

/**
 * El descanso, en cuenta atrás desde el objetivo y **parado en 0:00** al cumplirse: lo que se tarda
 * en hacer la serie siguiente no se ve como descanso (lo pidió Juan). No arranca al pulsar nada:
 * cuenta desde la última serie registrada, así que recargar la app o volver del catálogo no lo
 * reinicia.
 */
export function RestTimer({ lastSetAt, kind, target, onTargetChange, companion }: RestTimerProps) {
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
        <div className={styles.fill} style={{ width: `${String(rest.progress * 100)}%` }} />
      </div>

      <p className={styles.status}>
        {rest.done
          ? 'Descanso cumplido: a por la siguiente.'
          : `De ${formatStopwatch(target)}${kind === 'exercise' ? ' para cambiar de máquina' : ''}`}
      </p>

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
