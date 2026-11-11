import { Notice, Switch } from '../../components/index';
import { describeError } from '../../lib/errors';
import { useInstallGuide } from '../install/InstallProvider';
import { pushAvailability } from './push-notices';
import { usePushBrowser } from './PushBrowserProvider';
import styles from './RestPushSettings.module.css';
import {
  useDisablePushNotices,
  useEnablePushNotices,
  usePushConfig,
  usePushNoticesEnabled,
} from './use-push-notices';
import { t } from '../../i18n/index';

/**
 * Encender en este dispositivo el aviso de fin de descanso por push (ADR 0009). Es del
 * dispositivo, no de la cuenta: cada móvil da su propio permiso y tiene su propia suscripción.
 */
export function RestPushSettings() {
  const browser = usePushBrowser();
  const { situation, platform } = useInstallGuide();
  const availability = pushAvailability({
    platform,
    installed: situation.kind === 'installed',
    browser,
  });
  const available = availability === 'available';

  const config = usePushConfig(available);
  const enabled = usePushNoticesEnabled(available ? browser : null);
  const enable = useEnablePushNotices(browser);
  const disable = useDisablePushNotices(browser);

  if (availability === 'needs_install') {
    return (
      <div className={styles.body}>
        {/* Sin enlace propio: «Instalar la app» ya sale en esta misma pantalla, en la cuenta. */}
        <p className={styles.note}>
          {t(
            'En el iPhone el aviso de fin de descanso solo llega con la app en la pantalla de inicio: instálala desde «Instalar la app», más abajo.',
            'On iPhone the end-of-rest notice only arrives with the app on your home screen: install it from “Install the app”, below.',
          )}
        </p>
      </div>
    );
  }

  if (availability === 'unsupported') {
    return (
      <div className={styles.body}>
        <p className={styles.note}>
          {t(
            'Este navegador no puede recibir el aviso de fin de descanso.',
            'This browser can’t receive the end-of-rest notice.',
          )}
        </p>
      </div>
    );
  }

  if (availability === 'blocked') {
    return (
      <div className={styles.body}>
        <Notice tone="warning" title={t('Notificaciones bloqueadas', 'Notifications blocked')}>
          {t(
            'Diste que no al permiso. Actívalas para GymBuddy en los ajustes del móvil y vuelve aquí.',
            'You denied the permission. Enable them for GymBuddy in your phone’s settings and come back here.',
          )}
        </Notice>
      </div>
    );
  }

  const publicKey = config.data?.publicKey ?? null;
  const pending = enable.isPending || disable.isPending;
  const failure = enable.error ?? disable.error ?? config.error;

  return (
    <div className={styles.body}>
      <Switch
        label={t('Aviso al acabar el descanso', 'Notice when rest ends')}
        hint={t(
          'Una notificación aunque hayas cerrado la app. Necesita cobertura al empezar y al acabar el descanso.',
          'A notification even if you’ve closed the app. Needs signal when the rest starts and ends.',
        )}
        checked={enabled.data ?? false}
        disabled={publicKey === null || enabled.data === undefined || pending}
        onChange={(next) => {
          if (publicKey === null) return;
          enable.reset();
          disable.reset();
          if (next && browser !== null) {
            // Dentro del toque y antes de cualquier espera: si no, iOS no enseña la pregunta.
            enable.mutate({ publicKey, permission: browser.requestPermission() });
          } else {
            disable.mutate();
          }
        }}
      />
      {config.data?.publicKey === null && (
        <p className={styles.note}>
          {t(
            'El servidor todavía no tiene las claves para mandar avisos.',
            'The server doesn’t have the keys to send notices yet.',
          )}
        </p>
      )}
      {enabled.data === true && (
        <p className={styles.note}>
          {t(
            'Encendido en este dispositivo: al registrar una serie, te avisa cuando se cumple el descanso.',
            'On for this device: after you log a set, it notifies you when the rest is over.',
          )}
        </p>
      )}
      {failure !== null && (
        <Notice
          tone="danger"
          title={t('No se pudo cambiar el aviso', 'Couldn’t change the notice')}
        >
          {describeError(failure)}
        </Notice>
      )}
    </div>
  );
}
