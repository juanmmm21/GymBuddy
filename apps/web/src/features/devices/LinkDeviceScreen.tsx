import type { DeviceLink } from '@gymbuddy/shared';
import { useCreateDeviceLink } from '../../api/mutations';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AccessCode, Button, Notice, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import { describeError } from '../../lib/errors';
import { formatStopwatch } from '../../lib/format';
import styles from './LinkDeviceScreen.module.css';
import { secondsUntil } from './link-code';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

/**
 * El código con el que otro móvil se suma a esta cuenta. Hace falta porque las llaves de acceso
 * se sincronizan dentro de Apple o dentro de Google, pero no entre los dos: pasar de iPhone a
 * Android es crear allí otra llave de la misma cuenta.
 */
export function LinkDeviceScreen() {
  const link = useCreateDeviceLink();

  const ask = (): void => {
    link.mutate();
  };

  return (
    <>
      <ScreenHeader
        title="Añadir otro dispositivo"
        subtitle="Para usar tu cuenta también desde otro móvil"
        backTo={BACK_TO_HOME}
      />

      <div className={styles.stack}>
        <Surface as="section">
          <ol className={styles.steps}>
            <li>Pide aquí un código.</li>
            <li>En el otro móvil, abre GymBuddy y pulsa «Ya la uso en otro móvil».</li>
            <li>Escribe allí el código antes de que caduque y confirma con la huella o la cara.</li>
          </ol>
        </Surface>

        {link.isError && (
          <Notice
            tone="danger"
            title="No se ha podido pedir el código"
            action={
              <Button variant="secondary" onClick={ask}>
                Reintentar
              </Button>
            }
          >
            {describeError(link.error)}
          </Notice>
        )}

        {link.data === undefined ? (
          <Button size="lg" fullWidth loading={link.isPending} onClick={ask}>
            Pedir un código
          </Button>
        ) : (
          <LiveCode link={link.data} pending={link.isPending} onRenew={ask} />
        )}
      </div>
    </>
  );
}

interface LiveCodeProps {
  readonly link: DeviceLink;
  readonly pending: boolean;
  readonly onRenew: () => void;
}

/** El código mientras vale, con lo que le queda; cuando caduca, la forma de pedir otro. */
function LiveCode({ link, pending, onRenew }: LiveCodeProps) {
  // El tiempo se lee del reloj, no de un estado que haya que mantener al día.
  const remainingSeconds = secondsUntil(link.expiresAt, useNow());

  if (remainingSeconds === 0) {
    return (
      <Notice
        tone="warning"
        title="El código ha caducado"
        action={
          <Button variant="secondary" loading={pending} onClick={onRenew}>
            Pedir otro código
          </Button>
        }
      >
        Cada código dura diez minutos y solo vale una vez.
      </Notice>
    );
  }

  return (
    <>
      <AccessCode code={link.code}>
        <p className={styles.countdown} role="timer">
          Caduca en {formatStopwatch(remainingSeconds)}
        </p>
      </AccessCode>
      <Notice title="Solo para ti">
        Quien tenga este código puede entrar en tu cuenta desde su móvil mientras no caduque. Si se
        lo has enseñado a alguien sin querer, pide otro: el anterior deja de valer.
      </Notice>
      <Button variant="secondary" fullWidth loading={pending} onClick={onRenew}>
        Pedir otro código
      </Button>
    </>
  );
}
