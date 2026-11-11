import { Select } from '../../components/index';
import { LANGUAGE_PREFERENCES, type LanguagePreference, t, useLanguage } from '../../i18n/index';
import styles from './SettingsScreen.module.css';

/**
 * Cada idioma se nombra en su propio idioma, como en cualquier selector de idioma: quien ha
 * acabado con la app en uno que no entiende tiene que poder encontrar el suyo.
 */
const LANGUAGE_NAMES: Readonly<Record<Exclude<LanguagePreference, 'system'>, string>> = {
  es: 'Español',
  en: 'English',
};

function optionLabel(preference: LanguagePreference): string {
  return preference === 'system'
    ? t('El del sistema', 'System default')
    : LANGUAGE_NAMES[preference];
}

/** Elegir el idioma de la app en este dispositivo; por defecto, el del sistema. */
export function LanguageSelect() {
  const { preference, setPreference } = useLanguage();

  return (
    <Select
      label={t('Idioma de la app', 'App language')}
      value={preference}
      onChange={(value) => {
        const next = LANGUAGE_PREFERENCES.find((candidate) => candidate === value);
        if (next !== undefined) setPreference(next);
      }}
      options={LANGUAGE_PREFERENCES.map((value) => ({ value, label: optionLabel(value) }))}
      hint={t(
        'También cambia el idioma de los nombres e instrucciones del catálogo.',
        'Also changes the language of catalogue names and instructions.',
      )}
    />
  );
}

export function LanguageSettings() {
  return (
    <div className={styles.sectionBody}>
      <LanguageSelect />
    </div>
  );
}
