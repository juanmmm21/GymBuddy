import {
  MAX_RIVALS,
  parseVolumeKilogramsToGrams,
  type CompetitionWeekStanding,
  type Locale,
  type RivalCandidate,
} from '@gymbuddy/shared';
import { formatVolumeLabel, pluralize } from '../../lib/format';

/** «3 días · 21 series · 4500 kg»: lo que lleva alguien esta semana, en el orden en que se clasifica. */
export function standingSummary(standing: CompetitionWeekStanding, locale: Locale): string {
  if (standing.daysTrained === 0) return 'Sin entrenar esta semana';

  return [
    pluralize(standing.daysTrained, 'día', 'días'),
    pluralize(standing.setCount, 'serie', 'series'),
    formatVolumeLabel(parseVolumeKilogramsToGrams(standing.volume), locale),
  ].join(' · ');
}

/** El puesto dicho entero, para quien no ve el número: «Puesto 2 de 3». */
export function rankLabel(rank: number, total: number): string {
  return `Puesto ${String(rank)} de ${String(total)}`;
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
