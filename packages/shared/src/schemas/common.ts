import { z } from 'zod';
import { API_VOLUME_PATTERN, API_WEIGHT_PATTERN } from '../domain/units';

/**
 * Identificador de fila. Lo genera quien crea el recurso —también la PWA sin red— para
 * que reenviar la misma escritura no acabe creando dos filas.
 */
export const resourceIdSchema = z.uuid();

/** Momento en ISO 8601 con zona explícita. En almacenamiento siempre es UTC. */
export const isoDatetimeSchema = z.iso.datetime({ offset: true });

/**
 * Peso en kilogramos con dos decimales ("82.50"). Viaja como cadena porque un número
 * JSON obligaría a la PWA a hacer aritmética en coma flotante con el peso.
 */
export const weightKilogramsSchema = z.string().regex(API_WEIGHT_PATTERN, {
  message: 'El peso debe ir en kilogramos con dos decimales, por ejemplo "82.50"',
});

/**
 * Magnitud acumulada en kilogramos, con los mismos dos decimales que un peso pero más
 * cifras enteras: el volumen es peso × repeticiones y no cabe en el rango de un peso.
 */
export const volumeKilogramsSchema = z.string().regex(API_VOLUME_PATTERN, {
  message: 'El volumen debe ir en kilogramos con dos decimales, por ejemplo "1320.00"',
});

/** Superficie desde la que se escribió el dato: la PWA o el bot. */
export const entrySourceSchema = z.enum(['web', 'bot']);

export const localeSchema = z.enum(['es', 'en']);
export const unitSystemSchema = z.enum(['metric', 'imperial']);

/** Esfuerzo percibido, de 1 a 10 en pasos de media unidad. */
export const rpeSchema = z.number().min(1).max(10).multipleOf(0.5);

export type ResourceId = z.infer<typeof resourceIdSchema>;
export type IsoDatetime = z.infer<typeof isoDatetimeSchema>;
export type WeightKilograms = z.infer<typeof weightKilogramsSchema>;
export type VolumeKilograms = z.infer<typeof volumeKilogramsSchema>;
export type EntrySource = z.infer<typeof entrySourceSchema>;
export type Locale = z.infer<typeof localeSchema>;
export type UnitSystem = z.infer<typeof unitSystemSchema>;
