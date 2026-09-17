import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdScreenAwake, type WakeLockProvider } from '../../src/features/exercises/screen-wake';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('holdScreenAwake', () => {
  it('pide la pantalla y la suelta una sola vez aunque se llame dos', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    const provider: WakeLockProvider = { request };

    const releaseScreen = await holdScreenAwake(provider);
    releaseScreen();
    releaseScreen();

    expect(request).toHaveBeenCalledWith('screen');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('sin wakeLock en el navegador no hace nada y no falla', async () => {
    const releaseScreen = await holdScreenAwake(undefined);

    expect(() => {
      releaseScreen();
    }).not.toThrow();
  });

  it('si el navegador lo niega, avisa en la consola y sigue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider: WakeLockProvider = {
      request: () => Promise.reject(new DOMException('Sin permiso', 'NotAllowedError')),
    };

    const releaseScreen = await holdScreenAwake(provider);
    releaseScreen();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
