import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Marca temporal en ISO 8601 UTC. SQLite no tiene tipo fecha; guardarlas como texto ISO
 * mantiene el orden lexicográfico igual al cronológico y evita conversiones al leer.
 */
const isoTimestamp = (name: string) => text(name);

/**
 * Identificador de fila. Es texto porque la PWA genera el id antes de tener red (cola
 * offline de la fase 13): reenviar la misma serie dos veces no puede crear dos filas.
 */
const rowId = (name: string) => text(name);

export const user = sqliteTable(
  'user',
  {
    id: rowId('id').primaryKey(),
    // Telegram es la identidad entera del sistema: sin cuentas propias, esta es la clave real.
    telegramUserId: integer('telegram_user_id').notNull(),
    firstName: text('first_name').notNull(),
    username: text('username'),
    photoUrl: text('photo_url'),
    locale: text('locale', { enum: ['es', 'en'] })
      .notNull()
      .default('es'),
    unitSystem: text('unit_system', { enum: ['metric', 'imperial'] })
      .notNull()
      .default('metric'),
    createdAt: isoTimestamp('created_at').notNull(),
  },
  (table) => [uniqueIndex('user_telegram_user_id_unique').on(table.telegramUserId)],
);

export const loginNonce = sqliteTable(
  'login_nonce',
  {
    // Se guarda el digest SHA-256, no el nonce: durante sus minutos de vida un nonce sin
    // reclamar es una llave de sesión, y una copia de seguridad de la base no debe contener
    // llaves utilizables. El original solo existe en el enlace que abre el usuario.
    nonceHash: text('nonce_hash').primaryKey(),
    // Nulo hasta que alguien abre el enlace en Telegram: ahí se sabe de quién era.
    userId: rowId('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: isoTimestamp('created_at').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    // Se sella al canjear el nonce por el JWT, y es lo que lo convierte en un solo uso.
    claimedAt: isoTimestamp('claimed_at'),
  },
  // Los nonces caducados se barren por esta columna: sin el índice, la limpieza recorrería
  // la tabla entera y D1 cobra por filas leídas.
  (table) => [index('login_nonce_expires_at_idx').on(table.expiresAt)],
);

export const catalogExercise = sqliteTable(
  'catalog_exercise',
  {
    // "{muscle}/{slug}", la clave estable del catálogo externo.
    catalogId: text('catalog_id').primaryKey(),
    slug: text('slug').notNull(),
    // muscle (19 valores) manda en el detalle y en la carpeta del GIF; body_part (7)
    // es lo que navega el usuario. No son lo mismo: pectorals vive en chest.
    muscle: text('muscle').notNull(),
    bodyPart: text('body_part').notNull(),
    equipment: text('equipment').notNull(),
    category: text('category').notNull(),
    secondaryMuscles: text('secondary_muscles', { mode: 'json' }).notNull().$type<string[]>(),
    gifUrl: text('gif_url').notNull(),
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en').notNull(),
    instructionsEs: text('instructions_es', { mode: 'json' }).notNull().$type<string[]>(),
    instructionsEn: text('instructions_en', { mode: 'json' }).notNull().$type<string[]>(),
    // Nombre normalizado (minúsculas y sin acentos) para la búsqueda difusa del bot y la API.
    searchText: text('search_text').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    syncedAt: isoTimestamp('synced_at').notNull(),
  },
  (table) => [
    index('catalog_exercise_body_part_idx').on(table.bodyPart),
    index('catalog_exercise_muscle_idx').on(table.muscle),
    index('catalog_exercise_search_text_idx').on(table.searchText),
  ],
);

/**
 * Puntero del ciclo de sincronización del catálogo. Existe porque el snapshot se trae
 * de un músculo por invocación (el límite de CPU del plan gratuito prohíbe traerlo
 * entero) y hace falta saber por dónde iba el ciclo entre una invocación y la siguiente.
 * Vive en D1 y no en KV para no meter un binding más por una sola fila.
 */
export const catalogSyncState = sqliteTable(
  'catalog_sync_state',
  {
    id: text('id').primaryKey(),
    catalogVersion: text('catalog_version').notNull(),
    // Nulo cuando el ciclo terminó; si no, el músculo que falta por traer.
    nextMuscle: text('next_muscle'),
    startedAt: isoTimestamp('started_at').notNull(),
    updatedAt: isoTimestamp('updated_at').notNull(),
    completedAt: isoTimestamp('completed_at'),
    // El último fallo del origen queda registrado: en el edge no hay otro rastro de por
    // qué un ciclo se quedó parado a mitad.
    lastError: text('last_error'),
  },
  // Es una fila única. El CHECK lo impone en la base y no en la confianza de quien escriba.
  (table) => [check('catalog_sync_state_singleton', sql`${table.id} = 'catalog'`)],
);

export const trackedExercise = sqliteTable(
  'tracked_exercise',
  {
    id: rowId('id').primaryKey(),
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Si el catálogo se resincroniza y pierde un ejercicio, el historial del usuario
    // no puede desaparecer con él: la referencia se anula y quedan los campos propios.
    catalogId: text('catalog_id').references(() => catalogExercise.catalogId, {
      onDelete: 'set null',
    }),
    customName: text('custom_name'),
    customMuscle: text('custom_muscle'),
    customBodyPart: text('custom_body_part'),
    notes: text('notes'),
    createdAt: isoTimestamp('created_at').notNull(),
    archivedAt: isoTimestamp('archived_at'),
  },
  (table) => [
    index('tracked_exercise_user_id_idx').on(table.userId),
    // Añadir dos veces el mismo ejercicio del catálogo duplicaría su historial en dos fichas.
    uniqueIndex('tracked_exercise_user_catalog_unique')
      .on(table.userId, table.catalogId)
      .where(sql`${table.catalogId} is not null`),
    check(
      'tracked_exercise_source_present',
      sql`${table.catalogId} is not null or ${table.customName} is not null`,
    ),
  ],
);

export const workoutSession = sqliteTable(
  'workout_session',
  {
    id: rowId('id').primaryKey(),
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startedAt: isoTimestamp('started_at').notNull(),
    // Nulo mientras la sesión sigue abierta: es lo que distingue la sesión en curso.
    endedAt: isoTimestamp('ended_at'),
    notes: text('notes'),
    source: text('source', { enum: ['web', 'bot'] }).notNull(),
  },
  (table) => [index('workout_session_user_started_idx').on(table.userId, table.startedAt)],
);

export const setEntry = sqliteTable(
  'set_entry',
  {
    id: rowId('id').primaryKey(),
    sessionId: rowId('session_id')
      .notNull()
      .references(() => workoutSession.id, { onDelete: 'cascade' }),
    trackedExerciseId: rowId('tracked_exercise_id')
      .notNull()
      .references(() => trackedExercise.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    // Gramos enteros. Un 82.5 en coma flotante acaba siendo 82.49999 en pantalla.
    weightGrams: integer('weight_grams').notNull(),
    reps: integer('reps').notNull(),
    // RPE en décimas (85 = RPE 8.5): entero exacto, igual que el peso.
    rpeTenths: integer('rpe_tenths'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    completedAt: isoTimestamp('completed_at').notNull(),
    source: text('source', { enum: ['web', 'bot'] }).notNull(),
  },
  (table) => [
    index('set_entry_session_order_idx').on(table.sessionId, table.orderIndex),
    index('set_entry_exercise_completed_idx').on(table.trackedExerciseId, table.completedAt),
    check('set_entry_weight_non_negative', sql`${table.weightGrams} >= 0`),
    check('set_entry_reps_positive', sql`${table.reps} > 0`),
    // El RPE real se usa de 1 a 10 en pasos de media unidad; fuera de ahí es un error de conversión.
    check(
      'set_entry_rpe_range',
      sql`${table.rpeTenths} is null or (${table.rpeTenths} between 10 and 100 and ${table.rpeTenths} % 5 = 0)`,
    ),
  ],
);

export const routine = sqliteTable(
  'routine',
  {
    id: rowId('id').primaryKey(),
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: isoTimestamp('created_at').notNull(),
    archivedAt: isoTimestamp('archived_at'),
  },
  (table) => [index('routine_user_id_idx').on(table.userId)],
);

export const routineItem = sqliteTable(
  'routine_item',
  {
    id: rowId('id').primaryKey(),
    routineId: rowId('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    trackedExerciseId: rowId('tracked_exercise_id')
      .notNull()
      .references(() => trackedExercise.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetRepsMin: integer('target_reps_min').notNull(),
    targetRepsMax: integer('target_reps_max').notNull(),
  },
  (table) => [
    index('routine_item_routine_order_idx').on(table.routineId, table.orderIndex),
    check('routine_item_target_sets_positive', sql`${table.targetSets} > 0`),
    check(
      'routine_item_rep_range_ordered',
      sql`${table.targetRepsMin} > 0 and ${table.targetRepsMax} >= ${table.targetRepsMin}`,
    ),
  ],
);

export const personalRecord = sqliteTable(
  'personal_record',
  {
    id: rowId('id').primaryKey(),
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trackedExerciseId: rowId('tracked_exercise_id')
      .notNull()
      .references(() => trackedExercise.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['max_weight', 'estimated_1rm', 'max_volume'] }).notNull(),
    // Los tres tipos se miden en gramos: peso, 1RM estimado y volumen (peso × repeticiones).
    valueGrams: integer('value_grams').notNull(),
    setEntryId: rowId('set_entry_id')
      .notNull()
      .references(() => setEntry.id, { onDelete: 'cascade' }),
    achievedAt: isoTimestamp('achieved_at').notNull(),
  },
  (table) => [
    index('personal_record_exercise_kind_idx').on(table.trackedExerciseId, table.kind),
    index('personal_record_user_achieved_idx').on(table.userId, table.achievedAt),
  ],
);

export type UserRow = typeof user.$inferSelect;
export type NewUserRow = typeof user.$inferInsert;
export type LoginNonceRow = typeof loginNonce.$inferSelect;
export type NewLoginNonceRow = typeof loginNonce.$inferInsert;
export type CatalogExerciseRow = typeof catalogExercise.$inferSelect;
export type NewCatalogExerciseRow = typeof catalogExercise.$inferInsert;
export type CatalogSyncStateRow = typeof catalogSyncState.$inferSelect;
export type NewCatalogSyncStateRow = typeof catalogSyncState.$inferInsert;
export type TrackedExerciseRow = typeof trackedExercise.$inferSelect;
export type NewTrackedExerciseRow = typeof trackedExercise.$inferInsert;
export type WorkoutSessionRow = typeof workoutSession.$inferSelect;
export type NewWorkoutSessionRow = typeof workoutSession.$inferInsert;
export type SetEntryRow = typeof setEntry.$inferSelect;
export type NewSetEntryRow = typeof setEntry.$inferInsert;
export type RoutineRow = typeof routine.$inferSelect;
export type NewRoutineRow = typeof routine.$inferInsert;
export type RoutineItemRow = typeof routineItem.$inferSelect;
export type NewRoutineItemRow = typeof routineItem.$inferInsert;
export type PersonalRecordRow = typeof personalRecord.$inferSelect;
export type NewPersonalRecordRow = typeof personalRecord.$inferInsert;
