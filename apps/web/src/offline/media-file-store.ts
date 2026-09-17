import { z } from 'zod';

/** Lo que ocupa un fichero guardado y cuándo se miró por última vez, sin cargar el fichero. */
export interface MediaFileUsage {
  readonly mediaId: string;
  readonly bytes: number;
  /** Milisegundos desde la época: basta para ordenar y no depende de zonas horarias. */
  readonly lastUsedAt: number;
}

/**
 * Dónde se quedan las fotos y los vídeos de la técnica ya vistos para abrirlos sin red. La clave es
 * el id del medio: cada subida tiene uno nuevo y su contenido no cambia nunca, así que lo guardado
 * no caduca por viejo, solo se retira para hacer sitio o cuando el medio deja de existir.
 */
export interface MediaFileStore {
  /** El fichero guardado, o `null` si no está (o lo guardado no se puede leer). */
  read(mediaId: string): Promise<Blob | null>;
  usage(): Promise<readonly MediaFileUsage[]>;
  /** Guarda el fichero, o lo sustituye si ya estaba, marcándolo como usado en `usedAt`. */
  write(mediaId: string, file: Blob, usedAt: number): Promise<void>;
  markUsed(mediaId: string, usedAt: number): Promise<void>;
  /** Quitar lo que no está no falla. */
  remove(mediaIds: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

/** Almacén en memoria: el de los tests y el respaldo de un navegador sin IndexedDB. */
export interface MemoryMediaFileStore extends MediaFileStore {
  /** Los ids guardados ahora mismo, para que los tests lo comprueben. */
  mediaIds(): readonly string[];
}

export function createMemoryMediaFileStore(): MemoryMediaFileStore {
  const files = new Map<string, { readonly file: Blob; readonly lastUsedAt: number }>();

  return {
    read: (mediaId) => Promise.resolve(files.get(mediaId)?.file ?? null),
    usage: () =>
      Promise.resolve(
        [...files.entries()].map(([mediaId, saved]) => ({
          mediaId,
          bytes: saved.file.size,
          lastUsedAt: saved.lastUsedAt,
        })),
      ),
    write: (mediaId, file, usedAt) => {
      files.set(mediaId, { file, lastUsedAt: usedAt });
      return Promise.resolve();
    },
    markUsed: (mediaId, usedAt) => {
      const saved = files.get(mediaId);
      if (saved !== undefined) files.set(mediaId, { ...saved, lastUsedAt: usedAt });
      return Promise.resolve();
    },
    remove: (mediaIds) => {
      for (const mediaId of mediaIds) files.delete(mediaId);
      return Promise.resolve();
    },
    clear: () => {
      files.clear();
      return Promise.resolve();
    },
    mediaIds: () => [...files.keys()],
  };
}

const DATABASE_NAME = 'gymbuddy-media';
const DATABASE_VERSION = 1;
/** Los bytes van aparte del uso: repartir sitio lee todo el uso y no puede cargar cada vídeo. */
const FILES_STORE = 'files';
const USAGE_STORE = 'usage';

const storedUsageSchema = z.object({
  mediaId: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  lastUsedAt: z.number().finite(),
});

/**
 * Los bytes se reconocen por su etiqueta y no con `instanceof`: IndexedDB devuelve el búfer creado
 * en su propio contexto, y en los tests (jsdom sobre Node) ese `ArrayBuffer` no es el global.
 */
const arrayBufferSchema = z.custom<ArrayBuffer>(
  (value) => Object.prototype.toString.call(value) === '[object ArrayBuffer]',
  { message: 'Se esperaban los bytes del fichero' },
);

const storedFileSchema = z.object({
  mediaId: z.string().min(1),
  contentType: z.string(),
  data: arrayBufferSchema,
});

/**
 * Los medios en IndexedDB: un vídeo de 11 MB no cabe en `localStorage`, y la caché del service
 * worker solo sabe limitar por número de entradas, no por megas. Se guardan los bytes
 * (`ArrayBuffer`) y no el `Blob`: Safari ha fallado en varias versiones al guardar un `Blob` en
 * IndexedDB, y un `ArrayBuffer` se clona igual en todos los navegadores. La base se abre la primera
 * vez que se usa, no al importar el módulo.
 */
export function createIndexedDbMediaFileStore(factory: IDBFactory): MediaFileStore {
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
    read: async (mediaId) => {
      const db = await database();
      const transaction = db.transaction(FILES_STORE, 'readonly');
      const raw = await requestResult<unknown>(transaction.objectStore(FILES_STORE).get(mediaId));
      if (raw === undefined) return null;

      const parsed = storedFileSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('Un medio guardado en el dispositivo no se puede leer', parsed.error);
        return null;
      }
      return new Blob([parsed.data.data], { type: parsed.data.contentType });
    },
    usage: async () => {
      const db = await database();
      const transaction = db.transaction(USAGE_STORE, 'readonly');
      const raw = await requestResult<unknown[]>(transaction.objectStore(USAGE_STORE).getAll());
      return raw.flatMap((entry) => {
        const parsed = storedUsageSchema.safeParse(entry);
        if (parsed.success) return [parsed.data];
        console.error('Se ignora un uso de medio guardado que no se puede leer', parsed.error);
        return [];
      });
    },
    write: async (mediaId, file, usedAt) => {
      // Los bytes se leen antes de abrir la transacción: esperar dentro de ella la cerraría.
      const data = await file.arrayBuffer();
      const db = await database();
      const transaction = db.transaction([FILES_STORE, USAGE_STORE], 'readwrite');
      transaction.objectStore(FILES_STORE).put({ mediaId, contentType: file.type, data });
      transaction
        .objectStore(USAGE_STORE)
        .put({ mediaId, bytes: data.byteLength, lastUsedAt: usedAt });
      await transactionDone(transaction);
    },
    markUsed: async (mediaId, usedAt) => {
      const db = await database();
      const transaction = db.transaction(USAGE_STORE, 'readwrite');
      const usage = transaction.objectStore(USAGE_STORE);
      const request = usage.get(mediaId);
      // Dentro de la misma transacción: si entretanto se retiró el fichero, no resucita su uso.
      request.onsuccess = () => {
        const parsed = storedUsageSchema.safeParse(request.result);
        if (parsed.success) usage.put({ ...parsed.data, lastUsedAt: usedAt });
      };
      await transactionDone(transaction);
    },
    remove: async (mediaIds) => {
      if (mediaIds.length === 0) return;
      const db = await database();
      const transaction = db.transaction([FILES_STORE, USAGE_STORE], 'readwrite');
      for (const mediaId of mediaIds) {
        transaction.objectStore(FILES_STORE).delete(mediaId);
        transaction.objectStore(USAGE_STORE).delete(mediaId);
      }
      await transactionDone(transaction);
    },
    clear: async () => {
      const db = await database();
      const transaction = db.transaction([FILES_STORE, USAGE_STORE], 'readwrite');
      transaction.objectStore(FILES_STORE).clear();
      transaction.objectStore(USAGE_STORE).clear();
      await transactionDone(transaction);
    },
  };
}

/** IndexedDB si el navegador la tiene; si no, lo visto se guarda solo mientras la app siga abierta. */
export function createBrowserMediaFileStore(): MediaFileStore {
  if (typeof indexedDB === 'undefined') {
    console.error(
      'Este navegador no tiene IndexedDB: las fotos y los vídeos no se podrán ver sin red',
    );
    return createMemoryMediaFileStore();
  }
  return createIndexedDbMediaFileStore(indexedDB);
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'mediaId' });
      }
      if (!db.objectStoreNames.contains(USAGE_STORE)) {
        db.createObjectStore(USAGE_STORE, { keyPath: 'mediaId' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('No se pudo abrir la base de los medios guardados'));
    };
    // Otra pestaña con una versión vieja abierta: sin esto, la apertura se quedaría esperando.
    request.onblocked = () => {
      reject(new Error('La base de los medios guardados está bloqueada por otra pestaña'));
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Falló una lectura de los medios guardados'));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Falló una escritura de los medios guardados'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Se abortó una escritura de los medios guardados'));
    };
  });
}
