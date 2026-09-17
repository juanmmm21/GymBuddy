import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { TutorialProvider } from '../features/tutorial/TutorialProvider';
import { useNow } from '../hooks/use-now';
import { cx } from '../lib/cx';
import { formatStopwatch } from '../lib/format';
import { elapsedSecondsSince } from '../lib/time';
import { SyncStatus } from '../offline/SyncStatus';
import { useOpenSession } from '../offline/use-open-session';
import { TAB_PATHS } from './screen-transition';
import { ScreenTransition } from './ScreenTransition';
import { sessionShortcutFor } from './session-shortcut';
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
        <nav className={styles.tabBar} aria-label="Secciones">
          {LEADING_TABS.map((tab) => (
            <TabLink key={tab.to} tab={tab} />
          ))}
          <SessionShortcutSlot />
          {TRAILING_TABS.map((tab) => (
            <TabLink key={tab.to} tab={tab} />
          ))}
        </nav>
      </div>
    </TutorialProvider>
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

/**
 * Vive aparte del shell porque `useOpenSession` y el cronómetro repintan cada segundo: así solo se
 * repinta el botón, no la pantalla entera que cuelga del `Outlet`.
 */
function SessionShortcutSlot() {
  const open = useOpenSession();
  const shortcut = sessionShortcutFor(open.data);
  if (shortcut.kind === 'hidden') return null;

  return <SessionShortcutButton startedAt={shortcut.startedAt} />;
}

function SessionShortcutButton({ startedAt }: { readonly startedAt: string }) {
  const now = useNow();

  return (
    // El nombre accesible es fijo: un cronómetro dentro del nombre se anunciaría cada segundo.
    <NavLink
      to={TAB_PATHS.session}
      aria-label="Sesión en curso"
      className={({ isActive }) => cx(styles.sessionTab, isActive && styles.sessionTabActive)}
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
