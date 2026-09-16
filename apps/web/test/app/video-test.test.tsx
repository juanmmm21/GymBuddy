import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoConverter } from '../../src/features/exercises/video-conversion';
import { session } from '../fixtures';
import { renderApp } from './render-app';

const VIDEO_TEST_PATH = '/settings/video-test';

/** Un iPhone que lee un 4K vertical en HEVC y lo entrega convertido tras pasar por la mitad. */
const fakeConverter: VideoConverter = {
  probe: () => Promise.resolve({ width: 2160, height: 3840, durationSeconds: 24.5, codec: 'hevc' }),
  convert: (_file, _plan, onProgress) => {
    onProgress(0.5);
    return Promise.resolve(new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'video/mp4' }));
  },
};

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:gymbuddy/video'),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('prueba de vídeo', () => {
  it('se abre desde Ajustes y vuelve a Ajustes', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/settings', session, videoConverter: fakeConverter });

    await user.click(await screen.findByRole('link', { name: /^Prueba de vídeo/ }));
    expect(await screen.findByRole('heading', { name: 'Prueba de vídeo' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Ajustes/ }));
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('convierte el vídeo en el móvil, enseña las medidas y lo deja reproducir sin subir nada', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({ path: VIDEO_TEST_PATH, session, videoConverter: fakeConverter });

    const original = new File([new Uint8Array(80 * 1024 * 1024)], 'IMG_0042.MOV', {
      type: 'video/quicktime',
    });
    await user.upload(await screen.findByLabelText('Elegir vídeo para la prueba'), original);

    const result = await screen.findByRole('region', { name: 'Resultado' });
    const report = within(result);
    expect(report.getByText('2160 × 3840 · hevc')).toBeInTheDocument();
    expect(report.getByText('24,5 s')).toBeInTheDocument();
    expect(report.getByText('80,0 MB')).toBeInTheDocument();
    expect(report.getByText('720 × 1280 · H.264 sin sonido')).toBeInTheDocument();
    expect(report.getByText('3,0 MB')).toBeInTheDocument();
    expect(report.getByLabelText('Vídeo convertido')).toHaveAttribute('src', 'blob:gymbuddy/video');
    expect(screen.getByRole('button', { name: 'Probar con otro vídeo' })).toBeEnabled();

    // Nada sale del móvil: ninguna petición al Worker.
    expect(fake.requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
  });

  it('un vídeo de más de un minuto se rechaza con el motivo', async () => {
    const user = userEvent.setup();
    const longVideo: VideoConverter = {
      ...fakeConverter,
      probe: () =>
        Promise.resolve({ width: 1920, height: 1080, durationSeconds: 95, codec: 'avc' }),
    };
    renderApp({ path: VIDEO_TEST_PATH, session, videoConverter: longVideo });

    await user.upload(
      await screen.findByLabelText('Elegir vídeo para la prueba'),
      new File(['mov'], 'largo.mov', { type: 'video/quicktime' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/pasa del minuto/);
  });

  it('si la conversión se rompe, enseña el detalle técnico', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: VideoConverter = {
      ...fakeConverter,
      convert: () => Promise.reject(new Error('undecodable_source_codec')),
    };
    renderApp({ path: VIDEO_TEST_PATH, session, videoConverter: broken });

    await user.upload(
      await screen.findByLabelText('Elegir vídeo para la prueba'),
      new File(['mov'], 'roto.mov', { type: 'video/quicktime' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/undecodable_source_codec/);
  });

  it('sin WebCodecs lo dice y no ofrece elegir vídeo', async () => {
    renderApp({ path: VIDEO_TEST_PATH, session, videoConverter: null });

    expect(await screen.findByText('Este navegador no puede convertir vídeo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Elegir vídeo' })).not.toBeInTheDocument();
  });
});
