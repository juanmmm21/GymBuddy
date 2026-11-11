import type { Locale } from '@gymbuddy/shared';
import { useId } from 'react';
import { useLanguage } from '../../i18n/index';
import { cx } from '../../lib/cx';
import styles from './LanguageFlags.module.css';

interface LanguageOption {
  readonly locale: Locale;
  /** En su propio idioma: quien no entiende el que está puesto tiene que reconocer el suyo. */
  readonly name: string;
}

const OPTIONS: readonly LanguageOption[] = [
  { locale: 'es', name: 'Español' },
  { locale: 'en', name: 'English' },
];

/**
 * El cambio de idioma de la pantalla de entrada: una bandera y el nombre de cada idioma, a un
 * toque. Va arriba y no en un desplegable al pie porque es lo primero que busca quien ha caído en
 * un idioma que no entiende, y una bandera se reconoce sin leer nada. El rótulo del grupo va en los
 * dos idiomas por lo mismo.
 */
export function LanguageFlags({ className }: { readonly className?: string | undefined }) {
  const { locale, setPreference } = useLanguage();

  return (
    <div className={cx(styles.group, className)} role="group" aria-label="Idioma · Language">
      {OPTIONS.map((option) => {
        const active = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            lang={option.locale}
            className={cx(styles.option, active && styles.active)}
            aria-pressed={active}
            onClick={() => {
              setPreference(option.locale);
            }}
          >
            <Flag locale={option.locale} />
            <span>{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Flag({ locale }: { readonly locale: Locale }) {
  return (
    <span className={styles.flag} aria-hidden="true">
      {locale === 'es' ? <SpainFlag /> : <UnitedKingdomFlag />}
    </span>
  );
}

/** La rojigualda sin escudo: a este tamaño el escudo es una mancha. */
function SpainFlag() {
  return (
    <svg viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none">
      <rect width="3" height="2" fill="#AA151B" />
      <rect y="0.5" width="3" height="1" fill="#F1BF00" />
    </svg>
  );
}

/** La Union Jack, recortada a 3:2 como la española para que las dos banderas midan lo mismo. */
function UnitedKingdomFlag() {
  const id = useId();
  const field = `${id}-field`;
  const diagonals = `${id}-diagonals`;

  return (
    <svg viewBox="0 0 60 30" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath id={field}>
          <path d="M0,0 v30 h60 v-30 z" />
        </clipPath>
        <clipPath id={diagonals}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${field})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${diagonals})`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}
