import { describe, it, expect } from 'vitest';
import { decideSheet } from './sheetChoice';

const NAME = 'Dusknote';
const c = (id: string, name: string) => ({ id, name });

describe('decideSheet', () => {
  it('creates a fresh sheet when the app has none in Drive (first-time setup)', () => {
    expect(decideSheet([], NAME)).toEqual({ kind: 'create' });
  });

  it('adopts silently when there is exactly one sheet under the app name (new-phone recovery)', () => {
    expect(decideSheet([c('a', 'Dusknote')], NAME)).toEqual({ kind: 'adopt', id: 'a' });
  });

  it('asks when the only sheet was renamed, rather than guessing', () => {
    expect(decideSheet([c('a', 'My Health Log')], NAME)).toEqual({ kind: 'choose' });
  });

  it('asks when two sheets share the app name (split-brain), never auto-picking one', () => {
    expect(decideSheet([c('a', 'Dusknote'), c('b', 'Dusknote')], NAME)).toEqual({ kind: 'choose' });
  });

  it('asks when a named sheet and a renamed sheet both exist', () => {
    expect(decideSheet([c('a', 'Dusknote'), c('b', 'Old backup')], NAME)).toEqual({
      kind: 'choose',
    });
  });

  it('respects the configured app name rather than a hard-coded "Dusknote"', () => {
    expect(decideSheet([c('a', 'Migraine Memo')], 'Migraine Memo')).toEqual({
      kind: 'adopt',
      id: 'a',
    });
  });
});
