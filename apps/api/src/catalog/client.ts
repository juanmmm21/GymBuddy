import type { Locale, Muscle } from '@gymbuddy/shared';
import type { ZodType } from 'zod';
import {
  CATALOG_BASE_URL,
  sourceMuscleFileSchema,
  sourceMuscleIndexSchema,
  type SourceMuscleFile,
  type SourceMuscleIndex,
} from './source';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 250;
/** Cortar por lo sano: jsDelivr sirve estos ficheros desde caché en decenas de ms. */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Cómo hablar con el origen. `fetchImpl` y `sleep` se inyectan porque ningún test toca la
 * red ni espera de verdad: los tests pasan un `fetch` de mentira y un `sleep` inmediato.
 */
export interface CatalogClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly maxAttempts?: number;
  readonly initialBackoffMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** El origen no dio una respuesta usable. Es un fallo de terceros, no del Worker. */
export class CatalogSourceError extends Error {
  readonly url: string;
  readonly attempts: number;

  constructor(message: string, url: string, attempts: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogSourceError';
    this.url = url;
    this.attempts = attempts;
  }
}

export function muscleFileUrl(muscle: Muscle, locale: Locale): string {
  return `${CATALOG_BASE_URL}/api/${locale}/muscles/${muscle}.json`;
}

export function muscleIndexUrl(locale: Locale): string {
  return `${CATALOG_BASE_URL}/api/${locale}/muscles.json`;
}

/** Los ejercicios de un músculo en un idioma. Es la unidad que sincroniza cada invocación. */
export async function fetchMuscleFile(
  muscle: Muscle,
  locale: Locale,
  options: CatalogClientOptions = {},
): Promise<SourceMuscleFile> {
  return fetchCatalogJson(muscleFileUrl(muscle, locale), sourceMuscleFileSchema, options);
}

/** El índice de músculos con su recuento. Sirve para comprobar el origen sin descargarlo entero. */
export async function fetchMuscleIndex(
  locale: Locale,
  options: CatalogClientOptions = {},
): Promise<SourceMuscleIndex> {
  return fetchCatalogJson(muscleIndexUrl(locale), sourceMuscleIndexSchema, options);
}

/**
 * Descarga y valida un fichero del catálogo, reintentando con backoff exponencial.
 * Solo se reintenta lo que puede arreglarse solo —un corte de red, un 5xx, un 429—; un 404
 * o un JSON que no cumple el contrato es definitivo y reintentarlo solo gasta invocaciones.
 */
async function fetchCatalogJson<T>(
  url: string,
  schema: ZodType<T>,
  options: CatalogClientOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: CatalogSourceError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      lastError = new CatalogSourceError(
        `No se pudo contactar con el catálogo en ${url}`,
        url,
        attempt,
        { cause },
      );
      if (attempt === maxAttempts) break;
      await sleep(backoffFor(attempt, initialBackoffMs));
      continue;
    }

    if (!response.ok) {
      const error = new CatalogSourceError(
        `El catálogo respondió ${String(response.status)} en ${url}`,
        url,
        attempt,
      );
      // Un 404 o un 403 no cambian por insistir: el fichero no está donde creemos.
      if (!isRetriableStatus(response.status)) throw error;

      lastError = error;
      if (attempt === maxAttempts) break;
      await sleep(backoffFor(attempt, initialBackoffMs));
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      // El cuerpo llegó cortado o no era JSON: puede ser un fallo de transporte, se reintenta.
      lastError = new CatalogSourceError(
        `El catálogo devolvió un cuerpo ilegible en ${url}`,
        url,
        attempt,
        { cause },
      );
      if (attempt === maxAttempts) break;
      await sleep(backoffFor(attempt, initialBackoffMs));
      continue;
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new CatalogSourceError(
        `El catálogo devolvió una estructura fuera de contrato en ${url}`,
        url,
        attempt,
        { cause: parsed.error },
      );
    }

    return parsed.data;
  }

  throw lastError ?? new CatalogSourceError(`El catálogo no respondió en ${url}`, url, maxAttempts);
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function backoffFor(attempt: number, initialBackoffMs: number): number {
  return initialBackoffMs * 2 ** (attempt - 1);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
