import { describe, it, expect } from 'vitest';
import { applyPrefs, comparePrefs, isEmptyChanges, type DeviceState } from './importPrefs';
import type { PrefFile, PrefItem } from './importCsv';
import type { ChipType, VocabItem } from './types';

// The comparison is what the review screen shows, so these lock in the rule a person was
// promised: anything the file has a setting for it overwrites, anything it doesn't have a
// setting for changes nothing, and nothing is ever removed.

const item = (label: string, type: ChipType, over: Partial<PrefItem> = {}): PrefItem => ({
  label,
  type,
  limit: null,
  dailyLimit: null,
  archived: false,
  watched: false,
  ...over,
});

const file = (items: PrefItem[], over: Partial<PrefFile> = {}): PrefFile => ({
  items,
  states: { limit: true, archived: true, watched: true, dailyLimit: true },
  ratingWords: [null, null, null, null, null],
  conditionNoun: null,
  patientName: null,
  ...over,
});

const vocab = (label: string, type: ChipType, over: Partial<VocabItem> = {}): VocabItem => ({
  label,
  type,
  limit: null,
  archived: false,
  ...over,
});

const device = (over: Partial<DeviceState> = {}): DeviceState => ({
  vocab: [],
  ratingWords: ['Mild', 'Moderate', 'Bad', 'Severe', 'Very severe'],
  conditionNoun: 'episode',
  patientName: '',
  ...over,
});

describe('nothing to change', () => {
  it('finds nothing when the file matches the device', () => {
    const c = comparePrefs(
      file([item('Coffee', 'remedy'), item('Sumatriptan', 'medication', { limit: 10 })]),
      device({ vocab: [vocab('Coffee', 'remedy'), vocab('Sumatriptan', 'medication', { limit: 10 })] })
    );
    expect(isEmptyChanges(c)).toBe(true);
  });

  it('leaves an option the file never mentions alone', () => {
    const c = comparePrefs(file([item('Coffee', 'remedy')]), device({ vocab: [vocab('Coffee', 'remedy'), vocab('Nausea', 'symptom')] }));
    expect(isEmptyChanges(c)).toBe(true);
  });
});

describe('changing an option you already have', () => {
  it('reads a medication becoming a remedy as the same option changing type', () => {
    const c = comparePrefs(file([item('Coffee', 'remedy')]), device({ vocab: [vocab('Coffee', 'medication')] }));
    expect(c.added).toEqual([]);
    expect(c.changed).toEqual([
      { label: 'Coffee', type: 'remedy', field: 'type', from: 'medication', to: 'remedy' },
    ]);
  });

  it('keeps the spelling the device already has', () => {
    const c = comparePrefs(file([item('coffee', 'remedy')]), device({ vocab: [vocab('Coffee', 'medication')] }));
    expect(c.changed[0].label).toBe('Coffee');
  });

  it('reports a limit arriving', () => {
    const c = comparePrefs(
      file([item('Sumatriptan', 'medication', { limit: 10 })]),
      device({ vocab: [vocab('Sumatriptan', 'medication')] })
    );
    expect(c.changed).toEqual([
      { label: 'Sumatriptan', type: 'medication', field: 'limit', from: null, to: 10 },
    ]);
  });

  it('reports an option being archived', () => {
    const c = comparePrefs(
      file([item('Rizatriptan', 'medication', { archived: true })]),
      device({ vocab: [vocab('Rizatriptan', 'medication')] })
    );
    expect(c.changed).toEqual([
      { label: 'Rizatriptan', type: 'medication', field: 'archived', from: false, to: true },
    ]);
  });

  it('reports a factor being watched', () => {
    const c = comparePrefs(
      file([item('Poor sleep', 'factor', { watched: true })]),
      device({ vocab: [vocab('Poor sleep', 'factor')] })
    );
    expect(c.changed).toEqual([
      { label: 'Poor sleep', type: 'factor', field: 'watched', from: false, to: true },
    ]);
  });

  it('does not raise the lost limit as its own change when a medication becomes a remedy', () => {
    const c = comparePrefs(
      file([item('Coffee', 'remedy')]),
      device({ vocab: [vocab('Coffee', 'medication', { limit: 5 })] })
    );
    expect(c.changed.map((x) => x.field)).toEqual(['type']);
  });

  it('reports each change separately when one option changes twice', () => {
    const c = comparePrefs(
      file([item('Rizatriptan', 'medication', { limit: 8, archived: true })]),
      device({ vocab: [vocab('Rizatriptan', 'medication')] })
    );
    expect(c.changed.map((x) => x.field)).toEqual(['limit', 'archived']);
  });
});

