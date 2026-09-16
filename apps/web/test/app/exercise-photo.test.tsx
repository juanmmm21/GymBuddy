import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ExerciseHistory,
  ExerciseMedia,
  ExerciseStats,
  TrackedExercise,
} from '@gymbuddy/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoCodec } from '../../src/features/exercises/photo-compression';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { benchPress, benchPressHistory, benchPressStats, customCurl, session } from '../fixtures';
import { renderApp } from './render-app';

const CUSTOM_PATH = `/exercises/${customCurl.id}`;

const photoMedia: ExerciseMedia = {
  id: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  kind: 'photo',
  contentType: 'image/jpeg',
  bytes: 412_000,
  uploadedAt: '2026-09-16T20:00:00.000Z',
};

/** Un codificador que siempre entrega el mismo JPEG pequeño: jsdom no tiene canvas. */
const fakeCodec: PhotoCodec = {
  decode: () => Promise.resolve({ width: 4032, height: 3024, close: () => undefined }),
  encodeJpeg: () => Promise.resolve(new Blob(['jpeg-reducido'], { type: 'image/jpeg' })),
};

/** La ficha de un ejercicio propio que cambia según lo que se suba o se quite. */
function serveCustomExercise(
  fake: FakeFetch,
  initial: TrackedExercise,
): { current: TrackedExercise } {
  const state = { current: initial };
  const stats: ExerciseStats = {
    trackedExerciseId: initial.id,
    workingWeight: null,
    records: [],
    points: [],
    stalled: null,
  };
  const history: ExerciseHistory = { trackedExerciseId: initial.id, sessions: [] };

  fake.on('GET', '/exercises', () => jsonResponse([state.current]));
  fake.on('GET', `/stats/exercise/${initial.id}`, () => jsonResponse(stats));
  fake.on('GET', `/history/exercises/${initial.id}`, () => jsonResponse(history));
  fake.on('GET', `/exercises/${initial.id}/media/${photoMedia.id}`, () => {
    return new Response(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });

  return state;
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:gymbuddy/foto'),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('foto de la técnica en la ficha', () => {
  it('prepara la foto elegida en el móvil, la sube como JPEG y la enseña', async () => {
    const user = userEvent.setup();
    let state: { current: TrackedExercise } = { current: customCurl };
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      setup: (fake) => {
        state = serveCustomExercise(fake, customCurl);
        fake.on('PUT', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: photoMedia };
          return jsonResponse(state.current);
        });
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto de la técnica' });
    expect(within(section).getByText(/Pon una foto de cómo se hace/)).toBeInTheDocument();

    const original = new File(['foto-del-iphone'], 'IMG_0001.HEIC', { type: 'image/heic' });
    await user.upload(within(section).getByLabelText('Elegir foto de la técnica'), original);

    const photo = await screen.findByRole('img', {
      name: `Foto de la técnica de ${customCurl.name}`,
    });
    expect(photo).toHaveAttribute('src', 'blob:gymbuddy/foto');

    const put = fake.requests.find((request) => request.method === 'PUT');
    expect(put?.headers.get('Content-Type')).toBe('image/jpeg');
    expect(fake.requests.some((request) => request.path.includes(`/media/${photoMedia.id}`))).toBe(
      true,
    );
    expect(within(section).getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument();
  });

  it('quitarla pide confirmación y hace el DELETE', async () => {
    const user = userEvent.setup();
    let state: { current: TrackedExercise } = { current: customCurl };
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      setup: (fake) => {
        state = serveCustomExercise(fake, { ...customCurl, media: photoMedia });
        fake.on('DELETE', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: null };
          return jsonResponse(state.current);
        });
      },
    });

    await screen.findByRole('img', { name: `Foto de la técnica de ${customCurl.name}` });
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Sí, quitarla' }));

    expect(await screen.findByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
    expect(fake.requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: /Foto de la técnica/ })).not.toBeInTheDocument();
  });

  it('dice que se llegó al tope gratuito si el Worker se niega', async () => {
    const user = userEvent.setup();
    renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      setup: (fake) => {
        serveCustomExercise(fake, customCurl);
        fake.on('PUT', `/exercises/${customCurl.id}/media`, () =>
          errorResponse('media_quota_exceeded', 507, 'No queda espacio para más fotos'),
        );
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto de la técnica' });
    await user.upload(
      within(section).getByLabelText('Elegir foto de la técnica'),
      new File(['foto'], 'foto.jpg', { type: 'image/jpeg' }),
    );

    expect(await screen.findByText(/tope gratuito de fotos/)).toBeInTheDocument();
  });

  it('una foto que el móvil no sabe leer no llega a subirse', async () => {
    const user = userEvent.setup();
    const unreadable: PhotoCodec = {
      ...fakeCodec,
      decode: () => Promise.reject(new Error('formato desconocido')),
    };
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: unreadable,
      setup: (fake) => {
        serveCustomExercise(fake, customCurl);
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const section = await screen.findByRole('region', { name: 'Foto de la técnica' });
    await user.upload(
      within(section).getByLabelText('Elegir foto de la técnica'),
      new File(['???'], 'raro.jpg', { type: 'image/jpeg' }),
    );

    expect(await screen.findByText(/El móvil no pudo leer esa foto/)).toBeInTheDocument();
    expect(fake.requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('sin codificador en el navegador enseña la foto pero no deja subir', async () => {
    renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: null,
      setup: (fake) => {
        serveCustomExercise(fake, { ...customCurl, media: photoMedia });
      },
    });

    expect(
      await screen.findByRole('img', { name: `Foto de la técnica de ${customCurl.name}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no puede preparar fotos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar foto' })).not.toBeInTheDocument();
  });

  it('un ejercicio del catálogo no tiene sección de foto', async () => {
    renderApp({
      path: `/exercises/${benchPress.id}`,
      session,
      photoCodec: fakeCodec,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse(benchPressHistory),
        );
      },
    });

    await screen.findByRole('heading', { name: 'Press de banca' });
    await waitFor(() => {
      expect(screen.getByText('Peso habitual')).toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: 'Foto de la técnica' })).not.toBeInTheDocument();
  });
});
