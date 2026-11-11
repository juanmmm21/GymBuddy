import type { DeviceLink } from '@gymbuddy/shared';
import { useCreateDeviceLink } from '../../api/mutations';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AccessCode, Button, Notice, Surface } from '../../components/index';
import { useNow } from '../../hooks/use-now';
import { describeError } from '../../lib/errors';
import { formatStopwatch } from '../../lib/format';
import styles from './LinkDeviceScreen.module.css';
import { secondsUntil } from './link-code';
import { SETTINGS_PATH } from '../settings/paths';
import { t } from '../../i18n/index';

function backToSettings(): BackLink {
  return { to: SETTINGS_PATH, label: t('Ajustes', 'Settings') };
}

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
        title={t('Añadir otro dispositivo', 'Add another device')}
        subtitle={t(
          'Para usar tu cuenta también desde otro móvil',
          'To use your account from another phone too',
        )}
        backTo={backToSettings()}
      />

      <div className={styles.stack}>
        <Surface as="section">
          <ol className={styles.steps}>
            <li>{t('Pide aquí un código.', 'Get a code here.')}</li>
            <li>
              {t(
                'En el otro móvil, abre GymBuddy y pulsa «Ya la uso en otro móvil».',
                'On the other phone, open GymBuddy and tap “I use it on another phone”.',
              )}
            </li>
            <li>
              {t(
                'Escribe allí el código antes de que caduque y confirma con la huella o la cara.',
                'Enter the code there before it expires and confirm with your fingerprint or face.',
              )}
            </li>
          </ol>
        </Surface>

        {link.isError && (
          <Notice
            tone="danger"
            title={t('No se ha podido pedir el código', 'Couldn’t get a code')}
            action={
              <Button variant="secondary" onClick={ask}>
                {t('Reintentar', 'Retry')}
              </Button>
            }
          >
            {describeError(link.error)}
          </Notice>
        )}

        {link.data === undefined ? (
          <Button size="lg" fullWidth loading={link.isPending} onClick={ask}>
            {t('Pedir un código', 'Get a code')}
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
        title={t('El código ha caducado', 'The code has expired')}
        action={
          <Button variant="secondary" loading={pending} onClick={onRenew}>
            {t('Pedir otro código', 'Get another code')}
          </Button>
        }
      >
        {t(
          'Cada código dura diez minutos y solo vale una vez.',
          'Each code lasts ten minutes and works only once.',
        )}
      </Notice>
    );
  }

  return (
    <>
      <AccessCode code={link.code}>
        <p className={styles.countdown} role="timer">
          {t('Caduca en', 'Expires in')} {formatStopwatch(remainingSeconds)}
        </p>
      </AccessCode>
      <Notice title={t('Solo para ti', 'Just for you')}>
        {t(
          'Quien tenga este código puede entrar en tu cuenta desde su móvil mientras no caduque. Si se lo has enseñado a alguien sin querer, pide otro: el anterior deja de valer.',
          'Anyone with this code can sign in to your account from their phone until it expires. If you showed it to someone by mistake, get another: the previous one stops working.',
        )}
      </Notice>
      <Button variant="secondary" fullWidth loading={pending} onClick={onRenew}>
        {t('Pedir otro código', 'Get another code')}
      </Button>
    </>
  );
}
