import type { Locale, ResourceId } from '@gymbuddy/shared';
import { useCancelCardio } from '../../api/mutations';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import { describeError } from '../../lib/errors';
import { formatStopwatch, formatTime } from '../../lib/format';
import { elapsedSecondsSince } from '../../lib/time';
import styles from './CardioInProgressCard.module.css';

export interface CardioInProgressCardProps {
  readonly sessionId: ResourceId;
  readonly startedAt: string;
  readonly locale: Locale;
  /** Si hay un ejercicio de cardio con el que apuntarlo; sin él solo se puede quitar. */
  readonly canLog: boolean;
  readonly onLog: () => void;
}

/**
 * El cardio en marcha ocupa el sitio del descanso: mientras se corre no hay descanso que contar, y lo
 * que se quiere ver es cuánto se lleva. Dice que la sesión no se cierra, que es el motivo de empezarlo.
 */
export function CardioInProgressCard({
  sessionId,
  startedAt,
  locale,
  canLog,
  onLog,
}: CardioInProgressCardProps) {
  const now = useNow();
  const cancel = useCancelCardio();

  return (
    <Surface as="section" className={styles.card} aria-label="Cardio en marcha">
      <div className={styles.head}>
        <Badge tone="accent">Cardio en marcha</Badge>
        <span className={styles.since}>Desde las {formatTime(startedAt, locale)}</span>
      </div>
      <p className={styles.value} role="timer">
        {formatStopwatch(elapsedSecondsSince(startedAt, now))}
      </p>
      <p className={styles.hint}>
        La sesión no se cierra mientras dure. Al terminar, apúntalo y se guarda con este tiempo.
      </p>

      {cancel.isError && (
        <Notice tone="danger" title="No se pudo quitar el cardio">
          {describeError(cancel.error)}
        </Notice>
      )}

      <div className={styles.actions}>
        <Button size="lg" fullWidth disabled={!canLog} onClick={onLog}>
          Apuntar cardio
        </Button>
        <Button
          variant="ghost"
          fullWidth
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate(sessionId);
          }}
        >
          Quitar cardio
        </Button>
      </div>
    </Surface>
  );
}
