import {
  MAX_DISPLAY_NAME_LENGTH,
  deviceLinkCodeSchema,
  displayNameSchema,
  invitationCodeSchema,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Notice, Surface, TextField, type NoticeTone } from '../components/index';
import { useInstallGuide } from '../features/install/InstallProvider';
import { inAppBrowserTitle, recommendedBrowser } from '../features/install/labels';
import { INSTALL_PATH } from '../features/install/paths';
import { LanguageSelect } from '../features/settings/LanguageSettings';
import { t, useLocale } from '../i18n/index';
import styles from './LoginScreen.module.css';
import {
  usePasskeyEntry,
  type EntryCeremony,
  type EntryFailure,
  type PasskeyEntry,
} from './use-passkey-entry';

/** Holgado para pegar el código con los guiones o los espacios con los que se haya enviado. */
const INVITATION_CODE_INPUT_MAX_LENGTH = 24;

type Mode = 'login' | 'registration' | 'device_link';

interface FailureText {
  readonly tone: NoticeTone;
  readonly title: string;
  readonly body: string;
}

function failureText(reason: EntryFailure): FailureText {
  const texts: Readonly<Record<EntryFailure, FailureText>> = {
    cancelled: {
      tone: 'info',
      title: t('No se ha completado', 'Not completed'),
      body: t(
        'Se canceló o pasó demasiado tiempo. Vuelve a pulsar el botón cuando quieras.',
        'It was cancelled or took too long. Press the button again whenever you like.',
      ),
    },
    unsupported: {
      tone: 'warning',
      title: t('Este navegador no puede usar llaves de acceso', 'This browser cannot use passkeys'),
      body: t(
        'Abre la app en Safari si tienes iPhone, o en Chrome si tienes Android. Si has llegado desde un enlace de un chat, cópialo y pégalo en el navegador del móvil.',
        'Open the app in Safari on an iPhone, or in Chrome on Android. If you came from a link in a chat, copy it and paste it into your phone’s browser.',
      ),
    },
    invitation_invalid: {
      tone: 'danger',
      title: t('El código no sirve', 'That code doesn’t work'),
      body: t(
        'Puede que esté mal escrito, que ya se haya usado o que haya caducado. Pide otro a quien te invitó.',
        'It may be mistyped, already used or expired. Ask whoever invited you for a new one.',
      ),
    },
    device_link_invalid: {
      tone: 'danger',
      title: t('El código no sirve', 'That code doesn’t work'),
      body: t(
        'Dura diez minutos y solo vale una vez. En el móvil donde ya tienes GymBuddy, entra en «Añadir otro dispositivo» y pide uno nuevo.',
        'It lasts ten minutes and works only once. On the phone where you already have GymBuddy, go to “Add another device” and get a new one.',
      ),
    },
    passkey_invalid: {
      tone: 'danger',
      title: t('No se ha podido comprobar tu llave', 'Your passkey couldn’t be verified'),
      body: t(
        'Vuelve a intentarlo. Si en este móvil todavía no tienes acceso, necesitas una invitación.',
        'Try again. If you don’t have access on this phone yet, you need an invitation.',
      ),
    },
    offline: {
      tone: 'danger',
      title: t('Sin conexión', 'No connection'),
      body: t(
        'Hace falta red para entrar. Inténtalo cuando la recuperes.',
        'You need a connection to sign in. Try again once you’re back online.',
      ),
    },
    unexpected: {
      tone: 'danger',
      title: t('No se ha podido entrar', 'Couldn’t sign in'),
      body: t(
        'Algo ha fallado. Inténtalo de nuevo en un momento.',
        'Something went wrong. Try again in a moment.',
      ),
    },
  };
  return texts[reason];
}

/**
 * Al entrar, «cancelado» es también lo que responde el móvil cuando no tiene ninguna llave de
 * GymBuddy: el navegador no distingue los dos casos, así que el texto dice qué hacer en ambos.
 */
function loginCancelledText(): FailureText {
  return {
    tone: 'info',
    title: t('No se ha completado', 'Not completed'),
    body: t(
      'Se canceló o en este móvil no hay ninguna llave de GymBuddy. Si es tu primera vez, pulsa «Tengo una invitación».',
      'It was cancelled, or this phone has no GymBuddy passkey. If it’s your first time, press “I have an invitation”.',
    ),
  };
}

/**
 * Pantalla de entrada. Se entra con la llave de acceso (passkey) guardada en el móvil, y la
 * primera vez se crea con un código de invitación (ADR 0005). Los textos van en pasos y no en
 * conceptos: quien la usa no tiene por qué saber qué es una passkey.
 */
