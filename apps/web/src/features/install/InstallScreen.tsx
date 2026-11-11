import { useState } from 'react';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { useSession } from '../../auth/SessionProvider';
import { Button, Notice, Surface } from '../../components/index';
import { copyToClipboard } from '../../lib/clipboard';
import type { InstallPromptOutcome } from './install-prompt';
import { useInstallGuide, type InstallGuide } from './InstallProvider';
import { inAppBrowserTitle, recommendedBrowser } from './labels';
import type { DevicePlatform, InAppBrowserApp } from './platform';
import styles from './InstallScreen.module.css';
import { t } from '../../i18n/index';

function backTo(signedIn: boolean): BackLink {
  return signedIn
    ? { to: '/', label: t('Hoy', 'Today') }
    : { to: '/login', label: t('Entrar', 'Sign in') };
}

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
        title={t('Instalar GymBuddy', 'Install GymBuddy')}
        subtitle={t(
          'En la pantalla de inicio, como una app más',
          'On your home screen, like any other app',
        )}
        backTo={backTo(session !== null)}
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
      <Notice tone="success" title={t('Ya la tienes instalada', 'It’s already installed')}>
        {t(
          'La estás usando desde la pantalla de inicio. No hace falta nada más.',
          'You’re using it from your home screen. Nothing else to do.',
        )}
      </Notice>
    );
  }
  if (promptState === 'installed') {
    return (
      <Notice tone="success" title={t('GymBuddy ya está instalada', 'GymBuddy is installed')}>
        {t(
          'Búscala en tu pantalla de inicio y ábrela desde allí a partir de ahora.',
          'Find it on your home screen and open it from there from now on.',
        )}
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
          <Notice tone="warning" title={t('Instálala desde Safari', 'Install it from Safari')}>
            {t(
              'En iPhone, donde se instala seguro es en Safari. Copia la dirección, ábrela en Safari y sigue estos pasos.',
              'On iPhone, Safari is the reliable place to install it. Copy the address, open it in Safari and follow these steps.',
            )}
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
  const browser = recommendedBrowser(platform);

  return (
    <>
      <Notice tone="warning" title={inAppBrowserTitle(app)}>
        {t(
          `Desde aquí no se puede instalar GymBuddy ni crear tu llave de acceso. Ábrela en ${browser}.`,
          `GymBuddy can’t be installed from here, nor can your passkey be created. Open it in ${browser}.`,
        )}
      </Notice>
      {platform !== 'desktop' && (
        <Surface as="section" className={styles.section}>
          <h2 className={styles.heading}>{t(`Abrirla en ${browser}`, `Open it in ${browser}`)}</h2>
          <ol className={styles.steps}>
            {platform === 'ios' ? (
              <li>
                {t('Pulsa «···» o el botón de compartir', 'Tap “···” or the share button')}{' '}
                <ShareIcon /> {t('de esta pantalla.', 'on this screen.')}
              </li>
            ) : (
              <li>
                {t('Pulsa el menú «⋮», arriba a la derecha.', 'Tap the “⋮” menu, top right.')}
              </li>
            )}
            <li>
              {t(
                `Elige «Abrir en ${browser}» o «Abrir en el navegador».`,
                `Choose “Open in ${browser}” or “Open in browser”.`,
              )}
            </li>
            <li>
              {t(
                `Ya en ${browser}, vuelve a entrar aquí y sigue los pasos para instalarla.`,
                `Once in ${browser}, come back here and follow the steps to install it.`,
              )}
            </li>
          </ol>
        </Surface>
      )}
      <p className={styles.explain}>
        {t(
          `¿No encuentras la opción? Copia la dirección y pégala en ${browser}.`,
          `Can’t find the option? Copy the address and paste it into ${browser}.`,
        )}
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
        <h2 className={styles.heading}>{t('En Safari', 'In Safari')}</h2>
        <ol className={styles.steps}>
          <li>
            {t('Pulsa el botón Compartir', 'Tap the Share button')} <ShareIcon />
            {t(
              ', un cuadrado con una flecha hacia arriba. Si no lo ves, pulsa antes «···», junto a la dirección.',
              ', a square with an arrow pointing up. If you can’t see it, first tap “···” next to the address.',
            )}
          </li>
          <li>
            {t(
              'Baja y pulsa «Añadir a pantalla de inicio».',
              'Scroll down and tap “Add to Home Screen”.',
            )}
          </li>
          <li>{t('Pulsa «Añadir», arriba a la derecha.', 'Tap “Add”, top right.')}</li>
          <li>{t('Abre GymBuddy desde su icono nuevo.', 'Open GymBuddy from its new icon.')}</li>
        </ol>
      </Surface>
      {/* La app instalada en iOS no comparte lo guardado con Safari: la sesión no pasa sola. */}
      <Notice
        title={t('La primera vez te pedirá entrar', 'The first time it will ask you to sign in')}
      >
        {t(
          'Pulsa «Entrar» y confirma con tu huella o tu cara: es la misma cuenta y la misma llave.',
          'Tap “Sign in” and confirm with your fingerprint or face: same account, same passkey.',
        )}
      </Notice>
      <Notice
        title={t('¿No aparece «Añadir a pantalla de inicio»?', 'No “Add to Home Screen” option?')}
      >
        {t(
          'Puede que la hayas abierto desde otra app, como WhatsApp o Telegram. Busca «Abrir en Safari» y repite los pasos desde allí.',
          'You may have opened it from another app, like WhatsApp or Telegram. Look for “Open in Safari” and repeat the steps from there.',
        )}
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
        label={t('Instalar GymBuddy', 'Install GymBuddy')}
        explain={t(
          'Pulsa el botón y confirma con «Instalar». Quedará en tu pantalla de inicio.',
          'Tap the button and confirm with “Install”. It will be on your home screen.',
        )}
        onOutcome={setOutcome}
      />
    );
  }

  return (
    <>
      {outcome === 'dismissed' && (
        <Notice title={t('No se ha instalado', 'Not installed')}>
          {t(
            'Si cambias de idea, también puedes instalarla desde el menú del navegador.',
            'If you change your mind, you can also install it from the browser menu.',
          )}
        </Notice>
      )}
      <Surface as="section" className={styles.section}>
        <h2 className={styles.heading}>{t('En Chrome', 'In Chrome')}</h2>
        <ol className={styles.steps}>
          <li>{t('Pulsa el menú «⋮», arriba a la derecha.', 'Tap the “⋮” menu, top right.')}</li>
          <li>
            {t(
              'Pulsa «Instalar aplicación» o «Añadir a pantalla de inicio».',
              'Tap “Install app” or “Add to Home screen”.',
            )}
          </li>
          <li>
            {t(
              'Confirma con «Instalar» y abre GymBuddy desde su icono.',
              'Confirm with “Install” and open GymBuddy from its icon.',
            )}
          </li>
        </ol>
      </Surface>
      <p className={styles.explain}>
        {t(
          '¿Usas otro navegador y no aparece la opción? Copia la dirección y ábrela en Chrome.',
          'Using another browser and the option isn’t there? Copy the address and open it in Chrome.',
        )}
      </p>
      <CopyAddress appUrl={guide.appUrl} />
    </>
  );
}

