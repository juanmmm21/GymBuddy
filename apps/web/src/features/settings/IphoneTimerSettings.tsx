import { useState } from 'react';
import { useStorage } from '../../app/StorageProvider';
import { Switch } from '../../components/index';
import {
  IPHONE_TIMER_SHORTCUT_NAME,
  loadIphoneTimerEnabled,
  saveIphoneTimerEnabled,
} from '../session/iphone-timer';
import styles from './IphoneTimerSettings.module.css';

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
        label="Temporizador del iPhone"
        hint="En el descanso sale un botón que lo pone con lo que queda. Suena con la app cerrada y sin cobertura."
        checked={enabled}
        onChange={(next) => {
          setEnabled(next);
          saveIphoneTimerEnabled(storage, next);
        }}
      />
      {enabled && (
        <div className={styles.steps}>
          <p className={styles.intro}>Hace falta un Atajo, y se crea una sola vez:</p>
          <ol className={styles.list}>
            <li>Abre la app Atajos y toca «+».</li>
            <li>Añade la acción «Iniciar temporizador».</li>
            <li>
              Toca la duración, elige la variable «Entrada del atajo» y deja la unidad en segundos.
            </li>
            <li>
              Ponle de nombre exactamente <strong>{IPHONE_TIMER_SHORTCUT_NAME}</strong>.
            </li>
          </ol>
          <p className={styles.note}>
            La primera vez el iPhone pregunta si puede abrir Atajos: di que sí. Para volver a
            GymBuddy, desliza a la derecha por la barra de abajo.
          </p>
        </div>
      )}
    </div>
  );
}
