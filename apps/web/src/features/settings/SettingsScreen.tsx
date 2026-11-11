import { Link } from 'react-router';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { Button, CatalogCredit, Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { BACKUP_PATH } from '../backup/paths';
import { CompeteSwitch } from '../competition/CompeteSwitch';
import { COMPETITION_PATH } from '../competition/paths';
import { DEVICES_PATH } from '../devices/paths';
import { useInstallGuide } from '../install/InstallProvider';
import { INSTALL_PATH } from '../install/paths';
import { t } from '../../i18n/index';
import { INVITE_PATH } from '../invitations/paths';
import { useTutorial } from '../tutorial/TutorialProvider';
import { IphoneTimerSettings } from './IphoneTimerSettings';
import { LanguageSettings } from './LanguageSettings';
import { ProfileNameForm } from './ProfileNameForm';
import { RestPushSettings } from './RestPushSettings';
import styles from './SettingsScreen.module.css';

function backToHome(): BackLink {
  return { to: '/', label: t('Hoy', 'Today') };
}

interface SettingsEntry {
  readonly to: string;
  readonly title: string;
  readonly description: string;
}

function accountEntries(): readonly SettingsEntry[] {
  return [
    {
      to: DEVICES_PATH,
      title: t('Añadir otro dispositivo', 'Add another device'),
      description: t(
        'Entra en tu cuenta desde otro móvil con un código de diez minutos.',
        'Sign in to your account on another phone with a ten-minute code.',
      ),
    },
    {
      to: INVITE_PATH,
      title: t('Invitar a un amigo', 'Invite a friend'),
      description: t(
        'Un código para que se cree su propia cuenta.',
        'A code so they can create their own account.',
      ),
    },
    {
      to: BACKUP_PATH,
      title: t('Copia de seguridad', 'Backup'),
      description: t(
        'Descarga todo lo que has entrenado o recupéralo desde un fichero.',
        'Download everything you have trained, or restore it from a file.',
      ),
    },
  ];
}

function competitionEntries(): readonly SettingsEntry[] {
  return [
    {
      to: COMPETITION_PATH,
      title: t('Ver la competición', 'View the competition'),
      description: t(
        'Tu marcador contra cada rival, ejercicio a ejercicio.',
        'Your score against each rival, exercise by exercise.',
      ),
    },
  ];
}

function installEntry(): SettingsEntry {
  return {
    to: INSTALL_PATH,
    title: t('Instalar la app', 'Install the app'),
    description: t(
      'Tenla en la pantalla de inicio y ábrela sin navegador, también sin cobertura.',
      'Keep it on your home screen and open it without a browser, even with no signal.',
    ),
  };
}

/**
 * Lo que no se usa entrenando: la cuenta, los dispositivos y la copia. Vive aparte de Hoy para que
 * la pantalla que se abre en el gimnasio empiece por la sesión y no por una lista de enlaces.
 */
export function SettingsScreen() {
  const { session, signOut } = useSession();
  const { situation, platform } = useInstallGuide();
  const { show: showTutorial } = useTutorial();
  const appEntries = situation.kind === 'installed' ? [] : [installEntry()];

  return (
    <>
      <ScreenHeader
        title={t('Ajustes', 'Settings')}
        subtitle={
          session === null
            ? undefined
            : t(
                `Entraste como ${session.user.displayName}`,
                `Signed in as ${session.user.displayName}`,
              )
        }
        backTo={backToHome()}
      />
      <div className={styles.stack}>
        {session !== null && (
          <Surface as="section" padding="none" aria-labelledby="settings-profile">
            <h2 id="settings-profile" className={styles.sectionTitle}>
              {t('Tu nombre', 'Your name')}
            </h2>
            <ProfileNameForm currentName={session.user.displayName} />
          </Surface>
        )}
        <Surface as="section" padding="none" aria-labelledby="settings-rest">
          <h2 id="settings-rest" className={styles.sectionTitle}>
            {t('Descanso', 'Rest')}
          </h2>
          <RestPushSettings />
          {platform === 'ios' && <IphoneTimerSettings />}
        </Surface>
        <Surface as="section" padding="none" aria-labelledby="settings-competition">
          <h2 id="settings-competition" className={styles.sectionTitle}>
            {t('Competir', 'Compete')}
          </h2>
          <div className={styles.sectionBody}>
            <CompeteSwitch />
          </div>
          <EntryList entries={competitionEntries()} />
        </Surface>
        <Surface as="section" padding="none" aria-labelledby="settings-account">
          <h2 id="settings-account" className={styles.sectionTitle}>
            {t('Tu cuenta', 'Your account')}
          </h2>
          <EntryList entries={accountEntries()} />
        </Surface>
        <Surface as="section" padding="none" aria-labelledby="settings-app">
          <h2 id="settings-app" className={styles.sectionTitle}>
            {t('La app', 'The app')}
          </h2>
          <LanguageSettings />
          <ul className={styles.list}>
            <li>
              <button
                type="button"
                className={cx(styles.row, styles.rowButton)}
                onClick={showTutorial}
              >
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {t('Ver el tutorial', 'View the tutorial')}
                  </span>
                  <span className={styles.rowDescription}>
                    {t(
                      'Lo que hace cada pantalla, otra vez y desde el principio.',
                      'What each screen does, again from the start.',
                    )}
                  </span>
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
            {appEntries.map((entry) => (
              <EntryRow key={entry.to} entry={entry} />
            ))}
          </ul>
        </Surface>
        {/* El crédito del catálogo también aquí: en Ajustes se busca de dónde sale lo que se ve,
            y esta pantalla se abre aunque nunca se entre al catálogo. */}
        <Surface as="section" padding="none" aria-labelledby="settings-credits">
          <h2 id="settings-credits" className={styles.sectionTitle}>
            {t('Créditos', 'Credits')}
          </h2>
          <CatalogCredit />
        </Surface>
        <Button variant="danger" fullWidth onClick={signOut}>
          {t('Salir', 'Sign out')}
        </Button>
      </div>
    </>
  );
}

function EntryList({ entries }: { readonly entries: readonly SettingsEntry[] }) {
  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <EntryRow key={entry.to} entry={entry} />
      ))}
    </ul>
  );
}

function EntryRow({ entry }: { readonly entry: SettingsEntry }) {
  return (
    <li>
      <Link to={entry.to} className={styles.row}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{entry.title}</span>
          <span className={styles.rowDescription}>{entry.description}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
