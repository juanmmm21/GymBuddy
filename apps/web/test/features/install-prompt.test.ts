import { describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../../src/features/install/install-prompt';
import { beforeInstallPromptEvent } from '../install-fixtures';

describe('captureInstallPrompt', () => {
  it('sin ofrecimiento del navegador no hay diálogo que abrir', async () => {
    const install = captureInstallPrompt(new EventTarget());

    expect(install.getState()).toBe('unavailable');
    await expect(install.prompt()).resolves.toBe('unavailable');
  });

  it('guarda el ofrecimiento, impide la barra propia de Chrome y avisa a quien escucha', () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    const listener = vi.fn();
    install.subscribe(listener);

    const event = beforeInstallPromptEvent('accepted');
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(install.getState()).toBe('available');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('aceptar deja la app instalada', async () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    const event = beforeInstallPromptEvent('accepted');
    target.dispatchEvent(event);

    await expect(install.prompt()).resolves.toBe('accepted');
    expect((event as Event & { prompt: () => unknown }).prompt).toHaveBeenCalledTimes(1);
    expect(install.getState()).toBe('installed');
  });

  it('el diálogo solo se abre una vez: rechazado, ya no está disponible', async () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    target.dispatchEvent(beforeInstallPromptEvent('dismissed'));

    const first = install.prompt();
    // Dos toques seguidos: el segundo no puede volver a abrirlo.
    await expect(install.prompt()).resolves.toBe('unavailable');
    await expect(first).resolves.toBe('dismissed');
    expect(install.getState()).toBe('unavailable');
  });

  it('un fallo al abrirlo se da como no disponible, sin romper la pantalla', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    target.dispatchEvent(
      beforeInstallPromptEvent('accepted', () => Promise.reject(new Error('sin gesto'))),
    );

    await expect(install.prompt()).resolves.toBe('unavailable');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('appinstalled marca la app como instalada aunque se instale desde el menú', () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    target.dispatchEvent(beforeInstallPromptEvent('accepted'));

    target.dispatchEvent(new Event('appinstalled'));

    expect(install.getState()).toBe('installed');
  });

  it('un evento sin prompt() se ignora', () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);

    target.dispatchEvent(new Event('beforeinstallprompt'));

    expect(install.getState()).toBe('unavailable');
  });

  it('quien deja de escuchar ya no recibe avisos', () => {
    const target = new EventTarget();
    const install = captureInstallPrompt(target);
    const listener = vi.fn();
    const unsubscribe = install.subscribe(listener);

    unsubscribe();
    target.dispatchEvent(beforeInstallPromptEvent('accepted'));

    expect(listener).not.toHaveBeenCalled();
  });
});