describe('adding an option', () => {
  it('adds one the device does not have', () => {
    const c = comparePrefs(file([item('Light sensitivity', 'symptom')]), device());
    expect(c.added).toEqual([{ label: 'Light sensitivity', type: 'symptom', archived: false }]);
  });

  it('says when a new option arrives archived', () => {
    const c = comparePrefs(file([item('Rizatriptan', 'medication', { archived: true })]), device());
    expect(c.added[0].archived).toBe(true);
  });

  it('keeps a symptom and a factor of the same name as two separate options', () => {
    const c = comparePrefs(file([item('Nausea', 'factor')]), device({ vocab: [vocab('Nausea', 'symptom')] }));
    expect(c.changed).toEqual([]);
    expect(c.added).toEqual([{ label: 'Nausea', type: 'factor', archived: false }]);
  });
});

describe('a partial file changes nothing it does not state', () => {
  // States default to "the file carries every column"; a case names only the one it drops. Taking a
  // partial here means adding a column later does not rewrite every call below.
  const partial = (items: PrefItem[], states: Partial<PrefFile['states']>) =>
    file(items, { states: { limit: true, archived: true, watched: true, dailyLimit: true, ...states } });

  it('changes no limits when the file has no Limit column', () => {
    const c = comparePrefs(
      partial([item('Sumatriptan', 'medication')], { limit: false, archived: true, watched: true }),
      device({ vocab: [vocab('Sumatriptan', 'medication', { limit: 10 })] })
    );
    expect(isEmptyChanges(c)).toBe(true);
  });

  it('archives nothing when the file has no Archived column', () => {
    const c = comparePrefs(
      partial([item('Rizatriptan', 'medication')], { limit: true, archived: false, watched: true }),
      device({ vocab: [vocab('Rizatriptan', 'medication', { archived: true })] })
    );
    expect(isEmptyChanges(c)).toBe(true);
  });

  it('changes no watching when the file has no Watched column', () => {
    const c = comparePrefs(
      partial([item('Poor sleep', 'factor')], { limit: true, archived: true, watched: false }),
      device({ vocab: [vocab('Poor sleep', 'factor', { watched: true })] })
    );
    expect(isEmptyChanges(c)).toBe(true);
  });

  it('adds a new option as active when the file has no Archived column', () => {
    const c = comparePrefs(
      partial([item('Coffee', 'remedy', { archived: true })], { limit: true, archived: false, watched: true }),
      device()
    );
    expect(c.added[0].archived).toBe(false);
  });

  it('still changes the type, which every file states', () => {
    const c = comparePrefs(
      partial([item('Coffee', 'remedy')], { limit: false, archived: false, watched: false }),
      device({ vocab: [vocab('Coffee', 'medication')] })
    );
    expect(c.changed.map((x) => x.field)).toEqual(['type']);
  });
});

describe('the rating words, the word you track, and the report name', () => {
  it('reports only the levels the file names', () => {
    const c = comparePrefs(
      file([], { ratingWords: [null, null, null, 'Bad', 'Worst'] }),
      device({ ratingWords: ['Mild', 'Moderate', 'Bad', 'Severe', 'Very severe'] })
    );
    expect(c.ratings).toEqual([
      { level: 4, from: 'Severe', to: 'Bad' },
      { level: 5, from: 'Very severe', to: 'Worst' },
    ]);
  });

  it('reports the word you track when it differs', () => {
    const c = comparePrefs(file([], { conditionNoun: 'episode' }), device({ conditionNoun: 'headache' }));
    expect(c.noun).toEqual({ from: 'headache', to: 'episode' });
  });

  it('reports nothing when the file names the same word', () => {
    const c = comparePrefs(file([], { conditionNoun: 'headache' }), device({ conditionNoun: 'headache' }));
    expect(c.noun).toBeNull();
  });

  it('reports the report name arriving where there was none', () => {
    const c = comparePrefs(file([], { patientName: 'A Name' }), device({ patientName: '' }));
    expect(c.name).toEqual({ from: '', to: 'A Name' });
  });

  it('changes neither when the file states neither', () => {
    const c = comparePrefs(file([]), device({ conditionNoun: 'headache', patientName: 'A Name' }));
    expect(c.noun).toBeNull();
    expect(c.name).toBeNull();
  });
});

