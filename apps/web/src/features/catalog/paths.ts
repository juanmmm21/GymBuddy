import { bodyPartSchema, muscleSchema, type BodyPart, type Muscle } from '@gymbuddy/shared';

export const CATALOG_PATH = '/catalog';

export function bodyPartPath(bodyPart: BodyPart): string {
  return `${CATALOG_PATH}/${bodyPart}`;
}

export interface CatalogExerciseRef {
  readonly muscle: Muscle;
  readonly slug: string;
}

/**
 * El `catalogId` del contrato es "{muscle}/{slug}". Se parte en la primera barra: el
 * músculo se valida contra el enum y el slug es lo que quede, sea lo que sea.
 */
export function splitCatalogId(catalogId: string): CatalogExerciseRef | null {
  const separator = catalogId.indexOf('/');
  if (separator <= 0 || separator === catalogId.length - 1) return null;

  const muscle = parseMuscle(catalogId.slice(0, separator));
  if (muscle === null) return null;

  return { muscle, slug: catalogId.slice(separator + 1) };
}

/**
 * La referencia de un ejercicio que ya viene con su músculo. Si el `catalogId` no tuviera
 * la forma esperada, el músculo del propio ejercicio manda y el identificador entero hace
 * de slug: el enlace se construye siempre, y el Worker responderá 404 si no existe.
 */
export function catalogExerciseRef(exercise: {
  readonly catalogId: string;
  readonly muscle: Muscle;
}): CatalogExerciseRef {
  return (
    splitCatalogId(exercise.catalogId) ?? { muscle: exercise.muscle, slug: exercise.catalogId }
  );
}

export function catalogExercisePath(ref: CatalogExerciseRef): string {
  return `${CATALOG_PATH}/${ref.muscle}/${encodeURIComponent(ref.slug)}`;
}

/** Un segmento de la URL escrito a mano no tiene por qué ser una parte del cuerpo. */
export function parseBodyPart(value: string | undefined): BodyPart | null {
  const parsed = bodyPartSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseMuscle(value: string | undefined): Muscle | null {
  const parsed = muscleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
