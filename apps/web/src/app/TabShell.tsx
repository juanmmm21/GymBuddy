import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cx } from '../lib/cx';
import styles from './TabShell.module.css';

interface Tab {
  readonly to: string;
  readonly label: string;
  readonly icon: TabIcon;
}

type TabIcon = 'home' | 'exercises' | 'catalog' | 'history';

const TABS: readonly Tab[] = [
  { to: '/', label: 'Hoy', icon: 'home' },
  { to: '/exercises', label: 'Ejercicios', icon: 'exercises' },
  { to: '/catalog', label: 'Catálogo', icon: 'catalog' },
  { to: '/history', label: 'Historial', icon: 'history' },
];

/** Columna de contenido con la barra de pestañas fija abajo, al alcance del pulgar. */
export function TabShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <nav className={styles.tabBar} aria-label="Secciones">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => cx(styles.tab, isActive && styles.tabActive)}
          >
            <Icon kind={tab.icon} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
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
