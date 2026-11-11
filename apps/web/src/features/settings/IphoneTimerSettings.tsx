import { useState } from 'react';
import { useStorage } from '../../app/StorageProvider';
import { Switch } from '../../components/index';
import {
  IPHONE_TIMER_SHORTCUT_NAME,
  loadIphoneTimerEnabled,
  saveIphoneTimerEnabled,
} from '../session/iphone-timer';
import styles from './IphoneTimerSettings.module.css';
import { t } from '../../i18n/index';

/**
 * Encender el Temporizador del iPhone y, al hacerlo, cómo crear el Atajo que lo arranca. Los pasos
 * van aquí y no en un enlace a otra guía: se siguen una vez, con la app Atajos abierta al lado.
 */
export function IphoneTimerSettings() {
  const storage = useStorage();
  const [enabled, setEnabled] = useState(() => loadIphoneTimerEnabled(storage));

  return (
    <div className={styles.body}>
      <Switch
        label={t('Temporizador del iPhone', 'iPhone timer')}
        hint={t(
          'En el descanso sale un botón que lo pone con lo que queda. Suena con la app cerrada y sin cobertura.',
          'During rest a button sets it to the time left. It rings with the app closed and no signal.',
        )}
        checked={enabled}
        onChange={(next) => {
          setEnabled(next);
          saveIphoneTimerEnabled(storage, next);
        }}
      />
      {enabled && (
        <div className={styles.steps}>
          <p className={styles.intro}>
            {t(
              'Hace falta un Atajo, y se crea una sola vez:',
              'It needs a Shortcut, created just once:',
            )}
          </p>
          <ol className={styles.list}>
            <li>{t('Abre la app Atajos y toca «+».', 'Open the Shortcuts app and tap “+”.')}</li>
            <li>{t('Añade la acción «Iniciar temporizador».', 'Add the “Start Timer” action.')}</li>
            <li>
              {t(
                'Toca la duración, elige la variable «Entrada del atajo» y deja la unidad en segundos.',
                'Tap the duration, choose the “Shortcut Input” variable and leave the unit in seconds.',
              )}
            </li>
            <li>
              {t('Ponle de nombre exactamente', 'Name it exactly')}{' '}
              <strong>{IPHONE_TIMER_SHORTCUT_NAME}</strong>.
            </li>
          </ol>
          <p className={styles.note}>
            {t(
              'La primera vez el iPhone pregunta si puede abrir Atajos: di que sí. Para volver a GymBuddy, desliza a la derecha por la barra de abajo.',
              'The first time, your iPhone asks whether it can open Shortcuts: say yes. To get back to GymBuddy, swipe right along the bottom bar.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