function DesktopGuide({ guide }: { readonly guide: InstallGuide }) {
  const [outcome, setOutcome] = useState<InstallPromptOutcome | null>(null);

  return (
    <>
      <Notice title={t('GymBuddy está pensada para el móvil', 'GymBuddy is made for your phone')}>
        {t(
          'Abre esta dirección en el navegador de tu móvil y sigue allí los pasos para instalarla.',
          'Open this address in your phone’s browser and follow the steps there to install it.',
        )}
      </Notice>
      <CopyAddress appUrl={guide.appUrl} />
      {guide.promptState === 'available' && (
        <InstallButton
          guide={guide}
          label={t('Instalar en este ordenador', 'Install on this computer')}
          explain={t(
            'También puedes tenerla aquí, en su propia ventana.',
            'You can also have it here, in its own window.',
          )}
          variant="secondary"
          onOutcome={setOutcome}
        />
      )}
      {outcome === 'dismissed' && (
        <Notice title={t('No se ha instalado', 'Not installed')}>
          {t('Puedes seguir usándola en el navegador.', 'You can keep using it in the browser.')}
        </Notice>
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
        {copied === true
          ? t('Dirección copiada', 'Address copied')
          : t('Copiar la dirección', 'Copy the address')}
      </Button>
      {copied === false && (
        <Notice tone="warning" title={t('No se ha podido copiar', 'Couldn’t copy')}>
          {t(
            'Cópiala a mano de la pantalla: este navegador no deja copiar desde aquí.',
            'Copy it by hand from the screen: this browser doesn’t allow copying from here.',
          )}
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
