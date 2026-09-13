import type { ResourceId } from '@gymbuddy/shared';
import {
  pendingWriteSchema,
  readSequence,
  type PendingWrite,
  type SessionWrite,
} from './pending-write';
import { handleWriteFailure } from './send-write';
import type { WriteQueueStore } from './write-queue-store';

/** Cómo terminó una escritura pedida desde la pantalla. */
export type SubmitOutcome<T> =
  { readonly status: 'sent'; readonly response: T } | { readonly status: 'queued' };

/** Una escritura que el Worker rechazó al drenarla y que ya no está en la cola. */
export interface DroppedWrite {
  readonly sequence: number;
  readonly userId: ResourceId;
  readonly write: SessionWrite;
  readonly error: unknown;
}

export interface WriteQueueSnapshot {
  /** Lo que espera, de todas las cuentas del dispositivo y en orden de envío. */
  readonly pending: readonly PendingWrite[];
  readonly dropped: readonly DroppedWrite[];
}

export interface DrainReport {
  readonly sent: number;
  readonly dropped: number;
}

/** Con qué cuenta y por qué cliente se drena: lo pone la app al tener sesión. */
export interface WriteQueueConnection {
  readonly userId: ResourceId;
  readonly send: (write: SessionWrite) => Promise<unknown>;
  /** Algo entró o se descartó: los datos que pinta la app ya no son los del Worker. */
  readonly onSettled: (report: DrainReport) => void;
}

export interface WriteQueueOptions {
  readonly store: WriteQueueStore;
  readonly now?: () => Date;
}

/**
 * La cola de escrituras de la sesión. Con red y nada pendiente, una escritura sale directa y la
 * pantalla ve la respuesta como siempre; sin red, o con algo esperando delante, se guarda y se
 * manda después **en el mismo orden**, porque una serie no puede llegar antes que la apertura
 * de su sesión.
 *
 * Es un store externo (`subscribe` / `getSnapshot`) para que React la lea con
 * `useSyncExternalStore`, igual que el reloj: nada de copiarla a un estado desde un efecto.
 */
export class WriteQueue {
  private readonly store: WriteQueueStore;
  private readonly now: () => Date;
  private readonly listeners = new Set<() => void>();
  private snapshot: WriteQueueSnapshot = { pending: [], dropped: [] };
  private nextSequence = 0;
  private connection: WriteQueueConnection | null = null;
  private draining: Promise<DrainReport> | null = null;
  /** Lo guardado en el dispositivo, leído una vez. Nada se encola ni se drena antes. */
  readonly ready: Promise<void>;

  constructor({ store, now = () => new Date() }: WriteQueueOptions) {
    this.store = store;
    this.now = now;
    this.ready = this.restore();
  }

  // Propiedades y no métodos: `useSyncExternalStore` las recibe sueltas, sin su objeto.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WriteQueueSnapshot => this.snapshot;

  /** La app la conecta al tener sesión y la desconecta al cerrarla; devuelve cómo desconectar. */
  connect(connection: WriteQueueConnection): () => void {
    this.connection = connection;
    return () => {
      if (this.connection === connection) this.connection = null;
    };
  }

  /**
   * Pide una escritura. `direct` es la misma escritura contra el Worker, con su respuesta tipada:
   * solo se usa si no hay nada esperando delante. Un fallo que se arregla esperando (sin red, el
   * servidor caído) la encola; un rechazo del Worker se lanza para que la pantalla lo enseñe.
   */
  async submit<T>(write: SessionWrite, direct: () => Promise<T>): Promise<SubmitOutcome<T>> {
    const { userId } = this.requireConnection();
    await this.ready;

    if (this.pendingFor(userId).length > 0) {
      await this.enqueue(userId, write);
      void this.drain();
      return { status: 'queued' };
    }

    try {
      return { status: 'sent', response: await direct() };
    } catch (error) {
      if (handleWriteFailure(error) !== 'retry_later') throw error;
      await this.enqueue(userId, write);
      return { status: 'queued' };
    }
  }

