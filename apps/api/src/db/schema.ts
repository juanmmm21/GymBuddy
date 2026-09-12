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

/**
 * La cuenta. No guarda nada que identifique a la persona fuera de la app: se entra con las
 * passkeys de `passkey_credential` y el nombre solo sirve para saludar (ADR 0005).
 */
export const user = sqliteTable('user', {
  id: rowId('id').primaryKey(),
  // Lo elige cada uno al registrarse. No identifica a nadie: dos personas pueden llamarse igual.
  displayName: text('display_name').notNull(),
  locale: text('locale', { enum: ['es', 'en'] })
    .notNull()
    .default('es'),
  unitSystem: text('unit_system', { enum: ['metric', 'imperial'] })
    .notNull()
    .default('metric'),
  createdAt: isoTimestamp('created_at').notNull(),
});

/**
 * Código de invitación para registrarse. Se guarda el digest SHA-256 del código y no el código:
 * mientras no se usa, un código es una llave para crear una cuenta, y una copia de seguridad de
 * la base no debe contener llaves utilizables. El original solo existe en el mensaje que se envía.
 */
export const invitation = sqliteTable(
  'invitation',
  {
    codeHash: text('code_hash').primaryKey(),
    // Quién la generó desde la app; nulo en las que se crean con el secreto de administración.
    createdByUserId: rowId('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: isoTimestamp('created_at').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    // Se sella al consumirla con un UPDATE condicionado a que siga nulo: es lo que la hace de un
    // solo uso aunque lleguen dos registros a la vez.
    usedAt: isoTimestamp('used_at'),
    usedByUserId: rowId('used_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  },
  // Los topes de invitaciones por usuario se cuentan por esta columna.
  (table) => [index('invitation_created_by_idx').on(table.createdByUserId)],
);

/**
 * Una passkey registrada. Un usuario puede tener varias: las de Apple y las de Google no se
 * sincronizan entre sí, así que quien entra desde los dos mundos necesita una en cada uno.
 */
export const passkeyCredential = sqliteTable(
  'passkey_credential',
  {
    // El identificador que da el autenticador, en base64url: es lo que llega al entrar.
    id: text('id').primaryKey(),
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Clave pública COSE en base64url, tal y como la extrajo la verificación del registro.
    publicKey: text('public_key').notNull(),
    // Contador de firmas. Las passkeys sincronizadas lo dejan siempre en cero; un autenticador
    // que sí lo sube delata con él una llave clonada, porque el clon se quedaría atrás.
    counter: integer('counter').notNull().default(0),
    transports: text('transports', { mode: 'json' }).$type<string[]>(),
    // Si la llave está copiada en la nube del móvil. Una que no lo está se pierde con el móvil.
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    createdAt: isoTimestamp('created_at').notNull(),
    lastUsedAt: isoTimestamp('last_used_at'),
  },
  (table) => [
    index('passkey_credential_user_id_idx').on(table.userId),
    check('passkey_credential_counter_non_negative', sql`${table.counter} >= 0`),
  ],
);

/**
 * El código con el que un dispositivo nuevo se suma a una cuenta que ya existe. Se guarda su
 * digest SHA-256, igual que el de la invitación: mientras no se usa es una llave para entrar en
 * una cuenta ajena, y una copia de la base no debe contener llaves utilizables.
 */
export const deviceLink = sqliteTable(
  'device_link',
  {
    codeHash: text('code_hash').primaryKey(),
    // La cuenta a la que se sumará el dispositivo nuevo. Ya existe, así que sí lleva clave ajena.
    userId: rowId('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: isoTimestamp('created_at').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    // Se sella al consumirlo con un UPDATE condicionado a que siga nulo, como la invitación.
    usedAt: isoTimestamp('used_at'),
  },
  // Pedir un código nuevo retira los anteriores de esa cuenta: se busca por aquí.
  (table) => [index('device_link_user_id_idx').on(table.userId)],
);

/**
 * El reto de una ceremonia de WebAuthn a medias. Vive minutos y se borra al leerlo: es lo que
 * impide presentar dos veces la misma respuesta firmada.
 */
export const authChallenge = sqliteTable(
  'auth_challenge',
  {
    id: rowId('id').primaryKey(),
    kind: text('kind', {
      enum: ['registration', 'authentication', 'device_link'],
    }).notNull(),
    // Va en claro, a diferencia del código de invitación: no es una llave, porque firmarlo exige
    // la clave privada que solo tiene el móvil.
    challenge: text('challenge').notNull(),
    createdAt: isoTimestamp('created_at').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    // En el registro, la cuenta que se creará si la passkey verifica; en el enlace de un
    // dispositivo, la que ya existe. No lleva clave ajena porque en el primer caso todavía no hay
    // fila a la que apuntar.
    pendingUserId: rowId('pending_user_id'),
    displayName: text('display_name'),
    locale: text('locale', { enum: ['es', 'en'] }),
    invitationHash: text('invitation_hash').references(() => invitation.codeHash, {
      onDelete: 'cascade',
    }),
    // Solo al añadir otro dispositivo: el código que se gastará si la passkey verifica.
    deviceLinkHash: text('device_link_hash').references(() => deviceLink.codeHash, {
      onDelete: 'cascade',
    }),
  },
  (table) => [
    // Los retos caducados se barren por esta columna desde el Cron Trigger.
    index('auth_challenge_expires_at_idx').on(table.expiresAt),
    // Cada tipo de ceremonia trae lo suyo: el registro, la cuenta pendiente y su invitación;
    // el enlace, la cuenta que ya existe y su código. La entrada no necesita nada más.
    check(
      'auth_challenge_ceremony_complete',
      sql`${table.kind} = 'authentication' or (${table.kind} = 'registration' and ${table.pendingUserId} is not null and ${table.displayName} is not null and ${table.locale} is not null and ${table.invitationHash} is not null) or (${table.kind} = 'device_link' and ${table.pendingUserId} is not null and ${table.deviceLinkHash} is not null)`,
    ),
  ],
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
    // Nombre normalizado (minúsculas y sin acentos) para la búsqueda difusa del catálogo.
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
export type InvitationRow = typeof invitation.$inferSelect;
export type NewInvitationRow = typeof invitation.$inferInsert;
export type PasskeyCredentialRow = typeof passkeyCredential.$inferSelect;
export type NewPasskeyCredentialRow = typeof passkeyCredential.$inferInsert;
export type DeviceLinkRow = typeof deviceLink.$inferSelect;
export type NewDeviceLinkRow = typeof deviceLink.$inferInsert;
export type AuthChallengeRow = typeof authChallenge.$inferSelect;
export type NewAuthChallengeRow = typeof authChallenge.$inferInsert;
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