export function LoginScreen() {
  const entry = usePasskeyEntry(useLocale());
  const [mode, setMode] = useState<Mode>('login');
  const { situation } = useInstallGuide();

  const switchTo = (next: Mode): void => {
    entry.reset();
    setMode(next);
  };

  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <h1 className={styles.title}>GymBuddy</h1>
        <p className={styles.tagline}>
          {t('Tu registro de entrenamiento, sin contraseñas.', 'Your training log, no passwords.')}
        </p>
      </div>

      {/* Desde el navegador de un chat tampoco se crea la llave: mejor saberlo antes de pulsar. */}
      {situation.kind === 'in_app_browser' && (
        <Notice
          tone="warning"
          title={inAppBrowserTitle(situation.app)}
          action={
            <Link to={INSTALL_PATH} className={styles.installLink}>
              {t('Cómo abrirla en', 'How to open it in')} {recommendedBrowser(situation.platform)}
            </Link>
          }
        >
          {t(
            'Desde aquí no vas a poder entrar ni crear tu llave de acceso.',
            'From here you won’t be able to sign in or create your passkey.',
          )}
        </Notice>
      )}

      <Surface raised padding="lg" className={styles.card}>
        {mode === 'login' && (
          <SignInPanel
            entry={entry}
            onInvited={() => {
              switchTo('registration');
            }}
            onLinking={() => {
              switchTo('device_link');
            }}
          />
        )}
        {mode === 'registration' && (
          <RegistrationForm
            entry={entry}
            onBack={() => {
              switchTo('login');
            }}
          />
        )}
        {mode === 'device_link' && (
          <DeviceLinkForm
            entry={entry}
            onBack={() => {
              switchTo('login');
            }}
          />
        )}
      </Surface>

      {situation.kind !== 'installed' && situation.kind !== 'in_app_browser' && (
        <Link to={INSTALL_PATH} className={styles.installLink}>
          {t('Cómo instalarla en el móvil', 'How to install it on your phone')}
        </Link>
      )}

      <div className={styles.language}>
        <LanguageSelect />
      </div>
    </main>
  );
}

interface SignInPanelProps {
  readonly entry: PasskeyEntry;
  readonly onInvited: () => void;
  readonly onLinking: () => void;
}

function SignInPanel({ entry, onInvited, onLinking }: SignInPanelProps) {
  const { state } = entry;
  const working = state.phase === 'working';

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.heading}>{t('Entrar', 'Sign in')}</h2>
        <p className={styles.explain}>
          {t(
            'Pulsa «Entrar» y confirma con tu huella, tu cara o el código de tu móvil.',
            'Press “Sign in” and confirm with your fingerprint, your face or your phone’s passcode.',
          )}
        </p>
        {state.phase === 'failed' && (
          <FailureNotice ceremony={state.ceremony} reason={state.reason} />
        )}
        <Button size="lg" fullWidth loading={working} onClick={entry.signIn}>
          {t('Entrar', 'Sign in')}
        </Button>
      </section>

      <section className={styles.section}>
        <p className={styles.explain}>
          {t(
            '¿Es tu primera vez? Necesitas el código de invitación que te ha pasado alguien.',
            'First time? You need the invitation code someone gave you.',
          )}
        </p>
        <Button variant="secondary" fullWidth disabled={working} onClick={onInvited}>
          {t('Tengo una invitación', 'I have an invitation')}
        </Button>
        <p className={styles.explain}>
          {t(
            '¿Ya usas GymBuddy en otro móvil? Pide allí un código y escríbelo aquí.',
            'Already using GymBuddy on another phone? Get a code there and enter it here.',
          )}
        </p>
        <Button variant="secondary" fullWidth disabled={working} onClick={onLinking}>
          {t('Ya la uso en otro móvil', 'I use it on another phone')}
        </Button>
      </section>
    </>
  );
}

interface RegistrationFormProps {
  readonly entry: PasskeyEntry;
  readonly onBack: () => void;
}

