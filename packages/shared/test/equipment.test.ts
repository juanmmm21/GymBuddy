import { describe, expect, it } from 'vitest';
import { EQUIPMENT_FILTER_GROUPS, equipmentTagsOfFilter } from '../src/domain/equipment';
import { catalogEquipmentSchema } from '../src/schemas/catalog';

describe('equipmentTagsOfFilter', () => {
  it('«Máquina» abarca las máquinas de palanca, la multipower y las prensas', () => {
    expect(equipmentTagsOfFilter('machine')).toEqual(['machine', 'lever', 'smith', 'sled']);
  });

  it('una etiqueta que no es grupo se filtra tal cual, aunque pertenezca a uno', () => {
    expect(equipmentTagsOfFilter('smith')).toEqual(['smith']);
    expect(equipmentTagsOfFilter('cable')).toEqual(['cable']);
    expect(equipmentTagsOfFilter('hammer')).toEqual(['hammer']);
  });

  it('cada grupo y cada etiqueta de un grupo tienen la forma de un filtro del contrato', () => {
    for (const [group, tags] of Object.entries(EQUIPMENT_FILTER_GROUPS)) {
      expect(catalogEquipmentSchema.safeParse(group).success).toBe(true);
      expect(tags.every((tag) => catalogEquipmentSchema.safeParse(tag).success)).toBe(true);
    }
  });
});
