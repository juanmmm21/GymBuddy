import { describe, expect, it } from 'vitest';
import { newResourceId, parseResourceId } from '../../src/lib/ids';
import { benchPress } from '../fixtures';

describe('parseResourceId', () => {
  it('solo acepta un UUID como identificador', () => {
    expect(parseResourceId(benchPress.id)).toBe(benchPress.id);
    expect(parseResourceId('no-es-un-id')).toBeNull();
    expect(parseResourceId(undefined)).toBeNull();
  });

  it('acepta el identificador que genera la propia PWA', () => {
    expect(parseResourceId(newResourceId())).not.toBeNull();
  });
});
