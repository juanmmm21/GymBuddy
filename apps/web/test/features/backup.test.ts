import { EXPORT_FORMAT, EXPORT_VERSION, exportFileSchema } from '@gymbuddy/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiTransportError } from '../../src/api/client';
import {
  ExportIntegrityError,
  collectExportFile,
  exportFileName,
  serializeExportFile,
  type ExportProgress,
} from '../../src/features/backup/collect-export';
import { createFakeFetch, jsonResponse, type FakeFetch } from '../fake-fetch';
import { exportPage, exportSnapshot, exportedSessions } from '../fixtures';

const UNKNOWN_EXERCISE_ID = '0b9e7d65-4c3a-4b21-9f8e-7d6c5b4a3f21';

function clientOver(fake: FakeFetch): ApiClient {
  return new ApiClient({ baseUrl: '', getToken: () => 'jwt-de-prueba', fetchImpl: fake.fetch });
}

/** Un Worker con `total` sesiones servidas de cincuenta en cincuenta, como el de verdad. */
function serveSessions(fake: FakeFetch, total: number): void {
  fake.on('GET', '/export/sessions', (request) => {
    const offset = Number(new URL(request.path, 'http://localhost').searchParams.get('offset'));
    const count = Math.max(Math.min(50, total - offset), 0);

    return jsonResponse(exportPage(exportedSessions(count, offset), total, offset));
  });
  fake.on('GET', '/export/snapshot', () => jsonResponse(exportSnapshot));
}

describe('collectExportFile', () => {
  it('recorre todas las páginas de sesiones y pide lo demás al final', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 120);
    const progress: ExportProgress[] = [];

    const file = await collectExportFile(clientOver(fake), (step) => progress.push(step));

    expect(fake.requests.map((request) => request.path)).toEqual([
      '/export/sessions?limit=50&offset=0',
      '/export/sessions?limit=50&offset=50',
      '/export/sessions?limit=50&offset=100',
      '/export/snapshot',
    ]);
    expect(progress).toEqual([
      { loadedSessions: 50, totalSessions: 120 },
      { loadedSessions: 100, totalSessions: 120 },
      { loadedSessions: 120, totalSessions: 120 },
    ]);
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.sessions).toHaveLength(120);
    expect(new Set(file.sessions.map((session) => session.id)).size).toBe(120);
  });

  it('una cuenta sin sesiones pide una sola página y sigue dando un fichero', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 0);

    const file = await collectExportFile(clientOver(fake), vi.fn());

    expect(fake.requests).toHaveLength(2);
    expect(file.sessions).toEqual([]);
    expect(file.exercises).toHaveLength(1);
  });

  it('no entrega un fichero cuyas series nombran un ejercicio que no trae', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 1);
    const [orphan] = exportedSessions(1);
    const [set] = orphan?.sets ?? [];
    if (orphan === undefined || set === undefined) throw new Error('Faltan fixtures');
    fake.on('GET', '/export/sessions', () =>
      jsonResponse(
        exportPage(
          [{ ...orphan, sets: [{ ...set, trackedExerciseId: UNKNOWN_EXERCISE_ID }] }],
          1,
          0,
        ),
      ),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(collectExportFile(clientOver(fake), vi.fn())).rejects.toBeInstanceOf(
      ExportIntegrityError,
    );
  });

  it('un corte de red a mitad no deja un fichero a medias', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 80);
    fake.on('GET', '/export/snapshot', () => Promise.reject(new TypeError('Failed to fetch')));

    await expect(collectExportFile(clientOver(fake), vi.fn())).rejects.toBeInstanceOf(
      ApiTransportError,
    );
  });
});

describe('fichero de la copia', () => {
  it('se llama con la fecha de la copia', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 2);

    const file = await collectExportFile(clientOver(fake), vi.fn());

    expect(exportFileName(file)).toBe('gymbuddy-2026-09-13.json');
  });

  it('se lee de vuelta con el esquema del contrato, pesos como cadena incluidos', async () => {
    const fake = createFakeFetch();
    serveSessions(fake, 3);
    const file = await collectExportFile(clientOver(fake), vi.fn());

    const text = serializeExportFile(file);
    const reread = exportFileSchema.parse(JSON.parse(text));

    expect(reread).toEqual(file);
    expect(text).toContain('"weight": "82.50"');
  });
});
