import { z } from 'zod';
import { t } from '../../i18n/index';
import type { StorageLike } from '../../lib/storage';

/**
 * El tutorial de la primera vez (lo pidió Juan tras entrenar con la app). Se enseña una sola vez,
 * al abrir la app ya dentro de la cuenta, y se puede saltar en cualquier paso. Es una hoja con
 * cinco tarjetas y no unas burbujas ancladas sobre la interfaz: las burbujas se descolocan con el
 * desplazamiento y con la barra de abajo, y aquí lo que hace falta es contar de qué va cada
 * pestaña, no señalar píxeles.
 */

export type TutorialIcon = 'home' | 'session' | 'routines' | 'catalog' | 'settings';

export interface TutorialStep {
  /** Estable: identifica el paso en los tests y como clave de React. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly icon: TutorialIcon;
}

/** Las cuatro pestañas más lo que se hace entrenando, en el orden en que se usan. */
export function tutorialSteps(): readonly TutorialStep[] {
  return [
    {
      id: 'home',
      title: t('Hoy', 'Today'),
      body: t(
        'Tu día de un vistazo: la sesión en curso, la semana entera dibujada sobre una silueta y cómo vienes entrenando. Se empieza a entrenar desde aquí.',
        'Your day at a glance: the session in progress, the whole week drawn on a silhouette and how your training is going. You start training from here.',
      ),
      icon: 'home',
    },
    {
      id: 'session',
      title: t('Registrar una serie', 'Log a set'),
      body: t(
        'Con la sesión abierta, el botón azul del centro te lleva a ella desde cualquier pantalla. El peso viene puesto de tu última serie y el descanso arranca solo al apuntarla.',
        'With a session open, the blue button in the middle takes you to it from any screen. The weight is pre-filled from your last set and the rest timer starts on its own when you log it.',
      ),
      icon: 'session',
    },
    {
      id: 'routines',
      title: t('Rutinas', 'Routines'),
      body: t(
        'Arma tu guion de ejercicios y series, y la sesión te va llevando línea a línea. Si hoy la máquina está ocupada, cambias el ejercicio solo para hoy sin tocar la rutina.',
        'Build your plan of exercises and sets, and the session walks you through it line by line. If the machine is taken today, swap the exercise for today only without touching the routine.',
      ),
      icon: 'routines',
    },
    {
      id: 'catalog',
      title: t('Catálogo', 'Catalogue'),
      body: t(
        'Más de mil ejercicios con su animación, filtrados por parte del cuerpo, músculo o máquina. Lo que no esté, lo creas tú y le guardas una foto o un vídeo de tu técnica.',
        'Over a thousand exercises with animations, filtered by body part, muscle or machine. Whatever isn’t there, you create yourself and save a photo or video of your technique.',
      ),
      icon: 'catalog',
    },
    {
      id: 'settings',
      title: t('Ajustes y sin cobertura', 'Settings and no signal'),
      body: t(
        'El descanso, el aviso de cuando se cumple y tu copia de seguridad están en Ajustes. Y si en el gimnasio no hay cobertura, sigue apuntando: se manda solo en cuanto vuelva.',
        'Rest, the notice when it’s over and your backup are in Settings. And if there’s no signal at the gym, keep logging: it’s sent on its own as soon as it’s back.',
      ),
      icon: 'settings',
    },
  ];
}

/**
 * Cómo está el tutorial en esta visita. `auto` es lo normal —lo decide la preferencia del
 * dispositivo—; `open` es haberlo pedido a mano desde Ajustes, y `closed`, haberlo cerrado.
 */
export type TutorialMode = 'auto' | 'open' | 'closed';

export interface TutorialVisibility {
  readonly mode: TutorialMode;
  /** Si ya se vio en este dispositivo. */
  readonly seen: boolean;
  /** Si hay un entrenamiento en curso: entonces no se asoma solo. */
  readonly hasOpenSession: boolean;
}

/**
 * Pedido a mano sale siempre; solo se pone delante por su cuenta la primera vez y **nunca sobre
 * una sesión abierta**: quien está entrenando no quiere una presentación entre serie y serie.
 */
export function isTutorialVisible({ mode, seen, hasOpenSession }: TutorialVisibility): boolean {
  if (mode === 'open') return true;
  if (mode === 'closed') return false;
  return !seen && !hasOpenSession;
}

/**
 * Del dispositivo y no de la cuenta, como el temporizador del iPhone: quien suma un móvil nuevo a
 * su cuenta no conoce esa pantalla todavía.
 */
export const TUTORIAL_STORAGE_KEY = 'gymbuddy.tutorial';

const storedSchema = z.object({ seen: z.boolean() });

export function loadTutorialSeen(storage: StorageLike): boolean {
  let raw: string | null;
  try {
    raw = storage.getItem(TUTORIAL_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer. Se da por visto: repetirlo en cada arranque molesta
    // más que no enseñarlo, y siempre queda «Ver el tutorial» en Ajustes.
    console.warn('No se pudo leer si el tutorial ya se vio; se da por visto', error);
    return true;
  }
  if (raw === null) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('La preferencia del tutorial no es JSON; se da por visto', error);
    return true;
  }

  const parsed = storedSchema.safeParse(payload);
  return !parsed.success || parsed.data.seen;
}

export function saveTutorialSeen(storage: StorageLike): void {
  try {
    storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ seen: true }));
  } catch (error) {
    // Vale para esta visita; solo volverá a salir la próxima vez que se abra la app.
    console.warn('No se pudo recordar que el tutorial ya se vio', error);
  }
}
