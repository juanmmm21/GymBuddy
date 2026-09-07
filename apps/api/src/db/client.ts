import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Database = DrizzleD1Database<typeof schema>;

/**
 * Envuelve el binding de D1 con Drizzle. Se crea por petición: el binding pertenece
 * al `env` de la invocación y no puede guardarse en una variable de módulo.
 */
export function createDatabase(binding: D1Database): Database {
  return drizzle(binding, { schema });
}
