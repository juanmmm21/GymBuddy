import {
  bodyPartSchema,
  catalogEquipmentSchema,
  isMuscleInBodyPart,
  muscleSchema,
  musclesOfBodyPart,
  type BodyPart,
  type CatalogFilters,
  type CatalogSearchFilters,
} from '@gymbuddy/shared';
import type { SelectOption } from '../../components/index';
import { BODY_PART_LABELS, BODY_PART_ORDER, MUSCLE_LABELS, equipmentLabel } from './labels';

/** El valor de «sin filtro» en un desplegable: un `select` nativo no admite `undefined`. */
export const NO_FILTER = '';

/**
 * Los nombres de los parámetros de los filtros en la URL. `bodyPart` solo lo lee la búsqueda: la
 * página de una parte ya la lleva en la ruta.
 */
export const FILTER_PARAMS = {
  bodyPart: 'bodyPart',
  equipment: 'equipment',
  muscle: 'muscle',
} as const;

export type CatalogFilterKey = keyof CatalogSearchFilters;

/**
 * Los valores de `equipment` del tag `v1.1.0` (comprobados contra el CDN, los mismos que traduce
 * `labels.ts`), en el orden en que se buscan en un gimnasio: primero peso libre y máquinas, lo raro
 * al final. «Máquina» es el grupo de `EQUIPMENT_FILTER_GROUPS` y ya abarca `lever`, así que
 * «Máquina de palanca» no se ofrece aparte: al lado de «Máquina» parecía otra cosa. Multipower y
 * prensa sí, como filtros más estrechos. El contrato no los cierra; si una versión nueva trae otro,
 * no sale aquí hasta añadirlo, pero la API lo filtraría igual.
 */
export const EQUIPMENT_FILTER_ORDER: readonly string[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'smith',
  'sled',
  'ez-bar',
  'kettlebell',
  'band',
  'bodyweight',
  'other',
];

export function equipmentFilterOptions(): SelectOption[] {
  return [
    { value: NO_FILTER, label: 'Todo' },
    ...EQUIPMENT_FILTER_ORDER.map((equipment) => ({
      value: equipment,
      label: equipmentLabel(equipment),
    })),
  ];
}

/** Las siete partes del cuerpo en el orden del catálogo: solo se ofrecen en la búsqueda. */
export function bodyPartFilterOptions(): SelectOption[] {
  return [
    { value: NO_FILTER, label: 'Todas' },
    ...BODY_PART_ORDER.map((part) => ({ value: part, label: BODY_PART_LABELS[part] })),
  ];
}

/**
 * Los músculos que tiene sentido ofrecer. Dentro de una parte del cuerpo, solo los suyos (el Worker
 * rechaza uno de otra); en la búsqueda, los diecinueve agrupados por parte, que es como se piensan.
 */
export function muscleFilterOptions(bodyPart: BodyPart | null): SelectOption[] {
  const all: SelectOption = { value: NO_FILTER, label: 'Todos' };
  if (bodyPart !== null) {
    return [
      all,
      ...musclesOfBodyPart(bodyPart).map((muscle) => ({
        value: muscle,
        label: MUSCLE_LABELS[muscle],
      })),
    ];
  }

  return [
    all,
    ...BODY_PART_ORDER.flatMap((part) =>
      musclesOfBodyPart(part).map((muscle) => ({
        value: muscle,
        label: MUSCLE_LABELS[muscle],
        group: BODY_PART_LABELS[part],
      })),
    ),
  ];
}

/** Hombros, core y cardio tienen un solo músculo: filtrar por él no recortaría nada. */
export function offersMuscleFilter(bodyPart: BodyPart | null): boolean {
  return bodyPart === null || musclesOfBodyPart(bodyPart).length > 1;
}

/**
 * Los filtros que trae una URL. Un valor escrito a mano que no es del contrato, o un músculo de
 * otra parte del cuerpo, se ignora en vez de mandarlo: la pantalla enseñaría un error por un
 * enlace viejo cuando basta con no filtrar.
 */
