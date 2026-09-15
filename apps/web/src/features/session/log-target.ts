import type { ResourceId, SetEntry } from '@gymbuddy/shared';
import type { RoutineProgress } from './routine-progress';
import { latestSet } from './summary';

/**
 * Con qué ejercicio se abre «Registrar serie»; `null` deja que la hoja elija el primero de la
 * lista. Manda la línea que toca de la rutina, porque seguir el guion es el motivo de llevarla.
 * Sin rutina —o con la rutina ya terminada— manda el ejercicio de la última serie de la sesión,
 * calentamiento incluido: entre serie y serie casi siempre se repite, y ofrecer otro es la
 * forma más fácil de apuntar una serie en el ejercicio equivocado. El de la URL (llegar desde
 * la ficha) solo decide mientras la sesión no tiene series: en cuanto hay una, ya se sabe qué
 * se está haciendo, aunque la dirección siga diciendo el ejercicio con el que se llegó.
 */
export function logExerciseIdFor(
  progress: RoutineProgress | null,
  sets: readonly SetEntry[],
  requestedExerciseId: ResourceId | null,
): ResourceId | null {
  const routineExerciseId = progress?.current?.item.trackedExerciseId;
  if (routineExerciseId !== undefined) return routineExerciseId;

  return latestSet(sets)?.trackedExerciseId ?? requestedExerciseId;
}
