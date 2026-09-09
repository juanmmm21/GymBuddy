import { apiErrorSchema, routineSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { issueSessionToken } from '../src/auth/jwt';
import { app } from '../src/index';
import { seedTrainingScenario } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const routineListSchema = z.array(routineSchema);

const routinesEnv = (): Env => envWithSecrets({ JWT_SECRET });

/** Los identificadores los pone el cliente, así que el test los genera igual que la PWA. */
const uuid = (): string => crypto.randomUUID();

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

interface Call {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}

async function call({ method, path, token, body }: Call): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return app.request(
    `${BASE}${path}`,
    { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    routinesEnv(),
  );
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

interface ItemInput {
  readonly id?: string;
  readonly trackedExerciseId: string;
  readonly targetSets?: number;
  readonly targetRepsMin?: number;
  readonly targetRepsMax?: number;
}

function item(input: ItemInput): Record<string, unknown> {
  return {
    id: input.id ?? uuid(),
    trackedExerciseId: input.trackedExerciseId,
    targetSets: input.targetSets ?? 4,
    targetRepsMin: input.targetRepsMin ?? 8,
    targetRepsMax: input.targetRepsMax ?? 12,
  };
}

describe('api de rutinas', () => {
  let token: string;
  let otherToken: string;
  let benchId: string;
  let squatId: string;
  let otherExerciseId: string;

  beforeEach(async () => {
    const seeded = await seedTrainingScenario(env.DB);
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);
    benchId = seeded.benchId;
    squatId = seeded.squatId;
    otherExerciseId = seeded.otherExerciseId;
  });

  it('crea una rutina con sus ejercicios y les da el orden de la lista', async () => {
    const routineId = uuid();
    const response = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: {
        id: routineId,
        name: '  Empuje  ',
        description: 'Lunes y jueves',
        items: [item({ trackedExerciseId: squatId }), item({ trackedExerciseId: benchId })],
      },
    });

    expect(response.status).toBe(201);
    const routine = routineSchema.parse(await response.json());

    expect(routine.id).toBe(routineId);
    // El nombre entra recortado: lo tecleó alguien con el móvil en la mano.
    expect(routine.name).toBe('Empuje');
    expect(routine.description).toBe('Lunes y jueves');
    expect(routine.archivedAt).toBeNull();
    expect(routine.items.map((entry) => entry.trackedExerciseId)).toEqual([squatId, benchId]);
    expect(routine.items.map((entry) => entry.orderIndex)).toEqual([0, 1]);
  });

  it('lista las rutinas del usuario con sus ejercicios ordenados', async () => {
    const first = uuid();
    const second = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: first, name: 'Empuje', items: [item({ trackedExerciseId: benchId })] },
    });
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: second, name: 'Pierna', items: [] },
    });

    const response = await call({ method: 'GET', path: '/routines', token });
    const routines = routineListSchema.parse(await response.json());

    expect(routines).toHaveLength(2);
    expect(routines.map((routine) => routine.name)).toEqual(['Empuje', 'Pierna']);
    // Una rutina recién creada en el editor todavía no tiene líneas y tiene que salir igual.
    expect(routines[1]?.items).toEqual([]);
  });

  it('acepta el mismo ejercicio dos veces: son dos bloques del entrenamiento', async () => {
    const response = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: {
        id: uuid(),
        name: 'Empuje',
        items: [
          item({ trackedExerciseId: benchId, targetRepsMin: 5, targetRepsMax: 5 }),
          item({ trackedExerciseId: benchId, targetRepsMin: 10, targetRepsMax: 12 }),
        ],
      },
    });

    expect(response.status).toBe(201);
    const routine = routineSchema.parse(await response.json());

    expect(routine.items).toHaveLength(2);
    expect(routine.items.map((entry) => entry.targetRepsMin)).toEqual([5, 10]);
  });

  it('reenviar el alta devuelve la misma rutina sin duplicar sus ejercicios', async () => {
    const body = {
      id: uuid(),
      name: 'Empuje',
      description: null,
      items: [item({ trackedExerciseId: benchId })],
    };

    const created = await call({ method: 'POST', path: '/routines', token, body });
    const resent = await call({ method: 'POST', path: '/routines', token, body });

    expect(created.status).toBe(201);
    // 200 y no 201: repetir el alta desde la cola offline no crea un recurso nuevo.
    expect(resent.status).toBe(200);
    expect(routineSchema.parse(await resent.json()).items).toHaveLength(1);

    const listed = routineListSchema.parse(
      await (await call({ method: 'GET', path: '/routines', token })).json(),
    );
    expect(listed).toHaveLength(1);
  });

  it('el mismo identificador con otros datos es un choque de escritura', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [item({ trackedExerciseId: benchId })] },
    });

    const conflicting = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Tirón', items: [item({ trackedExerciseId: benchId })] },
    });

    expect(conflicting.status).toBe(409);
    expect(await errorCode(conflicting)).toBe('conflicting_write');
  });

  it('cambiar los ejercicios de un reenvío también es un choque', async () => {
    const routineId = uuid();
    const bench = item({ trackedExerciseId: benchId });
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [bench] },
    });

    const conflicting = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [bench, item({ trackedExerciseId: squatId })] },
    });

    expect(await errorCode(conflicting)).toBe('conflicting_write');
  });

  it('no deja colgar ejercicios de la rutina de otro usuario', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [item({ trackedExerciseId: benchId })] },
    });

    const stolen = await call({
      method: 'POST',
      path: '/routines',
      token: otherToken,
      body: { id: routineId, name: 'Mía', items: [item({ trackedExerciseId: otherExerciseId })] },
    });

    expect(stolen.status).toBe(409);
    expect(await errorCode(stolen)).toBe('conflicting_write');

    // Y la rutina del dueño sigue exactamente como estaba.
    const mine = routineSchema.parse(
      await (await call({ method: 'GET', path: `/routines/${routineId}`, token })).json(),
    );
    expect(mine.name).toBe('Empuje');
    expect(mine.items).toHaveLength(1);
  });

  it('un ejercicio que no es tuyo no existe', async () => {
    const response = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: uuid(), name: 'Empuje', items: [item({ trackedExerciseId: otherExerciseId })] },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('rechaza un rango de repeticiones invertido antes de tocar la base', async () => {
    const response = await call({
      method: 'POST',
      path: '/routines',
      token,
      body: {
        id: uuid(),
        name: 'Empuje',
        items: [item({ trackedExerciseId: benchId, targetRepsMin: 12, targetRepsMax: 8 })],
      },
    });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_failed');
  });

  it('reemplaza la lista de ejercicios y renumera el orden', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: {
        id: routineId,
        name: 'Empuje',
        items: [item({ trackedExerciseId: benchId }), item({ trackedExerciseId: squatId })],
      },
    });

    const response = await call({
      method: 'PATCH',
      path: `/routines/${routineId}`,
      token,
      body: {
        name: 'Empuje pesado',
        items: [item({ trackedExerciseId: squatId, targetSets: 5 })],
      },
    });

    expect(response.status).toBe(200);
    const routine = routineSchema.parse(await response.json());

    expect(routine.name).toBe('Empuje pesado');
    expect(routine.items).toHaveLength(1);
    expect(routine.items[0]?.trackedExerciseId).toBe(squatId);
    expect(routine.items[0]?.orderIndex).toBe(0);
    expect(routine.items[0]?.targetSets).toBe(5);
  });

  it('deja la lista intacta cuando solo se toca la descripción', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: {
        id: routineId,
        name: 'Empuje',
        description: 'Lunes',
        items: [item({ trackedExerciseId: benchId })],
      },
    });

    const routine = routineSchema.parse(
      await (
        await call({
          method: 'PATCH',
          path: `/routines/${routineId}`,
          token,
          body: { description: null },
        })
      ).json(),
    );

    expect(routine.description).toBeNull();
    expect(routine.name).toBe('Empuje');
    expect(routine.items).toHaveLength(1);
  });

  it('archiva y recupera: la baja es blanda y la rutina no se pierde', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [item({ trackedExerciseId: benchId })] },
    });

    const archived = routineSchema.parse(
      await (
        await call({
          method: 'PATCH',
          path: `/routines/${routineId}`,
          token,
          body: { archived: true },
        })
      ).json(),
    );
    expect(archived.archivedAt).not.toBeNull();

    const visible = routineListSchema.parse(
      await (await call({ method: 'GET', path: '/routines', token })).json(),
    );
    expect(visible).toEqual([]);

    const all = routineListSchema.parse(
      await (await call({ method: 'GET', path: '/routines?includeArchived=true', token })).json(),
    );
    expect(all).toHaveLength(1);
    // Sus ejercicios siguen ahí: archivar no es borrar.
    expect(all[0]?.items).toHaveLength(1);

    const restored = routineSchema.parse(
      await (
        await call({
          method: 'PATCH',
          path: `/routines/${routineId}`,
          token,
          body: { archived: false },
        })
      ).json(),
    );
    expect(restored.archivedAt).toBeNull();
  });

  it('la rutina de otro usuario no existe, ni para leerla ni para cambiarla', async () => {
    const routineId = uuid();
    await call({
      method: 'POST',
      path: '/routines',
      token,
      body: { id: routineId, name: 'Empuje', items: [] },
    });

    const read = await call({ method: 'GET', path: `/routines/${routineId}`, token: otherToken });
    const written = await call({
      method: 'PATCH',
      path: `/routines/${routineId}`,
      token: otherToken,
      body: { name: 'Mía' },
    });

    // 404 y no 403: desde fuera, lo que no es tuyo no existe.
    expect(read.status).toBe(404);
    expect(written.status).toBe(404);
    expect(await errorCode(written)).toBe('not_found');
  });

  it('exige sesión en todas las rutas de rutinas', async () => {
    const list = await call({ method: 'GET', path: '/routines' });
    const create = await call({
      method: 'POST',
      path: '/routines',
      body: { id: uuid(), name: 'Empuje', items: [] },
    });

    expect(list.status).toBe(401);
    expect(create.status).toBe(401);
    expect(await errorCode(list)).toBe('unauthorized');
  });
});
