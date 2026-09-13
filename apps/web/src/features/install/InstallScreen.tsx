import { useState } from 'react';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { Button, Notice, Surface } from '../../components/index';
import { copyToClipboard } from '../../lib/clipboard';
import type { InstallPromptOutcome } from './install-prompt';
import { useInstallGuide, type InstallGuide } from './InstallProvider';
import { inAppBrowserTitle, RECOMMENDED_BROWSER } from './labels';
import type { DevicePlatform, InAppBrowserApp } from './platform';
import styles from './InstallScreen.module.css';

const BACK_TO_HOME: BackLink = { to: '/', label: 'Hoy' };
const BACK_TO_LOGIN: BackLink = { to: '/login', label: 'Entrar' };

/**
 * Cómo tener GymBuddy en la pantalla de inicio (ADR 0002: se queda en la web). No exige sesión:
 * quien la necesita de verdad es el amigo que acaba de recibir una invitación por un chat. Los
 * textos son pasos con los nombres de los botones que va a ver, no conceptos.
 */
export function InstallScreen() {
  const { session } = useSession();
  const guide = useInstallGuide();

  return (
    <main className={styles.screen}>
      <ScreenHeader
        title="Instalar GymBuddy"
        subtitle="En la pantalla de inicio, como una app más"
        backTo={session === null ? BACK_TO_LOGIN : BACK_TO_HOME}
      />
      <div className={styles.stack}>
        <GuideBody guide={guide} />
      </div>
    </main>
  );
}

function GuideBody({ guide }: { readonly guide: InstallGuide }) {
  const { situation, promptState } = guide;

  if (situation.kind === 'installed') {
    return (
      <Notice tone="success" title="Ya la tienes instalada">
        La estás usando desde la pantalla de inicio. No hace falta nada más.
      </Notice>
    );
  }
  if (promptState === 'installed') {
    return (
      <Notice tone="success" title="GymBuddy ya está instalada">
        Búscala en tu pantalla de inicio y ábrela desde allí a partir de ahora.
      </Notice>
    );
  }

  switch (situation.kind) {
    case 'in_app_browser':
      return (
        <InAppBrowserGuide
          platform={situation.platform}
          app={situation.app}
          appUrl={guide.appUrl}
        />
      );
    case 'ios_safari':
      return <IosSteps />;
    case 'ios_other_browser':
      return (
        <>
          <Notice tone="warning" title="Instálala desde Safari">
            En iPhone, donde se instala seguro es en Safari. Copia la dirección, ábrela en Safari y
            sigue estos pasos.
          </Notice>
          <CopyAddress appUrl={guide.appUrl} />
          <IosSteps />
        </>
      );
    case 'android':
      return <AndroidGuide guide={guide} />;
    case 'desktop':
      return <DesktopGuide guide={guide} />;
  }
}

interface InAppBrowserGuideProps {
  readonly platform: DevicePlatform;
  readonly app: InAppBrowserApp | null;
  readonly appUrl: string;
}

/**
 * Lo primero: desde el navegador de un chat ni se instala ni se crea la llave de acceso, así
 * que antes de cualquier paso hay que salir a Safari o a Chrome.
 */
function InAppBrowserGuide({ platform, app, appUrl }: InAppBrowserGuideProps) {
  const browser = RECOMMENDED_BROWSER[platform];

  return (
    <>
      <Notice tone="warning" title={inAppBrowserTitle(app)}>
        Desde aquí no se puede instalar GymBuddy ni crear tu llave de acceso. Ábrela en {browser}.
      </Notice>
      {platform !== 'desktop' && (
        <Surface as="section" className={styles.section}>
          <h2 className={styles.heading}>Abrirla en {browser}</h2>
          <ol className={styles.steps}>
            {platform === 'ios' ? (
              <li>
                Pulsa «···» o el botón de compartir <ShareIcon /> de esta pantalla.
              </li>
            ) : (
              <li>Pulsa el menú «⋮», arriba a la derecha.</li>
            )}
            <li>Elige «Abrir en {browser}» o «Abrir en el navegador».</li>
            <li>Ya en {browser}, vuelve a entrar aquí y sigue los pasos para instalarla.</li>
          </ol>
        </Surface>
      )}
      <p className={styles.explain}>
        ¿No encuentras la opción? Copia la dirección y pégala en {browser}.
      </p>
      <CopyAddress appUrl={appUrl} />
    </>
  );
}