  /**
   * Manda lo pendiente de la cuenta conectada, de una en una y en orden. Se para en el primer
   * fallo que se arregla esperando —lo de detrás depende de él— y retira con aviso lo que el
   * Worker rechaza. Si ya hay un drenado en marcha devuelve ese: dos a la vez mandarían dos
   * veces la misma escritura.
   */
  drain(): Promise<DrainReport> {
    this.draining ??= this.runDrain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  /** Quien entrena ya ha leído el aviso de una escritura rechazada. */
  dismiss(sequence: number): void {
    this.update({
      ...this.snapshot,
      dropped: this.snapshot.dropped.filter((dropped) => dropped.sequence !== sequence),
    });
  }

  private async runDrain(): Promise<DrainReport> {
    await this.ready;
    const userId = this.connection?.userId;
    if (userId === undefined) return { sent: 0, dropped: 0 };

    let sent = 0;
    let dropped = 0;
    for (;;) {
      // Se relee en cada vuelta: un token renovado cambia el cliente, y otra cuenta corta el drenado.
      const connection = this.connection;
      if (connection?.userId !== userId) break;
      const next = this.pendingFor(userId)[0];
      if (next === undefined) break;

      try {
        await connection.send(next.write);
        sent += 1;
      } catch (error) {
        const handling = handleWriteFailure(error);
        if (handling === 'retry_later') break;
        if (handling === 'discard') {
          console.error('La cola offline descarta una escritura rechazada', next.write.kind, error);
          this.update({
            ...this.snapshot,
            dropped: [
              ...this.snapshot.dropped,
              { sequence: next.sequence, userId, write: next.write, error },
            ],
          });
          dropped += 1;
        } else {
          sent += 1;
        }
      }
      await this.settle(next);
    }

    const report = { sent, dropped };
    if (sent + dropped > 0) this.connection?.onSettled(report);
    return report;
  }

  private pendingFor(userId: ResourceId): PendingWrite[] {
    return this.snapshot.pending.filter((entry) => entry.userId === userId);
  }

  private requireConnection(): WriteQueueConnection {
    if (this.connection === null) {
      throw new Error('No se puede escribir sin sesión: la cola offline no está conectada');
    }
    return this.connection;
  }

  private async enqueue(userId: ResourceId, write: SessionWrite): Promise<void> {
    const entry: PendingWrite = {
      sequence: this.nextSequence,
      userId,
      queuedAt: this.now().toISOString(),
      write,
    };
    this.nextSequence += 1;
    this.update({ ...this.snapshot, pending: [...this.snapshot.pending, entry] });

    try {
      await this.store.put(entry);
    } catch (error) {
      // Se queda en memoria y se enviará mientras la app siga abierta; solo se perdería al cerrarla.
      console.error('No se pudo guardar en el dispositivo una escritura pendiente', error);
    }
  }

  private async settle(entry: PendingWrite): Promise<void> {
    this.update({
      ...this.snapshot,
      pending: this.snapshot.pending.filter((pending) => pending.sequence !== entry.sequence),
    });

    try {
      await this.store.remove(entry.sequence);
    } catch (error) {
      // Si sobrevive en el disco se reenviará al abrir la app, y el reenvío no duplica nada.
      console.error('No se pudo retirar del dispositivo una escritura ya resuelta', error);
    }
  }

  private async restore(): Promise<void> {
    let saved: readonly unknown[];
    try {
      saved = await this.store.loadAll();
    } catch (error) {
      console.error('No se pudo leer la cola offline guardada en el dispositivo', error);
      return;
    }

    const pending: PendingWrite[] = [];
    for (const raw of saved) {
      const parsed = pendingWriteSchema.safeParse(raw);
      if (parsed.success) {
        pending.push(parsed.data);
      } else {
        // Una entrada de otra versión de la app o dañada no se puede mandar: se enseña en consola y
        // se deja en el disco, por si una versión que sí la entienda llega a leerla.
        console.error('Escritura pendiente ilegible en la cola offline', parsed.error.issues);
      }
    }

    pending.sort((left, right) => left.sequence - right.sequence);
    // También cuentan las ilegibles: la secuencia es la clave en el disco y una nueva la pisaría.
    const usedSequences = saved.map(readSequence).filter((sequence) => sequence !== null);
    this.nextSequence = Math.max(this.nextSequence, ...usedSequences.map((used) => used + 1));
    this.update({ ...this.snapshot, pending: [...pending, ...this.snapshot.pending] });
  }

  private update(next: WriteQueueSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
