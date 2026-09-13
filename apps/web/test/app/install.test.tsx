import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../../src/features/install/install-prompt';
import { jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import {
  APP_URL,
  beforeInstallPromptEvent,
  installSupport,
  USER_AGENTS,
} from '../install-fixtures';
import { renderApp } from './render-app';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

/** Chrome de Android que ya ha ofrecido instalar, con la respuesta que dará la persona. */
function androidWithPrompt(outcome: 'accepted' | 'dismissed') {
  const target = new EventTarget();
  const prompt = captureInstallPrompt(target);
  const event = beforeInstallPromptEvent(outcome);
  target.dispatchEvent(event);
  return {
    event: event as Event & { readonly prompt: () => unknown },
    install: installSupport(USER_AGENTS.androidChrome, { prompt }),
  };
}

describe('instalación guiada', () => {
  it('en Android con el ofrecimiento de Chrome, dos toques y queda instalada', async () => {
    const user = userEvent.setup();
    const { event, install } = androidWithPrompt('accepted');

    renderApp({ path: '/install', install });

    await user.click(await screen.findByRole('button', { name: 'Instalar GymBuddy' }));

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('GymBuddy ya está instalada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar GymBuddy' })).not.toBeInTheDocument();
  });

  it('en Android, si dice que no, quedan los pasos del menú', async () => {
    const user = userEvent.setup();
    const { install } = androidWithPrompt('dismissed');

    renderApp({ path: '/install', install });

    await user.click(await screen.findByRole('button', { name: 'Instalar GymBuddy' }));

    expect(await screen.findByText('No se ha instalado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En Chrome' })).toBeInTheDocument();
    expect(screen.getByText(/«Instalar aplicación» o «Añadir a pantalla de inicio»/)).toBeVisible();
  });

  it('en Android sin ofrecimiento enseña los pasos del menú directamente', async () => {
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.androidChrome) });

    expect(await screen.findByRole('heading', { name: 'En Chrome' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar GymBuddy' })).not.toBeInTheDocument();
  });

  it('en iPhone con Safari enseña Compartir → Añadir a pantalla de inicio', async () => {
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.iphoneSafari) });

    expect(await screen.findByRole('heading', { name: 'En Safari' })).toBeInTheDocument();
    expect(screen.getByText(/Pulsa el botón Compartir/)).toBeInTheDocument();
    expect(screen.getByText('Baja y pulsa «Añadir a pantalla de inicio».')).toBeInTheDocument();
    // La app instalada en iOS no hereda la sesión de Safari: mejor avisar que sorprender.
    expect(screen.getByText('La primera vez te pedirá entrar')).toBeInTheDocument();
  });

  it('en Chrome de iPhone manda a Safari con la dirección para copiar', async () => {
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.iphoneChrome) });

    expect(await screen.findByText('Instálala desde Safari')).toBeInTheDocument();
    expect(screen.getByText(APP_URL)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En Safari' })).toBeInTheDocument();
  });

  it('en un ordenador pide abrirla en el móvil', async () => {
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.desktopChrome) });

    expect(await screen.findByText('GymBuddy está pensada para el móvil')).toBeInTheDocument();
    expect(screen.getByText(APP_URL)).toBeInTheDocument();
  });

  it('abierta ya desde la pantalla de inicio, no hay nada que instalar', async () => {
    renderApp({
      path: '/install',
      install: installSupport(USER_AGENTS.iphoneSafari, { standalone: true }),
    });

    expect(await screen.findByText('Ya la tienes instalada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'En Safari' })).not.toBeInTheDocument();
  });
});

describe('navegador interno de una app', () => {
  it('la entrada avisa antes de pulsar y lleva a cómo abrirla en Safari', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderApp({ path: '/login', install: installSupport(USER_AGENTS.instagramIos) });

    expect(await screen.findByText('Estás dentro de Instagram')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cómo abrirla en Safari' }));

    expect(await screen.findByRole('heading', { name: 'Abrirla en Safari' })).toBeInTheDocument();
    expect(screen.getByText('Elige «Abrir en Safari» o «Abrir en el navegador».')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Copiar la dirección' }));

    expect(writeText).toHaveBeenCalledWith(APP_URL);
    expect(await screen.findByRole('button', { name: 'Dirección copiada' })).toBeInTheDocument();
  });

  it('en Android sin nombre de app manda a Chrome', async () => {
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.androidWebView) });

    expect(await screen.findByText('Estás dentro de otra app')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Abrirla en Chrome' })).toBeInTheDocument();
  });

  it('si el portapapeles no deja, la dirección sigue escrita para copiarla a mano', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Después de `userEvent.setup()`, que instala un portapapeles propio que sí copia.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('Denegado', 'NotAllowedError')) },
      configurable: true,
    });
    renderApp({ path: '/install', install: installSupport(USER_AGENTS.facebookAndroid) });

    await user.click(await screen.findByRole('button', { name: 'Copiar la dirección' }));

    expect(await screen.findByText('No se ha podido copiar')).toBeInTheDocument();
    expect(screen.getByText(APP_URL)).toBeInTheDocument();
    warn.mockRestore();
  });
});

describe('dónde se llega a la guía', () => {
  it('sin sesión, desde la entrada, y vuelve a «Entrar»', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/login', install: installSupport(USER_AGENTS.iphoneSafari) });

    expect(screen.queryByText(/Estás dentro de/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: 'Cómo instalarla en el móvil' }));
    await user.click(await screen.findByRole('link', { name: /Entrar/ }));

    expect(await screen.findByRole('heading', { name: 'GymBuddy' })).toBeInTheDocument();
  });

  it('con sesión, desde Hoy, y vuelve a Hoy', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/',
      session,
      install: installSupport(USER_AGENTS.androidChrome),
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('link', { name: 'Instalar la app' }));
    expect(await screen.findByRole('heading', { name: 'Instalar GymBuddy' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Hoy/ }));
    expect(await screen.findByRole('link', { name: 'Instalar la app' })).toBeInTheDocument();
  });

  it('ya instalada, ni Hoy ni la entrada ofrecen instalarla', async () => {
    const installed = installSupport(USER_AGENTS.androidChrome, { standalone: true });
    renderApp({
      path: '/',
      session,
      install: installed,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('link', { name: 'Invitar a un amigo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('ya instalada, la entrada tampoco la ofrece', async () => {
    renderApp({
      path: '/login',
      install: installSupport(USER_AGENTS.iphoneSafari, { standalone: true }),
    });

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Cómo instalarla en el móvil' }),
    ).not.toBeInTheDocument();
  });
});
