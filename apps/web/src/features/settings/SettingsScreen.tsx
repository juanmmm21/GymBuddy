import { Link } from 'react-router';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { Button, Surface } from '../../components/index';
import { BACKUP_PATH } from '../backup/paths';
import { DEVICES_PATH } from '../devices/paths';
import { useInstallGuide } from '../install/InstallProvider';
import { INSTALL_PATH } from '../install/paths';
import { INVITE_PATH } from '../invitations/paths';
import { IphoneTimerSettings } from './IphoneTimerSettings';
import { ProfileNameForm } from './ProfileNameForm';
import { RestPushSettings } from './RestPushSettings';
import styles from './SettingsScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };

interface SettingsEntry {
  readonly to: string;
  readonly title: string;
  readonly description: string;
}

const ACCOUNT_ENTRIES: readonly SettingsEntry[] = [
  {
    to: DEVICES_PATH,
    title: 'Añadir otro dispositivo',
    description: 'Entra en tu cuenta desde otro móvil con un código de diez minutos.',
  },
  {
    to: INVITE_PATH,
    title: 'Invitar a un amigo',
    description: 'Un código para que se cree su propia cuenta.',
  },
  {
    to: BACKUP_PATH,
    title: 'Copia de seguridad',
    description: 'Descarga todo lo que has entrenado o recupéralo desde un fichero.',
  },
];

const INSTALL_ENTRY: SettingsEntry = {
  to: INSTALL_PATH,
  title: 'Instalar la app',
  description: 'Tenla en la pantalla de inicio y ábrela sin navegador, también sin cobertura.',
};

/**
 * Lo que no se usa entrenando: la cuenta, los dispositivos y la copia. Vive aparte de Hoy para que
 * la pantalla que se abre en el gimnasio empiece por la sesión y no por una lista de enlaces.
 */
export function SettingsScreen() {
  const { session, signOut } = useSession();
  const { situation, platform } = useInstallGuide();
  const entries =
    situation.kind === 'installed' ? ACCOUNT_ENTRIES : [...ACCOUNT_ENTRIES, INSTALL_ENTRY];

  return (
    <>
      <ScreenHeader
        title="Ajustes"
        subtitle={session === null ? undefined : `Entraste como ${session.user.displayName}`}
        backTo={BACK_TO_HOME}
      />
      <div className={styles.stack}>
        {session !== null && (
          <Surface as="section" padding="none" aria-labelledby="settings-profile">
            <h2 id="settings-profile" className={styles.sectionTitle}>
              Tu nombre
            </h2>
            <ProfileNameForm currentName={session.user.displayName} />
          </Surface>
        )}
        <Surface as="section" padding="none" aria-labelledby="settings-rest">
          <h2 id="settings-rest" className={styles.sectionTitle}>
            Descanso
          </h2>
          <RestPushSettings />
          {platform === 'ios' && <IphoneTimerSettings />}
        </Surface>
        <Surface as="section" padding="none" aria-labelledby="settings-account">
          <h2 id="settings-account" className={styles.sectionTitle}>
            Tu cuenta
          </h2>
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.to}>
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
            ))}
          </ul>
        </Surface>
        <Button variant="danger" fullWidth onClick={signOut}>
          Salir
        </Button>
      </div>
    </>
  );
}