export function parseCatalogFilters(
  params: URLSearchParams,
  bodyPart: BodyPart | null,
): CatalogFilters {
  const filters: CatalogFilters = {};

  const equipment = catalogEquipmentSchema.safeParse(params.get(FILTER_PARAMS.equipment));
  if (equipment.success) filters.equipment = equipment.data;

  const muscle = muscleSchema.safeParse(params.get(FILTER_PARAMS.muscle));
  if (muscle.success && isMuscleInBodyPart(muscle.data, bodyPart)) filters.muscle = muscle.data;

  return filters;
}

/**
 * Los filtros de la búsqueda que trae una URL: los de una parte del cuerpo más la propia parte. Un
 * músculo que contradice la parte, o que esa parte ya no ofrece, se suelta igual que al elegirla en
 * el desplegable (`withCatalogFilter`): un enlace no puede pedir lo que la barra no dejaría pedir.
 */
export function parseCatalogSearchFilters(params: URLSearchParams): CatalogSearchFilters {
  const bodyPart = bodyPartSchema.safeParse(params.get(FILTER_PARAMS.bodyPart));
  if (!bodyPart.success) return parseCatalogFilters(params, null);

  const filters: CatalogSearchFilters = {
    ...parseCatalogFilters(params, bodyPart.data),
    bodyPart: bodyPart.data,
  };
  if (!offersMuscleFilter(bodyPart.data)) delete filters.muscle;
  return filters;
}

/**
 * Cambia un filtro a partir del valor de su desplegable. Elegir «Todo» quita la clave en vez de
 * dejarla vacía: así la clave de caché y la URL de «sin filtro» son siempre las mismas. Cambiar de
 * parte del cuerpo suelta el músculo si no es de la nueva, o si la nueva ya no ofrece el desplegable
 * del músculo: un filtro que no se ve no puede seguir recortando la lista, y el Worker rechaza la
 * contradicción.
 */
export function withCatalogFilter(
  filters: CatalogSearchFilters,
  key: CatalogFilterKey,
  value: string,
): CatalogSearchFilters {
  const next = { ...filters };
  if (key === 'equipment') {
    const parsed = catalogEquipmentSchema.safeParse(value);
    if (parsed.success) next.equipment = parsed.data;
    else delete next.equipment;
  } else if (key === 'muscle') {
    const parsed = muscleSchema.safeParse(value);
    if (parsed.success) next.muscle = parsed.data;
    else delete next.muscle;
  } else {
    const parsed = bodyPartSchema.safeParse(value);
    if (parsed.success) next.bodyPart = parsed.data;
    else delete next.bodyPart;

    const part = next.bodyPart ?? null;
    if (!isMuscleInBodyPart(next.muscle, part) || !offersMuscleFilter(part)) delete next.muscle;
  }

  return next;
}

/** Escribe los filtros en la URL conservando cualquier otro parámetro que ya hubiera. */
export function applyCatalogFiltersToParams(
  params: URLSearchParams,
  filters: CatalogSearchFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.values(FILTER_PARAMS)) {
    const value = filters[key];
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

export function hasCatalogFilters(filters: CatalogSearchFilters): boolean {
  return (
    filters.bodyPart !== undefined ||
    filters.equipment !== undefined ||
    filters.muscle !== undefined
  );
}

/**
 * «Polea · Dorsales»: lo que se nombra en el aviso cuando los filtros lo dejan todo fuera. La parte
 * del cuerpo solo se nombra sin músculo: «Polea · Espalda · Dorsales» repetiría lo que ya dice el
 * músculo.
 */
export function describeCatalogFilters(filters: CatalogSearchFilters): string {
  const parts: string[] = [];
  if (filters.equipment !== undefined) parts.push(equipmentLabel(filters.equipment));
  if (filters.muscle !== undefined) parts.push(MUSCLE_LABELS[filters.muscle]);
  else if (filters.bodyPart !== undefined) parts.push(BODY_PART_LABELS[filters.bodyPart]);
  return parts.join(' · ');
}
