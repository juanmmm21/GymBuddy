import {
  MAX_IMPORT_ROWS_PER_BATCH,
  buildExportFile,
  deriveImportedId,
  planImport,
  type ExportFile,
  type ExportedSession,
} from '@gymbuddy/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from '../../src/api/client';
import { readImportFile, summarizeImportFile } from '../../src/features/backup/read-import-file';
import {
  ImportConflictError,
  runImport,
  type ImportProgress,
} from '../../src/features/backup/run-import';
import { createFakeFetch, errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { benchPress, exportSnapshot, exportedSessions, user } from '../fixtures';

function clientOver(fake: FakeFetch): ApiClient {
  return new ApiClient({ baseUrl: '', getToken: () => 'jwt-de-prueba', fetchImpl: fake.fetch });
}

function backup(sessions: ExportedSession[]): ExportFile {
  return buildExportFile(exportSnapshot, sessions);
}

/** Un Worker que acepta cada lote y apunta lo que le llega. */
function serveImport(fake: FakeFetch, accountExercises: unknown[] = []): void {
  fake.on('GET', '/exercises', () => jsonResponse(accountExercises));
  fake.on('POST', '/import/exercises', () => jsonResponse({ enteredAsCustom: [] }));
  fake.on('POST', '/import/routines', () => new Response(null, { status: 204 }));
  fake.on('POST', '/import/sessions', () => new Response(null, { status: 204 }));
}

describe('readImportFile', () => {
  it('una copia válida queda lista, con sus lotes ya repartidos', () => {
    const file = backup(exportedSessions(45));

    const reading = readImportFile(JSON.stringify(file));

    expect(reading.status).toBe('ready');
    if (reading.status !== 'ready') return;
    expect(reading.file).toEqual(file);
    expect(reading.plan.sessions.map((batch) => batch.length)).toEqual([20, 20, 5]);
  });

  it('distingue lo que no es JSON de lo que no es de GymBuddy', () => {
    expect(readImportFile('{"format": "gymbuddy-export"').status).toBe('not_json');
    expect(readImportFile('[1, 2, 3]').status).toBe('not_gymbuddy');
    expect(readImportFile('{"format": "otra-app", "version": 1}').status).toBe('not_gymbuddy');
  });

  it('una versión que no es la 1 no se da por rota: se dice que es de otra versión', () => {
    const file = { ...backup([]), version: 2 };

    expect(readImportFile(JSON.stringify(file))).toEqual({
      status: 'unsupported_version',
      version: 2,
    });
  });

  it('una copia retocada que no cumple el contrato se rechaza entera', () => {
    const [first] = exportedSessions(1);
    if (first === undefined) throw new Error('Sin sesión de prueba');
    const orphan = {
      ...first,
      sets: first.sets.map((set) => ({
        ...set,
        trackedExerciseId: '0b9e7d65-4c3a-4b21-9f8e-7d6c5b4a3f21',
      })),
    };

    expect(readImportFile(JSON.stringify(backup([orphan]))).status).toBe('broken');
  });

  it('una sesión que no cabe en una petición bloquea la copia antes de escribir nada', () => {
    const [first] = exportedSessions(1);
    if (first === undefined) throw new Error('Sin sesión de prueba');
    const template = first.sets[0];
    if (template === undefined) throw new Error('Sin serie de prueba');
    const huge = {
      ...first,
      sets: Array.from({ length: MAX_IMPORT_ROWS_PER_BATCH }, (_unused, index) => ({
        ...template,
        id: `22222222-0000-4000-8000-${String(index).padStart(12, '0')}`,
        orderIndex: index,
      })),
    };

    expect(readImportFile(JSON.stringify(backup([huge]))).status).toBe('too_large');
  });

  it('el resumen cuenta series y sesiones sin cerrar', () => {
    const [closed, open] = exportedSessions(2);
    if (closed === undefined || open === undefined) throw new Error('Sin sesiones de prueba');

    const summary = summarizeImportFile(
      backup([{ ...closed, endedAt: '2026-01-01T19:00:00.000Z' }, open]),
    );

    expect(summary).toEqual({
      exportedAt: '2026-09-13T10:00:00.000Z',
      exercises: 1,
      sessions: 2,
      sets: 2,
      routines: 1,
      openSessions: 1,
    });
  });
});

describe('runImport', () => {
  it('sube ejercicios, rutinas y sesiones en ese orden y avisa del progreso', async () => {
    const fake = createFakeFetch();
    serveImport(fake);
    const file = backup(exportedSessions(45));
    const progress: ImportProgress[] = [];

    const result = await runImport(clientOver(fake), user.id, file, planImport(file), (step) =>
      progress.push(step),
    );

    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /exercises?includeArchived=true',
      'POST /import/exercises',
      'POST /import/routines',
      'POST /import/sessions',
      'POST /import/sessions',
      'POST /import/sessions',
    ]);
    expect(fake.requests[1]?.body).toEqual({ exercises: file.exercises });
    expect(progress).toEqual([
      { phase: 'exercises', done: 1, total: 1 },
      { phase: 'routines', done: 1, total: 1 },
      { phase: 'sessions', done: 20, total: 45 },
      { phase: 'sessions', done: 40, total: 45 },
      { phase: 'sessions', done: 45, total: 45 },
    ]);
    expect(result).toEqual({ exercises: 1, sessions: 45, routines: 1, enteredAsCustom: 0 });
  });

  it('suma los ejercicios que entraron como propios', async () => {
    const fake = createFakeFetch();
    serveImport(fake);
    fake.on('POST', '/import/exercises', () =>
      jsonResponse({ enteredAsCustom: ['pectorals/barbell-bench-press'] }),
    );
    const file = backup([]);

    const result = await runImport(clientOver(fake), user.id, file, planImport(file), vi.fn());

    expect(result.enteredAsCustom).toBe(1);
  });

  it('si la cuenta ya sigue un ejercicio de la copia con otra ficha, no sube nada', async () => {
    const fake = createFakeFetch();
    serveImport(fake, [benchPress]);
    const file = backup(exportedSessions(2));

    const attempt = runImport(clientOver(fake), user.id, file, planImport(file), vi.fn());

    await expect(attempt).rejects.toBeInstanceOf(ImportConflictError);
    await expect(attempt).rejects.toMatchObject({ exerciseNames: ['Press de banca'] });
    expect(fake.requests.some((request) => request.path.startsWith('/import/'))).toBe(false);
  });

  it('la ficha que dejó una importación anterior de la misma copia no cuenta como choque', async () => {
    const fake = createFakeFetch();
    const alreadyImported = {
      ...benchPress,
      id: await deriveImportedId(user.id, benchPress.id),
    };
    serveImport(fake, [alreadyImported]);
    const file = backup(exportedSessions(1));

    await runImport(clientOver(fake), user.id, file, planImport(file), vi.fn());

    expect(fake.requests.filter((request) => request.path.startsWith('/import/'))).toHaveLength(3);
  });

  it('un lote que falla corta la subida y deja pasar el error del Worker', async () => {
    const fake = createFakeFetch();
    serveImport(fake);
    fake.on('POST', '/import/routines', () =>
      errorResponse('internal_error', 500, 'Algo se ha roto en el servidor.'),
    );
    const file = backup(exportedSessions(3));

    const attempt = runImport(clientOver(fake), user.id, file, planImport(file), vi.fn());

    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError);
    expect(fake.requests.some((request) => request.path === '/import/sessions')).toBe(false);
  });
});
