import {
  MAX_RIVALS,
  parseKilogramsToGrams,
  type Competition,
  type Competitor,
  type RivalCandidate,
} from '@gymbuddy/shared';

/** Un ejercicio visto contra un rival concreto: tu peso máximo y el suyo, en gramos. */
export interface RivalDuel {
  readonly catalogId: string;
  readonly name: string;
  readonly gifUrl: string;
  readonly mineGrams: number;
  readonly theirsGrams: number;
}

/** El marcador contra un rival: un punto por ejercicio para quien más levanta. */
export interface RivalBoard {
  readonly rival: Competitor;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly duels: readonly RivalDuel[];
}

/**
 * El cara a cara contra un rival: solo los ejercicios que hacéis los dos, con los que vas perdiendo
 * primero —es lo que hay que ir a buscar— y después por nombre. Se compara de dos en dos aunque la
 * competición traiga a más gente en el mismo ejercicio.
 */
export function boardAgainst(competition: Competition, rival: Competitor): RivalBoard {
  const duels: RivalDuel[] = [];

  for (const exercise of competition.exercises) {
    const mine = exercise.entries.find((entry) => entry.isSelf);
    const theirs = exercise.entries.find((entry) => entry.userId === rival.userId);
    if (mine === undefined || theirs === undefined) continue;

    duels.push({
      catalogId: exercise.catalogId,
      name: exercise.name,
      gifUrl: exercise.gifUrl,
      mineGrams: parseKilogramsToGrams(mine.maxWeight),
      theirsGrams: parseKilogramsToGrams(theirs.maxWeight),
    });
  }

  duels.sort(
    (a, b) =>
      marginGrams(a) - marginGrams(b) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
  );

  return {
    rival,
    wins: duels.filter((duel) => duel.mineGrams > duel.theirsGrams).length,
    losses: duels.filter((duel) => duel.mineGrams < duel.theirsGrams).length,
    draws: duels.filter((duel) => duel.mineGrams === duel.theirsGrams).length,
    duels,
  };
}

/** Lo que le sacas al rival en gramos: negativo si vas por detrás. */
export function marginGrams(duel: RivalDuel): number {
  return duel.mineGrams - duel.theirsGrams;
}

/**
 * Lo largas que salen las dos barras de un ejercicio, en tanto por ciento del más pesado: el que
 * gana llena la suya y el otro se queda en proporción, para que la diferencia se vea sin leer.
 */
export function barPercents(duel: RivalDuel): { readonly mine: number; readonly theirs: number } {
  const top = Math.max(duel.mineGrams, duel.theirsGrams);
  if (top === 0) return { mine: 0, theirs: 0 };

  return {
    mine: Math.round((duel.mineGrams / top) * 100),
    theirs: Math.round((duel.theirsGrams / top) * 100),
  };
}

/** Los rivales que ya están elegidos al abrir la hoja. */
export function selectedRivalIds(candidates: readonly RivalCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.userId);
}

/** La elección tras pulsar a alguien: entra si no estaba y sale si estaba. */
export function toggleRival(selected: readonly string[], userId: string): string[] {
  return selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId];
}

/** Con el tope alcanzado solo se puede quitar: a quien no está elegido no se le puede añadir. */
export function canToggleRival(selected: readonly string[], userId: string): boolean {
  return selected.includes(userId) || selected.length < MAX_RIVALS;
}

/** Si la elección de la hoja es distinta de la guardada, sin importar el orden. */
export function rivalsChanged(
  candidates: readonly RivalCandidate[],
  selected: readonly string[],
): boolean {
  const saved = new Set(selectedRivalIds(candidates));

  return saved.size !== selected.length || selected.some((id) => !saved.has(id));
}
