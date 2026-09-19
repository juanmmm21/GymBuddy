import type { ResourceId } from '@gymbuddy/shared';
import { useState } from 'react';

const NONE: ReadonlySet<ResourceId> = new Set();

/** Los ids de `current` que no estaban entre los conocidos. */
export function addedIds(
  known: ReadonlySet<ResourceId>,
  current: readonly ResourceId[],
): readonly ResourceId[] {
  return current.filter((id) => !known.has(id));
}

interface SeenSets {
  /** Todo lo que ya se ha pintado alguna vez; nada de esto vuelve a entrar resaltado. */
  readonly known: ReadonlySet<ResourceId>;
  readonly fresh: ReadonlySet<ResourceId>;
}

/**
 * Cuáles de esas series acaban de aparecer en la lista. Sirve para resaltar la que se acaba de
 * apuntar, y se decide **solo con los ids que ya se pintaron**: la lista de la sesión lleva encima
 * la cola offline, así que una serie encolada aparece igual que una enviada y se resalta igual,
 * sin esperar ninguna respuesta del Worker.
 *
 * Al montar no hay nada fresco: llegar a la sesión con doce series hechas no es haberlas apuntado
 * ahora. Y lo conocido se acumula, así que una relectura que devuelva la lista en otro orden —o
 * una serie que se borra y vuelve— no la enciende otra vez.
 */
export function useFreshSetIds(ids: readonly ResourceId[]): ReadonlySet<ResourceId> {
  // Estado derivado durante el render, el patrón de React para reaccionar a un cambio de props sin
  // efecto: con un `ref` la segunda pasada de `StrictMode` ya vería los ids nuevos como conocidos.
  const [seen, setSeen] = useState<SeenSets>(() => ({ known: new Set(ids), fresh: NONE }));

  const added = addedIds(seen.known, ids);
  if (added.length > 0) {
    setSeen({ known: new Set([...seen.known, ...added]), fresh: new Set(added) });
  }

  return seen.fresh;
}
