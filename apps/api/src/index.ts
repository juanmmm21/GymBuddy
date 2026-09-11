import { Hono } from 'hono';
import { purgeExpiredChallenges } from './auth/challenges';
import { CatalogSourceError } from './catalog/client';
import { recordCatalogSyncFailure, runCatalogSyncStep } from './catalog/index';
import { createDatabase } from './db/client';
import { registerErrorHandlers } from './http/error-handler';
import { adminRoute } from './routes/v1/admin';
import { authRoute } from './routes/v1/auth';
import { catalogRoute } from './routes/v1/catalog';
import { exercisesRoute } from './routes/v1/exercises';
import { healthRoute } from './routes/v1/health';
import { historyRoute } from './routes/v1/history';
import { routinesRoute } from './routes/v1/routines';
import { sessionsRoute } from './routes/v1/sessions';
import { statsRoute } from './routes/v1/stats';

// Se exporta con nombre además de por defecto: los tests necesitan inyectar un `env` a
// medida (por ejemplo, sin el secreto de administración) y `app.request` lo permite.
export const app = new Hono<{ Bindings: Env }>();

registerErrorHandlers(app);

app.route('/api/v1', healthRoute);
app.route('/api/v1', catalogRoute);
app.route('/api/v1', authRoute);
app.route('/api/v1', exercisesRoute);
app.route('/api/v1', sessionsRoute);
app.route('/api/v1', historyRoute);
app.route('/api/v1', routinesRoute);
app.route('/api/v1', statsRoute);
app.route('/api/v1', adminRoute);

/**
 * El Cron Trigger es lo que encadena la sincronización: cada disparo avanza un músculo y,
 * cuando los diecinueve están dentro, los siguientes disparos no hacen nada hasta que
 * cambie el tag del catálogo. Es la única forma de poblar 1323 ejercicios con 10 ms de CPU
 * por invocación (ver `CLAUDE.md` §4).
 */
async function scheduled(_event: ScheduledController, env: Env): Promise<void> {
  const db = createDatabase(env.DB);

  // Se barren aquí los retos de passkey caducados: cada intento de entrada deja una fila, y la
  // de quien cerró la app a mitad no se va sola. Va antes del catálogo porque es barato y no
  // debe quedarse sin hacer si el origen está caído.
  try {
    const purged = await purgeExpiredChallenges(db, new Date());
    if (purged > 0) console.log(`Retos de passkey caducados retirados: ${String(purged)}`);
  } catch (error) {
    console.error('No se pudieron retirar los retos de passkey caducados', error);
  }

  try {
    const step = await runCatalogSyncStep(db);
    if (step.syncedMuscle !== null) {
      console.log(
        `Catálogo: ${step.syncedMuscle} sincronizado (${String(step.exercisesUpserted)} ejercicios)`,
      );
    }
  } catch (error) {
    // Un fallo aquí no tiene a quién responder: si no se registra, el ciclo se queda
    // parado sin dejar rastro. El puntero no avanza, así que el próximo disparo reintenta.
    const message = error instanceof CatalogSourceError ? error.message : 'Fallo inesperado';
    console.error('Catálogo: la sincronización no pudo avanzar', error);
    await recordCatalogSyncFailure(db, message);
  }
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