/** En iOS no hay API para instalar: solo se puede enseñar dónde está cada botón. */
function IosSteps() {
  return (
    <>
      <Surface as="section" className={styles.section}>
        <h2 className={styles.heading}>En Safari</h2>
        <ol className={styles.steps}>
          <li>
            Pulsa el botón Compartir <ShareIcon />, un cuadrado con una flecha hacia arriba. Si no
            lo ves, pulsa antes «···», junto a la dirección.
          </li>
          <li>Baja y pulsa «Añadir a pantalla de inicio».</li>
          <li>Pulsa «Añadir», arriba a la derecha.</li>
          <li>Abre GymBuddy desde su icono nuevo.</li>
        </ol>
      </Surface>
      {/* La app instalada en iOS no comparte lo guardado con Safari: la sesión no pasa sola. */}
      <Notice title="La primera vez te pedirá entrar">
        Pulsa «Entrar» y confirma con tu huella o tu cara: es la misma cuenta y la misma llave.
      </Notice>
      <Notice title="¿No aparece «Añadir a pantalla de inicio»?">
        Puede que la hayas abierto desde otra app, como WhatsApp o Telegram. Busca «Abrir en Safari»
        y repite los pasos desde allí.
      </Notice>
    </>
  );
}

function AndroidGuide({ guide }: { readonly guide: InstallGuide }) {
  const [outcome, setOutcome] = useState<InstallPromptOutcome | null>(null);

  if (guide.promptState === 'available') {
    return (
      <InstallButton
        guide={guide}
        label="Instalar GymBuddy"
        explain="Pulsa el botón y confirma con «Instalar». Quedará en tu pantalla de inicio."
        onOutcome={setOutcome}
      />
    );
  }

  return (
    <>
      {outcome === 'dismissed' && (
        <Notice title="No se ha instalado">
          Si cambias de idea, también puedes instalarla desde el menú del navegador.
        </Notice>
      )}
      <Surface as="section" className={styles.section}>
        <h2 className={styles.heading}>En Chrome</h2>
        <ol className={styles.steps}>
          <li>Pulsa el menú «⋮», arriba a la derecha.</li>
          <li>Pulsa «Instalar aplicación» o «Añadir a pantalla de inicio».</li>
          <li>Confirma con «Instalar» y abre GymBuddy desde su icono.</li>
        </ol>
      </Surface>
      <p className={styles.explain}>
        ¿Usas otro navegador y no aparece la opción? Copia la dirección y ábrela en Chrome.
      </p>
      <CopyAddress appUrl={guide.appUrl} />
    </>
  );
}

function DesktopGuide({ guide }: { readonly guide: InstallGuide }) {
  const [outcome, setOutcome] = useState<InstallPromptOutcome | null>(null);

  return (
    <>
      <Notice title="GymBuddy está pensada para el móvil">
        Abre esta dirección en el navegador de tu móvil y sigue allí los pasos para instalarla.
      </Notice>
      <CopyAddress appUrl={guide.appUrl} />
      {guide.promptState === 'available' && (
        <InstallButton
          guide={guide}
          label="Instalar en este ordenador"
          explain="También puedes tenerla aquí, en su propia ventana."
          variant="secondary"
          onOutcome={setOutcome}
        />
      )}
      {outcome === 'dismissed' && (
        <Notice title="No se ha instalado">Puedes seguir usándola en el navegador.</Notice>
      )}
    </>
  );
}

interface InstallButtonProps {
  readonly guide: InstallGuide;
  readonly label: string;
  readonly explain: string;
  readonly variant?: 'primary' | 'secondary';
  readonly onOutcome: (outcome: InstallPromptOutcome) => void;
}

/** El diálogo del navegador. `openPrompt` no rechaza nunca: un fallo llega como `unavailable`. */
function InstallButton({
  guide,
  label,
  explain,
  variant = 'primary',
  onOutcome,
}: InstallButtonProps) {
  const [opening, setOpening] = useState(false);

  const install = (): void => {
    setOpening(true);
    void guide.openPrompt().then((result) => {
      setOpening(false);
      onOutcome(result);
    });
  };

  return (
    <Surface as="section" className={styles.section}>
      <p className={styles.explain}>{explain}</p>
      <Button size="lg" fullWidth variant={variant} loading={opening} onClick={install}>
        {label}
      </Button>
    </Surface>
  );
}

/** La dirección siempre se ve escrita: si el portapapeles no deja, se copia a mano. */
function CopyAddress({ appUrl }: { readonly appUrl: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);

  const copy = (): void => {
    void copyToClipboard(appUrl).then(setCopied);
  };

  return (
    <div className={styles.section}>
      <p className={styles.address}>{appUrl}</p>
      <Button variant="secondary" fullWidth onClick={copy}>
        {copied === true ? 'Dirección copiada' : 'Copiar la dirección'}
      </Button>
      {copied === false && (
        <Notice tone="warning" title="No se ha podido copiar">
          Cópiala a mano de la pantalla: este navegador no deja copiar desde aquí.
        </Notice>
      )}
    </div>
  );
}

/** El icono de Compartir de iOS, para reconocerlo en la barra de Safari. */
function ShareIcon() {
  return (
    <svg
      className={styles.inlineIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5v10h14V11h-1" />
    </svg>
  );
}
