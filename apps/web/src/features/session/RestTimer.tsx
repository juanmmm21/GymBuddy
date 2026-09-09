import { useNow } from '../../hooks/use-now';
import { cx } from '../../lib/cx';
import { formatStopwatch } from '../../lib/format';
import { REST_TARGETS_SECONDS, restStateAt, type RestTargetSeconds } from './rest';
import styles from './RestTimer.module.css';

export interface RestTimerProps {
  /** Momento de la última serie: desde ahí se cuenta el descanso. */
  readonly lastSetAt: string;
  readonly target: RestTargetSeconds;
  readonly onTargetChange: (target: RestTargetSeconds) => void;
}

/**
 * El descanso entre series. No arranca al pulsar nada: cuenta desde la última serie
 * registrada, así que recargar la app o volver del catálogo no lo reinicia.
 */
export function RestTimer({ lastSetAt, target, onTargetChange }: RestTimerProps) {
  const now = useNow();
  const rest = restStateAt(lastSetAt, now, target);

  return (
    <section className={cx(styles.timer, rest.done && styles.timerDone)} aria-label="Descanso">
      <div className={styles.head}>
        <span className={styles.label}>Descanso</span>
        <span className={styles.value} role="timer">
          {formatStopwatch(rest.elapsedSeconds)}
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
          : `Faltan ${formatStopwatch(rest.remainingSeconds)}`}
      </p>

      <div className={styles.targets} role="group" aria-label="Descanso objetivo">
        {REST_TARGETS_SECONDS.map((candidate) => (
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
