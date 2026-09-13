import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from '../../src/lib/save-file';

/** jsdom no implementa las URL de blob: cada test decide si el navegador las tiene. */
function withBlobUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(() => 'blob:http://localhost/copia');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });

  return { create, revoke };
}

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveTextFile', () => {
  it('descarga el texto con su nombre y no deja el enlace en la página', () => {
    vi.useFakeTimers();
    const { create, revoke } = withBlobUrls();
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    const saved = saveTextFile('gymbuddy-2026-09-13.json', '{}', 'application/json');

    expect(saved).toBe(true);
    expect(clicked).toEqual([
      { download: 'gymbuddy-2026-09-13.json', href: 'blob:http://localhost/copia' },
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();

    // La URL no se revoca en el mismo instante: Safari aún no ha leído el fichero.
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/copia');
  });

  it('dice que no se pudo cuando el navegador no tiene URL de blob', () => {
    expect(saveTextFile('copia.json', '{}', 'application/json')).toBe(false);
  });

  it('dice que no se pudo cuando el navegador rechaza la descarga', () => {
    withBlobUrls();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Descargas bloqueadas');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(saveTextFile('copia.json', '{}', 'application/json')).toBe(false);
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