describe('order', () => {
  it('lists options in the order of the Log options screen, then by name', () => {
    const c = comparePrefs(
      file([
        item('Weather', 'factor'),
        item('Hot shower', 'remedy'),
        item('Aspirin', 'medication'),
        item('Nausea', 'symptom'),
        item('Aura', 'symptom'),
      ]),
      device()
    );
    expect(c.added.map((x) => x.label)).toEqual([
      'Aura',
      'Nausea',
      'Aspirin',
      'Hot shower',
      'Weather',
    ]);
  });
});

// Applying is the same pass that produced the list, so what the review screen showed is exactly
// what happens. These check the result itself, and that a second look finds nothing left to do.
describe('applying the changes', () => {
  it('changes an option\'s type in place', () => {
    const next = applyPrefs(file([item('Coffee', 'remedy')]), device({ vocab: [vocab('Coffee', 'medication')] }));
    expect(next.vocab).toEqual([
      { label: 'Coffee', type: 'remedy', limit: null, dailyLimit: null, archived: false, watched: false },
    ]);
  });

  it('sets a limit, archives, and watches', () => {
    const next = applyPrefs(
      file([
        item('Sumatriptan', 'medication', { limit: 10 }),
        item('Rizatriptan', 'medication', { archived: true }),
        item('Poor sleep', 'factor', { watched: true }),
      ]),
      device({
        vocab: [vocab('Sumatriptan', 'medication'), vocab('Rizatriptan', 'medication'), vocab('Poor sleep', 'factor')],
      })
    );
    expect(next.vocab[0].limit).toBe(10);
    expect(next.vocab[1].archived).toBe(true);
    expect(next.vocab[2].watched).toBe(true);
  });

  it('adds a new option after the ones already there, keeping its archived state', () => {
    const next = applyPrefs(
      file([item('Light sensitivity', 'symptom'), item('Rizatriptan', 'medication', { archived: true })]),
      device({ vocab: [vocab('Coffee', 'remedy')] })
    );
    expect(next.vocab.map((v) => v.label)).toEqual(['Coffee', 'Light sensitivity', 'Rizatriptan']);
    expect(next.vocab[2].archived).toBe(true);
  });

  it('leaves an option the file never mentions exactly as it was', () => {
    const mine = vocab('Nausea', 'symptom', { archived: true });
    const next = applyPrefs(file([item('Coffee', 'remedy')]), device({ vocab: [mine, vocab('Coffee', 'remedy')] }));
    expect(next.vocab[0]).toBe(mine);
  });

  it('never removes an option', () => {
    const before = [vocab('Coffee', 'remedy'), vocab('Nausea', 'symptom'), vocab('Weather', 'factor')];
    const next = applyPrefs(file([item('Coffee', 'medication')]), device({ vocab: before }));
    expect(next.vocab).toHaveLength(3);
    expect(next.vocab.map((v) => v.label).sort()).toEqual(['Coffee', 'Nausea', 'Weather']);
  });

  it('drops the limit when a medication becomes a remedy', () => {
    const next = applyPrefs(
      file([item('Coffee', 'remedy')]),
      device({ vocab: [vocab('Coffee', 'medication', { limit: 5 })] })
    );
    expect(next.vocab[0]).toEqual({
      label: 'Coffee',
      type: 'remedy',
      limit: null,
      dailyLimit: null,
      archived: false,
      watched: false,
    });
  });

  it('replaces only the rating words the file names', () => {
    const next = applyPrefs(
      file([], { ratingWords: [null, null, null, 'Bad', 'Worst'] }),
      device({ ratingWords: ['Mild', 'Moderate', 'Bad', 'Severe', 'Very severe'] })
    );
    expect(next.ratingWords).toEqual(['Mild', 'Moderate', 'Bad', 'Bad', 'Worst']);
  });

  it('sets the word you track and the report name only when the file states them', () => {
    const stated = applyPrefs(
      file([], { conditionNoun: 'headache', patientName: 'A Name' }),
      device({ conditionNoun: 'episode', patientName: '' })
    );
    expect(stated.conditionNoun).toBe('headache');
    expect(stated.patientName).toBe('A Name');

    const unstated = applyPrefs(file([]), device({ conditionNoun: 'headache', patientName: 'A Name' }));
    expect(unstated.conditionNoun).toBe('headache');
    expect(unstated.patientName).toBe('A Name');
  });

  it('changes nothing a partial file does not state', () => {
    const before = device({ vocab: [vocab('Sumatriptan', 'medication', { limit: 10, archived: true })] });
    const next = applyPrefs(
      file([item('Sumatriptan', 'medication')], {
        states: { limit: false, archived: false, watched: false, dailyLimit: false },
      }),
      before
    );
    expect(next.vocab[0].limit).toBe(10);
    expect(next.vocab[0].archived).toBe(true);
  });

  it('leaves nothing to do the second time, so the screen and the result agree', () => {
    const f = file(
      [
        item('Coffee', 'remedy'),
        item('Sumatriptan', 'medication', { limit: 10 }),
        item('Rizatriptan', 'medication', { archived: true }),
        item('Poor sleep', 'factor', { watched: true }),
        item('Light sensitivity', 'symptom'),
      ],
      { ratingWords: [null, null, null, 'Bad', 'Worst'], conditionNoun: 'headache', patientName: 'A Name' }
    );
    const before = device({
      vocab: [vocab('Coffee', 'medication', { limit: 5 }), vocab('Sumatriptan', 'medication'), vocab('Rizatriptan', 'medication'), vocab('Poor sleep', 'factor')],
    });
    expect(isEmptyChanges(comparePrefs(f, before))).toBe(false);
    expect(isEmptyChanges(comparePrefs(f, applyPrefs(f, before)))).toBe(true);
  });
});

