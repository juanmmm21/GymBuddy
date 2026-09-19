import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { TutorialProvider } from '../features/tutorial/TutorialProvider';
import { useExitAnimation } from '../hooks/use-exit-animation';
import { useNow } from '../hooks/use-now';
import { cx } from '../lib/cx';
import { formatStopwatch } from '../lib/format';
import { elapsedSecondsSince } from '../lib/time';
import { SyncStatus } from '../offline/SyncStatus';
import { useOpenSession } from '../offline/use-open-session';
import { TAB_PATHS } from './screen-transition';
import { ScreenTransition } from './ScreenTransition';
import { sessionShortcutFor } from './session-shortcut';
import { tabIndicatorFor, type TabIndicator } from './tab-indicator';
import styles from './TabShell.module.css';

interface Tab {
  readonly to: string;
  readonly label: string;
  readonly icon: TabIcon;
}

type TabIcon = 'home' | 'exercises' | 'catalog' | 'history';

// Dos a cada lado: con una sesión abierta, su botón cae justo en el centro, bajo el pulgar.
const LEADING_TABS: readonly Tab[] = [
  { to: TAB_PATHS.home, label: 'Hoy', icon: 'home' },
  { to: TAB_PATHS.exercises, label: 'Ejercicios', icon: 'exercises' },
];

const TRAILING_TABS: readonly Tab[] = [
  { to: TAB_PATHS.catalog, label: 'Catálogo', icon: 'catalog' },
  { to: TAB_PATHS.history, label: 'Historial', icon: 'history' },
];

/**
 * Columna de contenido con la barra de pestañas fija abajo, al alcance del pulgar. El tutorial de
 * la primera vez envuelve el shell entero: sale sobre cualquier pestaña, y desde Ajustes se puede
 * volver a pedir.
 */
export function TabShell() {
  return (
    <TutorialProvider>
      <div className={styles.shell}>
        <main className={styles.content}>
          <SyncStatus />
          <ScreenTransition>
            <Outlet />
          </ScreenTransition>
        </main>
        <TabBar />
      </div>
    </TutorialProvider>
  );
}

/**
 * Vive aparte del shell porque `useOpenSession` y la ruta la repintan a menudo: así solo se repinta
 * la barra, no la pantalla entera que cuelga del `Outlet`. El cronómetro, que cambia cada segundo,
 * se queda un nivel más abajo todavía.
 */
function TabBar() {
  const { pathname } = useLocation();
  // El ref se crea aquí y se le pone al botón aquí: un ref devuelto dentro de un objeto se lee
  // como leído durante el render.
  const shortcutRef = useRef<HTMLAnchorElement>(null);
  const shortcut = useSessionShortcutSlot(shortcutRef);
  const indicator = tabIndicatorFor(pathname, shortcut.kind === 'shown');

  return (
    <nav className={styles.tabBar} aria-label="Secciones">
      <div className={styles.tabs} style={tabsStyle(indicator)}>
        <TabIndicatorMark indicator={indicator} />
        {LEADING_TABS.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
        {shortcut.kind === 'shown' && (
          <SessionShortcutButton
            ref={shortcutRef}
            startedAt={shortcut.startedAt}
            leaving={shortcut.leaving}
          />
        )}
        {TRAILING_TABS.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  );
}

/**
 * La raya que se desliza de una pestaña a otra. Se queda donde estaba cuando la pantalla actual no
 * es ninguna pestaña —la sesión, Ajustes, una rutina— y solo se apaga: deslizarse hasta el primer
 * hueco para desaparecer allí sería un movimiento que no cuenta nada.
 */
function TabIndicatorMark({ indicator }: { readonly indicator: TabIndicator }) {
  const [lastIndex, setLastIndex] = useState(indicator.index ?? 0);
  if (indicator.index !== null && indicator.index !== lastIndex) setLastIndex(indicator.index);

  return (
    <span
      className={cx(styles.indicator, indicator.index === null && styles.indicatorHidden)}
      style={indicatorStyle(indicator.index ?? lastIndex)}
      data-tab-indicator={indicator.index ?? 'none'}
      aria-hidden="true"
    />
  );
}

function TabLink({ tab }: { readonly tab: Tab }) {
  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      className={({ isActive }) => cx(styles.tab, isActive && styles.tabActive)}
    >
      <Icon kind={tab.icon} />
      <span className={styles.tabLabel}>{tab.label}</span>
    </NavLink>
  );
}

/** El hueco del centro de la barra: vacío, o el botón de la sesión —incluso mientras se va—. */
type SessionShortcutSlot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'shown'; readonly startedAt: string; readonly leaving: boolean };

/**
 * El botón sigue puesto mientras se recoge, así que la sesión que termina no lo hace desaparecer de
 * golpe bajo el pulgar. Por eso hace falta recordar cuándo empezó: durante la salida ya no hay
 * sesión abierta de la que sacarlo, y el cronómetro no puede quedarse sin hora a media animación.
 */
function useSessionShortcutSlot(ref: RefObject<HTMLAnchorElement | null>): SessionShortcutSlot {
  const open = useOpenSession();
  const shortcut = sessionShortcutFor(open.data);
  const exit = useExitAnimation(shortcut.kind === 'live', ref);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  if (shortcut.kind === 'live' && shortcut.startedAt !== startedAt)
    setStartedAt(shortcut.startedAt);

  if (!exit.mounted || startedAt === null) return { kind: 'empty' };
  return { kind: 'shown', startedAt, leaving: exit.leaving };
}

function SessionShortcutButton({
  startedAt,
  leaving,
  ref,
}: {
  readonly startedAt: string;
  readonly leaving: boolean;
  readonly ref: RefObject<HTMLAnchorElement | null>;
}) {
  const now = useNow();

  return (
    // El nombre accesible es fijo: un cronómetro dentro del nombre se anunciaría cada segundo.
    <NavLink
      ref={ref}
      to={TAB_PATHS.session}
      aria-label="Sesión en curso"
      data-session-shortcut={leaving ? 'leaving' : 'live'}
      className={({ isActive }) =>
        cx(styles.sessionTab, isActive && styles.sessionTabActive, leaving && styles.sessionTabGone)
      }
    >
      <span className={styles.sessionButton} aria-hidden="true">
        <PlateIcon />
        <span className={styles.sessionClock}>
          {formatStopwatch(elapsedSecondsSince(startedAt, now))}
        </span>
      </span>
    </NavLink>
  );
}

/**
 * Los huecos de la barra y el que lleva la marca. Van en variables y no en una clase porque son
 * cuentas —cuántas columnas hay y cuál toca—, no valores de diseño escritos a mano.
 */
function tabsStyle(indicator: TabIndicator): CSSProperties {
  return { '--tab-columns': String(indicator.columns) } as CSSProperties;
}

function indicatorStyle(index: number): CSSProperties {
  return { '--tab-index': String(index) } as CSSProperties;
}

/** Un disco visto de frente, con su agujero: el mismo trazo que los iconos de las pestañas. */
function PlateIcon() {
  return (
    <svg
      className={styles.sessionIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function Icon({ kind }: { readonly kind: TabIcon }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[kind]}
    </svg>
  );
}

const ICON_PATHS: Readonly<Record<TabIcon, ReactNode>> = {
  home: (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  exercises: (
    <>
      <path d="M6 8v8M18 8v8M3 10v4M21 10v4" />
      <path d="M6 12h12" />
    </>
  ),
  catalog: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v5h5" />
      <path d="M12 8v4l3 2" />
    </>
  ),
};