/** Va en su propio componente: al volver a «Entrar» se desmonta y el formulario arranca limpio. */
function RegistrationForm({ entry, onBack }: RegistrationFormProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const { state } = entry;
  const working = state.phase === 'working';

  const parsedCode = invitationCodeSchema.safeParse(code);
  const parsedName = displayNameSchema.safeParse(name);
  const codeLooksWrong = code.trim() !== '' && !parsedCode.success;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!parsedCode.success || !parsedName.success || working) return;
    entry.register({ invitationCode: parsedCode.data, displayName: parsedName.data });
  };

  return (
    <form className={styles.section} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>{t('Crear tu acceso', 'Create your access')}</h2>
      <ol className={styles.steps}>
        <li>
          {t(
            'Escribe el código de invitación y cómo quieres que te llame la app.',
            'Enter the invitation code and what you want the app to call you.',
          )}
        </li>
        <li>{t('Pulsa «Crear mi acceso».', 'Press “Create my access”.')}</li>
        <li>
          {t(
            'Confirma con tu huella, tu cara o el código del móvil. Así se guarda tu llave: no hay contraseña que recordar.',
            'Confirm with your fingerprint, your face or your phone’s passcode. That saves your passkey: no password to remember.',
          )}
        </li>
      </ol>

      <TextField
        label={t('Código de invitación', 'Invitation code')}
        value={code}
        onChange={setCode}
        placeholder="ABCD-EFGH-JKMN"
        maxLength={INVITATION_CODE_INPUT_MAX_LENGTH}
        disabled={working}
        hint={
          codeLooksWrong
            ? t(
                'Son doce letras y números, como ABCD-EFGH-JKMN.',
                'It’s twelve letters and numbers, like ABCD-EFGH-JKMN.',
              )
            : t('Te lo ha pasado quien te invitó.', 'The person who invited you gave it to you.')
        }
      />
      <TextField
        label={t('Tu nombre', 'Your name')}
        value={name}
        onChange={setName}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        disabled={working}
        hint={t('Es como te saludará la app.', 'It’s how the app will greet you.')}
      />

      {state.phase === 'failed' && (
        <FailureNotice ceremony={state.ceremony} reason={state.reason} />
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={working}
        disabled={!parsedCode.success || !parsedName.success}
      >
        {t('Crear mi acceso', 'Create my access')}
      </Button>
      <Button variant="ghost" fullWidth disabled={working} onClick={onBack}>
        {t('Ya tengo acceso', 'I already have access')}
      </Button>
    </form>
  );
}

interface DeviceLinkFormProps {
  readonly entry: PasskeyEntry;
  readonly onBack: () => void;
}

/**
 * Sumar este móvil a una cuenta que ya existe. No pide nombre ni invitación: el código dice de
 * quién es la cuenta, y lo que se crea aquí es otra llave de acceso, no otra cuenta.
 */
function DeviceLinkForm({ entry, onBack }: DeviceLinkFormProps) {
  const [code, setCode] = useState('');
  const { state } = entry;
  const working = state.phase === 'working';

  const parsedCode = deviceLinkCodeSchema.safeParse(code);
  const codeLooksWrong = code.trim() !== '' && !parsedCode.success;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!parsedCode.success || working) return;
    entry.linkDevice(parsedCode.data);
  };

  return (
    <form className={styles.section} onSubmit={handleSubmit} noValidate>
      <h2 className={styles.heading}>{t('Usar este móvil también', 'Use this phone too')}</h2>
      <ol className={styles.steps}>
        <li>
          {t(
            'En el móvil donde ya usas GymBuddy, entra en «Añadir otro dispositivo» y pide un código.',
            'On the phone where you already use GymBuddy, go to “Add another device” and get a code.',
          )}
        </li>
        <li>{t('Escríbelo aquí antes de diez minutos.', 'Enter it here within ten minutes.')}</li>
        <li>
          {t(
            'Confirma con tu huella, tu cara o el código de este móvil.',
            'Confirm with your fingerprint, your face or this phone’s passcode.',
          )}
        </li>
      </ol>

      <TextField
        label={t('Código del otro móvil', 'Code from the other phone')}
        value={code}
        onChange={setCode}
        placeholder="ABCD-EFGH"
        maxLength={INVITATION_CODE_INPUT_MAX_LENGTH}
        disabled={working}
        hint={
          codeLooksWrong
            ? t(
                'Son ocho letras y números, como ABCD-EFGH.',
                'It’s eight letters and numbers, like ABCD-EFGH.',
              )
            : t('Lo verás en el móvil que ya usas.', 'You’ll see it on the phone you already use.')
        }
      />

      {state.phase === 'failed' && (
        <FailureNotice ceremony={state.ceremony} reason={state.reason} />
      )}

      <Button type="submit" size="lg" fullWidth loading={working} disabled={!parsedCode.success}>
        {t('Añadir este móvil', 'Add this phone')}
      </Button>
      <Button variant="ghost" fullWidth disabled={working} onClick={onBack}>
        {t('Volver', 'Back')}
      </Button>
    </form>
  );
}

interface FailureNoticeProps {
  readonly ceremony: EntryCeremony;
  readonly reason: EntryFailure;
}

function FailureNotice({ ceremony, reason }: FailureNoticeProps) {
  const text =
    ceremony === 'login' && reason === 'cancelled' ? loginCancelledText() : failureText(reason);

  return (
    <Notice tone={text.tone} title={text.title}>
      {text.body}
    </Notice>
  );
}