// The daily limit travels through import on exactly the same rule as everything else: stated is
// applied, unstated changes nothing. Worth its own block because it is the one column an older
// file cannot carry, and every file in the world is an older file until someone exports again.
describe('the daily limit through import', () => {
  const partial = (items: PrefItem[], states: Partial<PrefFile['states']>) =>
    file(items, { states: { limit: true, archived: true, watched: true, dailyLimit: true, ...states } });

  it('lists a daily limit change as its own row, with both values', () => {
    const c = comparePrefs(
      file([item('Sumatriptan', 'medication', { dailyLimit: 2 })]),
      device({ vocab: [vocab('Sumatriptan', 'medication')] })
    );
    expect(c.changed).toEqual([
      { label: 'Sumatriptan', type: 'medication', field: 'dailyLimit', from: null, to: 2 },
    ]);
  });

  it('leaves a daily limit alone when the file has no DailyLimit column', () => {
    // The pre-v8 case: your own export from last week, or anyone else's sheet.
    const c = comparePrefs(
      partial([item('Sumatriptan', 'medication', { limit: 10 })], { dailyLimit: false }),
      device({ vocab: [vocab('Sumatriptan', 'medication', { limit: 10, dailyLimit: 2 })] })
    );
    expect(isEmptyChanges(c)).toBe(true);
  });

  it('applies a stated daily limit', () => {
    const next = applyPrefs(
      file([item('Sumatriptan', 'medication', { limit: 10, dailyLimit: 2 })]),
      device({ vocab: [vocab('Sumatriptan', 'medication', { limit: 10 })] })
    );
    expect(next.vocab[0]).toMatchObject({ limit: 10, dailyLimit: 2 });
  });

  it('carries a daily limit onto an option the device does not have yet', () => {
    const next = applyPrefs(
      file([item('Ibuprofen', 'medication', { dailyLimit: 3 })]),
      device()
    );
    expect(next.vocab[0]).toMatchObject({ label: 'Ibuprofen', dailyLimit: 3 });
  });

  it('drops BOTH limits when a medication becomes an unmarked treatment', () => {
    const next = applyPrefs(
      file([item('Coffee', 'remedy')]),
      device({ vocab: [vocab('Coffee', 'medication', { limit: 4, dailyLimit: 2 })] })
    );
    expect(next.vocab[0]).toMatchObject({ type: 'remedy', limit: null, dailyLimit: null });
  });
});
