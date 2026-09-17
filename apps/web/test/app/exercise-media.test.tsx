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
import type { VideoConverter } from '../../src/features/exercises/video-conversion';
import { createMemoryMediaFileStore } from '../../src/offline/media-file-store';
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

const videoMedia: ExerciseMedia = {
  id: '6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a',
  kind: 'video',
  contentType: 'video/mp4',
  bytes: 11_000_000,
  uploadedAt: '2026-09-17T13:00:00.000Z',
};

/** Un iPhone que lee un 4K vertical y lo entrega convertido tras pasar por la mitad. */
const fakeConverter: VideoConverter = {
  probe: () => Promise.resolve({ width: 2160, height: 3840, durationSeconds: 48.8, codec: 'avc' }),
  convert: (_file, _plan, onProgress) => {
    onProgress(0.5);
    return Promise.resolve(new Blob(['mp4-convertido'], { type: 'video/mp4' }));
  },
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
  fake.on('GET', `/exercises/${initial.id}/media/${videoMedia.id}`, () => {
    return new Response(new Blob(['mp4'], { type: 'video/mp4' }));
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
    const { fake, mediaStore } = renderApp({
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

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    expect(
      within(section).getByText(/Pon una foto o un vídeo de cómo se hace/),
    ).toBeInTheDocument();

    const original = new File(['foto-del-iphone'], 'IMG_0001.HEIC', { type: 'image/heic' });
    await user.upload(within(section).getByLabelText('Elegir foto de la técnica'), original);

    const photo = await screen.findByRole('img', {
      name: `Foto de la técnica de ${customCurl.name}`,
    });
    expect(photo).toHaveAttribute('src', 'blob:gymbuddy/foto');

    const put = fake.requests.find((request) => request.method === 'PUT');
    expect(put?.headers.get('Content-Type')).toBe('image/jpeg');
    // Lo subido es el mismo fichero que guardó el Worker: no se vuelve a bajar y queda en el móvil.
    expect(fake.requests.some((request) => request.path.includes(`/media/${photoMedia.id}`))).toBe(
      false,
    );
    expect(mediaStore.mediaIds()).toEqual([photoMedia.id]);
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

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
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

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
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
    expect(
      screen.queryByRole('region', { name: 'Foto o vídeo de la técnica' }),
    ).not.toBeInTheDocument();
  });
});

describe('vídeo de la técnica en la ficha', () => {
  it('convierte el vídeo en el móvil, lo sube como MP4 y lo deja reproducir', async () => {
    const user = userEvent.setup();
    let state: { current: TrackedExercise } = { current: customCurl };
    let releaseUpload: () => void = () => undefined;
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      videoConverter: fakeConverter,
      setup: (fake) => {
        state = serveCustomExercise(fake, customCurl);
        fake.on(
          'PUT',
          `/exercises/${customCurl.id}/media`,
          () =>
            new Promise<Response>((resolve) => {
              releaseUpload = () => {
                state.current = { ...customCurl, media: videoMedia };
                resolve(jsonResponse(state.current));
              };
            }),
        );
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    const original = new File(['video-de-la-camara'], 'IMG_0002.MOV', { type: 'video/quicktime' });
    await user.upload(within(section).getByLabelText('Elegir vídeo de la técnica'), original);

    expect(await within(section).findByText('Subiendo el vídeo…')).toBeInTheDocument();
    releaseUpload();

    const video = await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`);
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', 'blob:gymbuddy/foto');
    expect(video).toHaveProperty('muted', true);

    const put = fake.requests.find((request) => request.method === 'PUT');
    expect(put?.headers.get('Content-Type')).toBe('video/mp4');
    expect(within(section).getByRole('button', { name: 'Cambiar vídeo' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Quitar vídeo' })).toBeInTheDocument();
  });

  it('avisa de no salir de la app mientras convierte y enseña el avance', async () => {
    const user = userEvent.setup();
    let finish: (video: Blob) => void = () => undefined;
    const slow: VideoConverter = {
      ...fakeConverter,
      convert: (_file, _plan, onProgress) =>
        new Promise<Blob>((resolve) => {
          onProgress(0.42);
          finish = resolve;
        }),
    };
    renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      videoConverter: slow,
      setup: (fake) => {
        const state = serveCustomExercise(fake, customCurl);
        fake.on('PUT', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: videoMedia };
          return jsonResponse(state.current);
        });
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    await user.upload(
      within(section).getByLabelText('Elegir vídeo de la técnica'),
      new File(['video'], 'IMG_0003.MOV', { type: 'video/quicktime' }),
    );

    expect(await within(section).findByText(/Convirtiendo el vídeo… 42/)).toBeInTheDocument();
    expect(within(section).getByText(/No salgas de la app/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Añadir foto' })).toBeDisabled();

    finish(new Blob(['mp4'], { type: 'video/mp4' }));
    expect(
      await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`),
    ).toBeInTheDocument();
  });

  it('un vídeo de más de un minuto no se convierte ni se sube', async () => {
    const user = userEvent.setup();
    const long: VideoConverter = {
      probe: () =>
        Promise.resolve({ width: 2160, height: 3840, durationSeconds: 75, codec: 'hevc' }),
      convert: () => Promise.reject(new Error('no debería convertirse')),
    };
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      videoConverter: long,
      setup: (fake) => {
        serveCustomExercise(fake, customCurl);
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    await user.upload(
      within(section).getByLabelText('Elegir vídeo de la técnica'),
      new File(['video'], 'largo.MOV', { type: 'video/quicktime' }),
    );

    expect(await screen.findByText('No se pudo guardar el vídeo')).toBeInTheDocument();
    expect(screen.getByText(/pasa del minuto/)).toBeInTheDocument();
    expect(fake.requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('quitar el vídeo pide confirmación con su nombre y hace el DELETE', async () => {
    const user = userEvent.setup();
    let state: { current: TrackedExercise } = { current: customCurl };
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      videoConverter: fakeConverter,
      setup: (fake) => {
        state = serveCustomExercise(fake, { ...customCurl, media: videoMedia });
        fake.on('DELETE', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: null };
          return jsonResponse(state.current);
        });
      },
    });

    await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`);
    await user.click(screen.getByRole('button', { name: 'Quitar vídeo' }));
    expect(screen.getByText('¿Quitar el vídeo?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sí, quitarlo' }));

    expect(await screen.findByRole('button', { name: 'Añadir vídeo' })).toBeInTheDocument();
    expect(fake.requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
  });

  it('sin WebCodecs no ofrece vídeo, pero sí foto', async () => {
    renderApp({
      path: CUSTOM_PATH,
      session,
      photoCodec: fakeCodec,
      videoConverter: null,
      setup: (fake) => {
        serveCustomExercise(fake, customCurl);
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    expect(within(section).getByText(/no puede convertir vídeos/)).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Añadir vídeo' })).not.toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
  });
});

describe('fotos y vídeos guardados para verlos sin red', () => {
  it('lo ya visto se enseña desde el dispositivo, sin pedírselo al Worker', async () => {
    const mediaStore = createMemoryMediaFileStore();
    await mediaStore.write(videoMedia.id, new Blob(['mp4-guardado'], { type: 'video/mp4' }), 1_000);
    const { fake } = renderApp({
      path: CUSTOM_PATH,
      session,
      mediaStore,
      setup: (fake) => {
        serveCustomExercise(fake, { ...customCurl, media: videoMedia });
      },
    });

    await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`);

    expect(fake.requests.some((request) => request.path.includes('/media/'))).toBe(false);
  });

  it('lo que se ve por primera vez se baja una vez y se guarda en el dispositivo', async () => {
    const { fake, mediaStore } = renderApp({
      path: CUSTOM_PATH,
      session,
      setup: (fake) => {
        serveCustomExercise(fake, { ...customCurl, media: photoMedia });
      },
    });

    await screen.findByRole('img', { name: `Foto de la técnica de ${customCurl.name}` });

    await waitFor(() => {
      expect(mediaStore.mediaIds()).toEqual([photoMedia.id]);
    });
    expect(
      fake.requests.filter((request) => request.path.includes(`/media/${photoMedia.id}`)),
    ).toHaveLength(1);
  });

  it('cambiar el medio retira del dispositivo el que sustituye', async () => {
    const user = userEvent.setup();
    const mediaStore = createMemoryMediaFileStore();
    await mediaStore.write(photoMedia.id, new Blob(['jpeg-viejo'], { type: 'image/jpeg' }), 1_000);
    renderApp({
      path: CUSTOM_PATH,
      session,
      mediaStore,
      photoCodec: fakeCodec,
      videoConverter: fakeConverter,
      setup: (fake) => {
        const state = serveCustomExercise(fake, { ...customCurl, media: photoMedia });
        fake.on('PUT', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: videoMedia };
          return jsonResponse(state.current);
        });
      },
    });

    const section = await screen.findByRole('region', { name: 'Foto o vídeo de la técnica' });
    await user.upload(
      within(section).getByLabelText('Elegir vídeo de la técnica'),
      new File(['video'], 'IMG_0004.MOV', { type: 'video/quicktime' }),
    );

    await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`);
    await waitFor(() => {
      expect(mediaStore.mediaIds()).toEqual([videoMedia.id]);
    });
  });

  it('quitar el medio también lo borra del dispositivo', async () => {
    const user = userEvent.setup();
    const mediaStore = createMemoryMediaFileStore();
    await mediaStore.write(videoMedia.id, new Blob(['mp4-guardado'], { type: 'video/mp4' }), 1_000);
    renderApp({
      path: CUSTOM_PATH,
      session,
      mediaStore,
      photoCodec: fakeCodec,
      videoConverter: fakeConverter,
      setup: (fake) => {
        const state = serveCustomExercise(fake, { ...customCurl, media: videoMedia });
        fake.on('DELETE', `/exercises/${customCurl.id}/media`, () => {
          state.current = { ...customCurl, media: null };
          return jsonResponse(state.current);
        });
      },
    });

    await screen.findByLabelText(`Vídeo de la técnica de ${customCurl.name}`);
    await user.click(screen.getByRole('button', { name: 'Quitar vídeo' }));
    await user.click(screen.getByRole('button', { name: 'Sí, quitarlo' }));

    await screen.findByRole('button', { name: 'Añadir vídeo' });
    await waitFor(() => {
      expect(mediaStore.mediaIds()).toEqual([]);
    });
  });

  it('sin sesión no queda en el móvil nada de la cuenta anterior', async () => {
    const mediaStore = createMemoryMediaFileStore();
    await mediaStore.write(videoMedia.id, new Blob(['mp4-guardado'], { type: 'video/mp4' }), 1_000);

    renderApp({ path: CUSTOM_PATH, mediaStore });

    await screen.findByRole('button', { name: 'Entrar' });
    await waitFor(() => {
      expect(mediaStore.mediaIds()).toEqual([]);
    });
  });
});
