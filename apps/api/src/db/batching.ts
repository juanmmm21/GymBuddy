import type { BatchItem } from 'drizzle-orm/batch';
import type { Database } from './client';

/** D1 no admite más de cien parámetros por consulta; se deja margen para el `user_id` y compañía. */
export const MAX_PARAMS_PER_LOOKUP = 90;

/** Parte una lista en trozos de `size` para que cada sentencia quepa en los cien parámetros de D1. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/** Manda las sentencias en un solo viaje a la base; sin ninguna no se llama a D1. */
export async function runBatch(db: Database, statements: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first === undefined) return;

  await db.batch([first, ...rest]);
}
