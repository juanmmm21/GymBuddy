import { getTableColumns } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Database } from './client';

/** D1 no admite más de cien parámetros por consulta. */
const MAX_PARAMS_PER_STATEMENT = 100;

/** Lo mismo con margen para el `user_id` y compañía, que acompañan a la lista en el `where`. */
export const MAX_PARAMS_PER_LOOKUP = 90;

/**
 * Cuántas filas de una tabla caben en una inserción: cada fila pone un parámetro por columna, nulas
 * incluidas. Se calcula con las columnas de hoy y no se escribe a mano: una columna nueva dejaba
 * un número fijo por encima del tope sin que nada lo avisara.
 */
export function rowsPerInsert(table: SQLiteTable): number {
  return Math.floor(MAX_PARAMS_PER_STATEMENT / Object.keys(getTableColumns(table)).length);
}

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
