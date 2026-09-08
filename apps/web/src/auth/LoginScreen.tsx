import { Button, Notice, Spinner, Surface } from '../components/index';
import styles from './LoginScreen.module.css';
import { useTelegramLogin, type LoginFailure } from './use-telegram-login';

const FAILURE_TEXT: Readonly<Record<LoginFailure, { title: string; body: string }>> = {
  expired: {
    title: 'El enlace ha caducado',
    body: 'Han pasado más de diez minutos sin pulsar Start. Pide uno nuevo.',
  },
  invalid: {
    title: 'El enlace ya no sirve',
    body: 'Se usó ya o se canjeó desde otro sitio. Pide uno nuevo.',
  },
  offline: {
    title: 'Sin conexión',
    body: 'Hace falta red para entrar. Inténtalo cuando la recuperes.',
  },
  unexpected: {
    title: 'No se pudo entrar',
    body: 'Algo ha fallado en el servidor. Inténtalo de nuevo en un momento.',
  },
};

/**
 * Pantalla de entrada. La identidad es Telegram (ADR 0003): se pide un enlace de un solo
 * uso, el usuario lo abre, pulsa Start y la app recoge la sesión sin que teclee nada.
 */
export function LoginScreen() {
  const { state, start } = useTelegramLogin();

  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <h1 className={styles.title}>GymBuddy</h1>
        <p className={styles.tagline}>Tu registro de entrenamiento, sin cuentas ni contraseñas.</p>
      </div>

      <Surface raised padding="lg" className={styles.card}>
        {state.phase === 'idle' && (
          <>
            <p className={styles.explain}>
              Entras con tu cuenta de Telegram: abre el bot, pulsa <strong>Start</strong> y listo.
            </p>
            <Button size="lg" fullWidth onClick={start}>
              Entrar con Telegram
            </Button>
          </>
        )}

        {state.phase === 'requesting' && (
          <div className={styles.waiting}>
            <Spinner label="Preparando el enlace" />
            <p className={styles.explain}>Preparando el enlace…</p>
          </div>
        )}

        {state.phase === 'waiting' && (
          <div className={styles.waiting}>
            <a
              className={styles.telegramLink}
              href={state.telegramLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir Telegram
            </a>
            <p className={styles.explain}>
              Pulsa <strong>Start</strong> en el chat del bot y vuelve aquí: la sesión se abre sola.
            </p>
            <div className={styles.pending}>
              <Spinner size="sm" label="Esperando a que pulses Start" />
              <span>Esperando…</span>
            </div>
          </div>
        )}

        {state.phase === 'failed' && (
          <Notice
            tone="danger"
            title={FAILURE_TEXT[state.reason].title}
            action={
              <Button variant="secondary" onClick={start}>
                Pedir otro enlace
              </Button>
            }
          >
            {FAILURE_TEXT[state.reason].body}
          </Notice>
        )}
      </Surface>
    </main>
  );
}
