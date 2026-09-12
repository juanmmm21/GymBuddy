import {
  MAX_DISPLAY_NAME_LENGTH,
  deviceLinkCodeSchema,
  displayNameSchema,
  invitationCodeSchema,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Button, Notice, Surface, TextField, type NoticeTone } from '../components/index';
import { localeFromLanguage } from '../lib/locale';
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

const FAILURE_TEXT: Readonly<Record<EntryFailure, FailureText>> = {
  cancelled: {
    tone: 'info',
    title: 'No se ha completado',
    body: 'Se canceló o pasó demasiado tiempo. Vuelve a pulsar el botón cuando quieras.',
  },
  unsupported: {
    tone: 'warning',
    title: 'Este navegador no puede usar llaves de acceso',
    body: 'Abre la app en Safari si tienes iPhone, o en Chrome si tienes Android. Si has llegado desde un enlace de un chat, cópialo y pégalo en el navegador del móvil.',
  },
  invitation_invalid: {
    tone: 'danger',
    title: 'El código no sirve',
    body: 'Puede que esté mal escrito, que ya se haya usado o que haya caducado. Pide otro a quien te invitó.',
  },
  device_link_invalid: {
    tone: 'danger',
    title: 'El código no sirve',
    body: 'Dura diez minutos y solo vale una vez. En el móvil donde ya tienes GymBuddy, entra en «Añadir otro dispositivo» y pide uno nuevo.',
  },
  passkey_invalid: {
    tone: 'danger',
    title: 'No se ha podido comprobar tu llave',
    body: 'Vuelve a intentarlo. Si en este móvil todavía no tienes acceso, necesitas una invitación.',
  },
  offline: {
    tone: 'danger',
    title: 'Sin conexión',
    body: 'Hace falta red para entrar. Inténtalo cuando la recuperes.',
  },
  unexpected: {
    tone: 'danger',
    title: 'No se ha podido entrar',
    body: 'Algo ha fallado. Inténtalo de nuevo en un momento.',
  },
};

/**
 * Al entrar, «cancelado» es también lo que responde el móvil cuando no tiene ninguna llave de
 * GymBuddy: el navegador no distingue los dos casos, así que el texto dice qué hacer en ambos.
 */
const LOGIN_CANCELLED_TEXT: FailureText = {
  tone: 'info',
  title: 'No se ha completado',
  body: 'Se canceló o en este móvil no hay ninguna llave de GymBuddy. Si es tu primera vez, pulsa «Tengo una invitación».',
};

/**
 * Pantalla de entrada. Se entra con la llave de acceso (passkey) guardada en el móvil, y la
 * primera vez se crea con un código de invitación (ADR 0005). Los textos van en pasos y no en
 * conceptos: quien la usa no tiene por qué saber qué es una passkey.
 */
export function LoginScreen() {
  const entry = usePasskeyEntry(localeFromLanguage(navigator.language));
  const [mode, setMode] = useState<Mode>('login');

  const switchTo = (next: Mode): void => {
    entry.reset();
    setMode(next);
  };

  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <h1 className={styles.title}>GymBuddy</h1>
        <p className={styles.tagline}>Tu registro de entrenamiento, sin contraseñas.</p>
      </div>

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
        <h2 className={styles.heading}>Entrar</h2>
        <p className={styles.explain}>
          Pulsa «Entrar» y confirma con tu huella, tu cara o el código de tu móvil.
        </p>
        {state.phase === 'failed' && (
          <FailureNotice ceremony={state.ceremony} reason={state.reason} />
        )}
        <Button size="lg" fullWidth loading={working} onClick={entry.signIn}>
          Entrar
        </Button>
      </section>

      <section className={styles.section}>
        <p className={styles.explain}>
          ¿Es tu primera vez? Necesitas el código de invitación que te ha pasado alguien.
        </p>
        <Button variant="secondary" fullWidth disabled={working} onClick={onInvited}>
          Tengo una invitación
        </Button>
        <p className={styles.explain}>
          ¿Ya usas GymBuddy en otro móvil? Pide allí un código y escríbelo aquí.
        </p>
        <Button variant="secondary" fullWidth disabled={working} onClick={onLinking}>
          Ya la uso en otro móvil
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
      <h2 className={styles.heading}>Crear tu acceso</h2>
      <ol className={styles.steps}>
        <li>Escribe el código de invitación y cómo quieres que te llame la app.</li>
        <li>Pulsa «Crear mi acceso».</li>
        <li>
          Confirma con tu huella, tu cara o el código del móvil. Así se guarda tu llave: no hay
          contraseña que recordar.
        </li>
      </ol>

      <TextField
        label="Código de invitación"
        value={code}
        onChange={setCode}
        placeholder="ABCD-EFGH-JKMN"
        maxLength={INVITATION_CODE_INPUT_MAX_LENGTH}
        disabled={working}
        hint={
          codeLooksWrong
            ? 'Son doce letras y números, como ABCD-EFGH-JKMN.'
            : 'Te lo ha pasado quien te invitó.'
        }
      />
      <TextField
        label="Tu nombre"
        value={name}
        onChange={setName}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        disabled={working}
        hint="Es como te saludará la app."
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
        Crear mi acceso
      </Button>
      <Button variant="ghost" fullWidth disabled={working} onClick={onBack}>
        Ya tengo acceso
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
      <h2 className={styles.heading}>Usar este móvil también</h2>
      <ol className={styles.steps}>
        <li>
          En el móvil donde ya usas GymBuddy, entra en «Añadir otro dispositivo» y pide un código.
        </li>
        <li>Escríbelo aquí antes de diez minutos.</li>
        <li>Confirma con tu huella, tu cara o el código de este móvil.</li>
      </ol>

      <TextField
        label="Código del otro móvil"
        value={code}
        onChange={setCode}
        placeholder="ABCD-EFGH"
        maxLength={INVITATION_CODE_INPUT_MAX_LENGTH}
        disabled={working}
        hint={
          codeLooksWrong
            ? 'Son ocho letras y números, como ABCD-EFGH.'
            : 'Lo verás en el móvil que ya usas.'
        }
      />

      {state.phase === 'failed' && (
        <FailureNotice ceremony={state.ceremony} reason={state.reason} />
      )}

      <Button type="submit" size="lg" fullWidth loading={working} disabled={!parsedCode.success}>
        Añadir este móvil
      </Button>
      <Button variant="ghost" fullWidth disabled={working} onClick={onBack}>
        Volver
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
    ceremony === 'login' && reason === 'cancelled' ? LOGIN_CANCELLED_TEXT : FAILURE_TEXT[reason];

  return (
    <Notice tone={text.tone} title={text.title}>
      {text.body}
    </Notice>
  );
}
