import { DurableObject } from 'cloudflare:workers';
import { createDatabase } from '../db/client';
import { deliverRestNotice, type ScheduledRestNotice } from './rest-notice';

const NOTICE_KEY = 'notice';

/**
 * La alarma del descanso de UNA cuenta (ADR 0009): el id sale del usuario, así que programar otra vez
 * pisa la anterior y nunca suenan dos. Es un Durable Object porque es lo único del plan gratuito que
 * despierta al Worker a un segundo concreto; el Cron va de cinco en cinco minutos.
 */
export class RestNoticeAlarm extends DurableObject<Env> {
  /** Programa o reprograma el aviso. Dos escrituras: el aviso guardado y la alarma. */
  async schedule(notice: ScheduledRestNotice): Promise<void> {
    await this.ctx.storage.put(NOTICE_KEY, notice);
    await this.ctx.storage.setAlarm(Date.parse(notice.endsAt));
  }

  /** Quita el aviso pendiente. Sin nada programado no hace nada. */
  async cancel(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete(NOTICE_KEY);
  }

  /** Lo pendiente, o `null`. Solo lo leen los tests y los logs. */
  async pending(): Promise<ScheduledRestNotice | null> {
    return (await this.ctx.storage.get<ScheduledRestNotice>(NOTICE_KEY)) ?? null;
  }

  override async alarm(): Promise<void> {
    const notice = await this.pending();
    if (notice === null) return;

    // Se olvida ANTES de mandar: si la alarma lanzase, Cloudflare la reintentaría y el mismo
    // descanso avisaría dos veces, o un minuto tarde.
    await this.ctx.storage.delete(NOTICE_KEY);

    try {
      const outcome = await deliverRestNotice(createDatabase(this.env.DB), this.env, notice, {
        now: new Date(),
        fetchImpl: fetch,
      });
      if (outcome.kind === 'skipped') {
        console.log(`Aviso de descanso no mandado: ${outcome.reason}`);
      } else if (outcome.failed > 0) {
        console.error(
          `Aviso de descanso: ${String(outcome.delivered)} entregados, ${String(outcome.failed)} fallidos`,
        );
      }
    } catch (error) {
      // Un fallo de la D1 no se reintenta por la misma razón: el aviso llegaría a destiempo.
      console.error('El aviso de descanso no se pudo mandar', error);
    }
  }
}
