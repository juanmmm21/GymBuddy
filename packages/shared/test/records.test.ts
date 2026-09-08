import { describe, expect, it } from 'vitest';
import {
  NO_PERSONAL_RECORDS,
  detectPersonalRecords,
  type PersonalRecordBests,
} from '../src/domain/records';
import type { ProgressionSet } from '../src/domain/progression';

const set = (weightGrams: number, reps: number, isWarmup = false): ProgressionSet => ({
  weightGrams,
  reps,
  isWarmup,
  completedAt: '2026-08-24T18:00:00.000Z',
});

const kinds = (bests: PersonalRecordBests, entry: ProgressionSet): string[] =>
  detectPersonalRecords(entry, bests).map((record) => record.kind);

describe('detectPersonalRecords', () => {
  it('la primera serie efectiva estrena las tres marcas', () => {
    expect(detectPersonalRecords(set(80_000, 8), NO_PERSONAL_RECORDS)).toStrictEqual([
      { kind: 'max_weight', valueGrams: 80_000 },
      { kind: 'estimated_1rm', valueGrams: 101_333 },
      { kind: 'max_volume', valueGrams: 640_000 },
    ]);
  });

  it('repetir exactamente la marca no es un récord', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 80_000,
      estimatedOneRepMaxGrams: 101_333,
      maxVolumeGrams: 640_000,
    };

    expect(detectPersonalRecords(set(80_000, 8), bests)).toStrictEqual([]);
  });

  it('rompe solo las marcas que supera', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 80_000,
      estimatedOneRepMaxGrams: 101_333,
      maxVolumeGrams: 640_000,
    };

    // 85 × 5: más peso, pero menos 1RM estimado (99.17 kg) y menos volumen.
    expect(kinds(bests, set(85_000, 5))).toStrictEqual(['max_weight']);
    // 80 × 9: mismo peso, mejor estimación y más volumen.
    expect(kinds(bests, set(80_000, 9))).toStrictEqual(['estimated_1rm', 'max_volume']);
  });

  it('una bajada de peso no rompe nada', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 100_000,
      estimatedOneRepMaxGrams: 133_333,
      maxVolumeGrams: 1_000_000,
    };

    expect(detectPersonalRecords(set(70_000, 5), bests)).toStrictEqual([]);
  });

  it('el calentamiento nunca marca récord, por pesado que sea', () => {
    expect(detectPersonalRecords(set(200_000, 10, true), NO_PERSONAL_RECORDS)).toStrictEqual([]);
  });

  it('una serie sin peso no marca récord: ahí el progreso son repeticiones', () => {
    expect(detectPersonalRecords(set(0, 30), NO_PERSONAL_RECORDS)).toStrictEqual([]);
  });

  it('una marca vigente suelta se respeta aunque falten las otras dos', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 90_000,
      estimatedOneRepMaxGrams: null,
      maxVolumeGrams: null,
    };

    expect(kinds(bests, set(85_000, 8))).toStrictEqual(['estimated_1rm', 'max_volume']);
  });
});
