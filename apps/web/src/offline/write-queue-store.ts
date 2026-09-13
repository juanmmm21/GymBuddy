import { readSequence, type PendingWrite } from './pending-write';

/**
 * Dónde sobrevive la cola a un cierre de la app. Devuelve lo guardado sin validar: quien lee
 * decide qué hacer con una entrada de una versión vieja o dañada, no el almacén.
 */
export interface WriteQueueStore {
  loadAll(): Promise<readonly unknown[]>;
  put(entry: PendingWrite): Promise<void>;
  remove(sequence: number): Promise<void>;
}

/** Almacén en memoria: el de los tests y el respaldo de un navegador sin IndexedDB. */
export interface MemoryWriteQueueStore extends WriteQueueStore {
  /** Lo guardado ahora mismo, en orden de secuencia, para que los tests lo comprueben. */
  entries(): readonly unknown[];
}

export function createMemoryWriteQueueStore(
  initial: readonly unknown[] = [],
): MemoryWriteQueueStore {
  const saved = new Map<number, unknown>();
  initial.forEach((entry, index) => {
    saved.set(readSequence(entry) ?? -1 - index, entry);
  });

  const ordered = (): unknown[] =>
    [...saved.entries()].sort(([left], [right]) => left - right).map(([, entry]) => entry);

  return {
    loadAll: () => Promise.resolve(ordered()),
    put: (entry) => {
      saved.set(entry.sequence, entry);
      return Promise.resolve();
    },
    remove: (sequence) => {
      saved.delete(sequence);
      return Promise.resolve();
    },
    entries: ordered,
  };
}

const DATABASE_NAME = 'gymbuddy-offline';
const DATABASE_VERSION = 1;
const STORE_NAME = 'pending-writes';

/**
 * La cola en IndexedDB y no en `localStorage`: sobrevive igual a cerrar la app, pero no bloquea
 * el hilo al escribir y Safari no la vacía por llenar los cinco megas de `localStorage` con
 * otras cosas. La base se abre la primera vez que se usa, no al importar el módulo.
 */
export function createIndexedDbWriteQueueStore(factory: IDBFactory): WriteQueueStore {
  let opening: Promise<IDBDatabase> | null = null;
  const database = (): Promise<IDBDatabase> => {
    opening ??= openDatabase(factory).catch((error: unknown) => {
      // Un fallo al abrir (modo privado, cuota) no se queda cacheado: el siguiente uso lo reintenta.
      opening = null;
      throw error;
    });
    return opening;
  };

  return {
    loadAll: async () => {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      // `getAll` devuelve en orden de clave, y la clave es la secuencia: sale ya ordenado.
      const entries = await requestResult<unknown[]>(transaction.objectStore(STORE_NAME).getAll());
      return entries;
    },
    put: async (entry) => {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(entry);
      await transactionDone(transaction);
    },
    remove: async (sequence) => {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(sequence);
      await transactionDone(transaction);
    },
  };
}

/** IndexedDB si el navegador la tiene; si no, la cola funciona igual mientras la app siga abierta. */
export function createBrowserWriteQueueStore(): WriteQueueStore {
  if (typeof indexedDB === 'undefined') {
    console.error(
      'Este navegador no tiene IndexedDB: la cola offline no sobrevivirá a cerrar la app',
    );
    return createMemoryWriteQueueStore();
  }
  return createIndexedDbWriteQueueStore(indexedDB);
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sequence' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('No se pudo abrir la base de la cola offline'));
    };
    // Otra pestaña con una versión vieja abierta: sin esto, la apertura se quedaría esperando.
    request.onblocked = () => {
      reject(new Error('La base de la cola offline está bloqueada por otra pestaña'));
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Falló una lectura de la cola offline'));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Falló una escritura de la cola offline'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Se abortó una escritura de la cola offline'));
    };
  });
}
