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

const SWITCH_LABEL = 'Aviso al acabar el descanso';
const SWITCH_HINT =
  'Una notificación aunque hayas cerrado la app. Necesita cobertura al empezar y al acabar el descanso.';

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
          En el iPhone el aviso de fin de descanso solo llega con la app en la pantalla de inicio:
          instálala desde «Instalar la app», más abajo.
        </p>
      </div>
    );
  }

  if (availability === 'unsupported') {
    return (
      <div className={styles.body}>
        <p className={styles.note}>Este navegador no puede recibir el aviso de fin de descanso.</p>
      </div>
    );
  }

  if (availability === 'blocked') {
    return (
      <div className={styles.body}>
        <Notice tone="warning" title="Notificaciones bloqueadas">
          Diste que no al permiso. Actívalas para GymBuddy en los ajustes del móvil y vuelve aquí.
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
        label={SWITCH_LABEL}
        hint={SWITCH_HINT}
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
        <p className={styles.note}>El servidor todavía no tiene las claves para mandar avisos.</p>
      )}
      {enabled.data === true && (
        <p className={styles.note}>
          Encendido en este dispositivo: al registrar una serie, te avisa cuando se cumple el
          descanso.
        </p>
      )}
      {failure !== null && (
        <Notice tone="danger" title="No se pudo cambiar el aviso">
          {describeError(failure)}
        </Notice>
      )}
    </div>
  );
}
