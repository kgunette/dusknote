import { describe, it, expect } from 'vitest';
import { comparePrefs, isEmptyChanges, type DeviceState } from './importPrefs';
import type { PrefFile, PrefItem } from './importCsv';
import type { ChipType, VocabItem } from './types';

// The comparison is what the review screen shows, so these lock in the rule a person was
// promised: anything the file has a setting for it overwrites, anything it doesn't have a
// setting for changes nothing, and nothing is ever removed.

const item = (label: string, type: ChipType, over: Partial<PrefItem> = {}): PrefItem => ({
  label,
  type,
  limit: null,
  archived: false,
  watched: false,
  ...over,
});

const file = (items: PrefItem[], over: Partial<PrefFile> = {}): PrefFile => ({
  items,
  states: { limit: true, archived: true, watched: true },
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
  const partial = (items: PrefItem[], states: PrefFile['states']) => file(items, { states });

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
