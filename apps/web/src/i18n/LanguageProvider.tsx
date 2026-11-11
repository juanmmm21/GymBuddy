import type { Locale } from '@gymbuddy/shared';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StorageLike } from '../lib/storage';
import {
  loadLanguagePreference,
  resolveLocale,
  saveLanguagePreference,
  systemLanguages,
  type LanguagePreference,
} from './language';
import { saveNoticeLocale } from './notice-locale';
import { currentLocale, setCurrentLocale } from './translate';

export interface LanguageContextValue {
  /** Lo elegido en Ajustes: un idioma concreto o el del sistema. */
  readonly preference: LanguagePreference;
  /** El idioma en el que habla la app, ya resuelto. */
  readonly locale: Locale;
  readonly setPreference: (preference: LanguagePreference) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export interface LanguageProviderProps {
  readonly storage: StorageLike;
  readonly children: ReactNode;
}

function readSystemLanguages(): string[] {
  return typeof navigator === 'undefined' ? [] : systemLanguages(navigator);
}

/**
 * Decide en qué idioma habla la app: el elegido en este dispositivo o, por defecto, el del sistema.
 * Si el sistema cambia de idioma con la app abierta (`languagechange`), la app le sigue mientras no
 * se haya elegido uno concreto.
 */
export function LanguageProvider({ storage, children }: LanguageProviderProps) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(() =>
    loadLanguagePreference(storage),
  );
  const [languages, setLanguages] = useState<string[]>(readSystemLanguages);
  const locale = resolveLocale(preference, languages);

  // Antes de pintar a los hijos: el texto que sale de funciones puras lee el idioma del módulo.
  if (currentLocale() !== locale) setCurrentLocale(locale);

  useEffect(() => {
    const update = (): void => {
      setLanguages(readSystemLanguages());
    };
    window.addEventListener('languagechange', update);
    return () => {
      window.removeEventListener('languagechange', update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    void saveNoticeLocale(typeof caches === 'undefined' ? undefined : caches, locale);
  }, [locale]);

  const setPreference = useCallback(
    (next: LanguagePreference): void => {
      saveLanguagePreference(storage, next);
      setPreferenceState(next);
    },
    [storage],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ preference, locale, setPreference }),
    [preference, locale, setPreference],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (value === null) {
    throw new Error('useLanguage solo puede usarse dentro de <LanguageProvider>');
  }
  return value;
}

/** El idioma en el que habla la app ahora mismo. */
export function useLocale(): Locale {
  return useLanguage().locale;
}

/**
 * Vuelve a montar lo que cuelga de él al cambiar de idioma. Hay textos calculados una vez al montar
 * (en un `useState`, en un `useMemo`), y repintar no basta para traducirlos; montarlos de nuevo sí.
 */
export function LocaleBoundary({ children }: { readonly children: ReactNode }) {
  const { locale } = useLanguage();
  return <Fragment key={locale}>{children}</Fragment>;
}
