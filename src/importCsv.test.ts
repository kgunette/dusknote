import { describe, it, expect } from 'vitest';
import { parseImportCsv } from './importCsv';

// A Preferences file is the one import that can change a setting the person is already using,
// so these lock in two things: that it is recognized at all, and that it never states more than
// the file actually says. Everything the file leaves out has to come through as "not stated",
// because that is what lets the apply step leave the device's own setting standing.

const PREF_HEADER = 'Kind,Label,Type,Limit,Archived,Watched';

/** The parsed Preferences payload, or a failure. Keeps each test to its own assertion. */
function prefs(csv: string) {
  const r = parseImportCsv(csv);
  if (!r.data || r.data.kind !== 'preferences')
    throw new Error(`expected a Preferences file, got: ${r.errors.join(' | ') || r.data?.kind}`);
  return r.data.prefs;
}

describe('recognizing a Preferences file', () => {
  it('reads Kind + Label as a Preferences file', () => {
    const p = prefs(`${PREF_HEADER}\nitem,Coffee,remedy,,,`);
    expect(p.items).toEqual([
      { label: 'Coffee', type: 'treatment', medication: false, limit: null, dailyLimit: null, archived: false, watched: false },
    ]);
  });

  it('still recognizes entries, events and gaps', () => {
    const entries = parseImportCsv('Date,Notes\n2026-08-10,slept badly');
    expect(entries.data?.kind).toBe('records');
    const events = parseImportCsv('Date,Note\n2026-08-10,neurology');
    expect(events.data?.kind).toBe('records');
    const gaps = parseImportCsv('Start,End,Reason\n2026-08-01,2026-08-05,travel');
    expect(gaps.data?.kind).toBe('records');
  });

  it('refuses a file whose columns match nothing, and names Preferences as an option', () => {
    const r = parseImportCsv('Colour,Size\nred,large');
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain('Preferences');
  });

  it('refuses an unrecognized column, naming it a Preferences file', () => {
    const r = parseImportCsv(`Kind,Label,Type,Colour\nitem,Coffee,remedy,red`);
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain('“Colour”');
    expect(r.errors[0]).toContain('a Preferences file');
  });
});

describe('reading what a Preferences file states', () => {
  it('reads types, limits, archived and watched', () => {
    const p = prefs(
      [
        PREF_HEADER,
        'item,Sumatriptan,medication,10,,',
        'item,Rizatriptan,medication,,archived,',
        'item,Poor sleep,factor,,,watched',
        'item,Nausea,symptom,,,',
      ].join('\n')
    );
    expect(p.items).toEqual([
      { label: 'Sumatriptan', type: 'treatment', medication: true, limit: 10, dailyLimit: null, archived: false, watched: false },
      { label: 'Rizatriptan', type: 'treatment', medication: true, limit: null, dailyLimit: null, archived: true, watched: false },
      { label: 'Poor sleep', type: 'factor', medication: null, limit: null, dailyLimit: null, archived: false, watched: true },
      { label: 'Nausea', type: 'symptom', medication: null, limit: null, dailyLimit: null, archived: false, watched: false },
    ]);
    expect(p.states).toEqual({ limit: true, archived: true, watched: true, dailyLimit: false, medication: false });
  });

  it('reads rating rows by level, and leaves unnamed levels unstated', () => {
    const p = prefs([PREF_HEADER, 'rating,Bad,4,,,', 'rating,Worst,5,,,'].join('\n'));
    expect(p.ratingWords).toEqual([null, null, null, 'Bad', 'Worst']);
  });

  it('reads the word you track and the name on the report', () => {
    const p = prefs(
      [PREF_HEADER, 'setting,headache,noun,,,', 'setting,A Name,name,,,'].join('\n')
    );
    expect(p.conditionNoun).toBe('headache');
    expect(p.patientName).toBe('A Name');
  });

  it('ignores a row kind it does not know, rather than refusing the file', () => {
    const p = prefs([PREF_HEADER, 'item,Coffee,remedy,,,', 'sparkle,Something,new,,,'].join('\n'));
    expect(p.items).toHaveLength(1);
  });

  it('strips the characters that would corrupt the sheet round-trip', () => {
    const p = prefs(`${PREF_HEADER}\nitem,"Stress; work",factor,,,`);
    expect(p.items[0].label).toBe('Stress work');
  });
});

describe('a partial file states nothing it does not carry', () => {
  it('reports absent Limit, Archived and Watched columns as unstated', () => {
    const p = prefs(['Kind,Label,Type', 'item,Coffee,remedy', 'item,Poor sleep,factor'].join('\n'));
    expect(p.states).toEqual({ limit: false, archived: false, watched: false, dailyLimit: false, medication: false });
  });

  it('leaves the rating words, the tracked word and the report name unstated', () => {
    const p = prefs(['Kind,Label,Type', 'item,Coffee,remedy'].join('\n'));
    expect(p.ratingWords).toEqual([null, null, null, null, null]);
    expect(p.conditionNoun).toBeNull();
    expect(p.patientName).toBeNull();
  });

  it('reads a blank cell in a column that exists as a real answer', () => {
    const p = prefs(`${PREF_HEADER}\nitem,Poor sleep,factor,,,`);
    expect(p.states.watched).toBe(true);
    expect(p.items[0].watched).toBe(false);
    expect(p.items[0].archived).toBe(false);
    expect(p.items[0].limit).toBeNull();
  });
});

describe('refusing a Preferences file', () => {
  const refuse = (csv: string) => {
    const r = parseImportCsv(csv);
    expect(r.data).toBeNull();
    return r.errors.join('\n');
  };

  it('refuses a file with no Type column', () => {
    expect(refuse('Kind,Label\nitem,Coffee')).toContain('needs a Type column');
  });

  it('refuses an option with no type, naming the row', () => {
    expect(refuse(`${PREF_HEADER}\nitem,Coffee,,,,`)).toContain('Row 2, Type: every option needs a type');
  });

  it('refuses a misspelled type, naming the row and what it found', () => {
    const e = refuse(`${PREF_HEADER}\nitem,Sumatriptan,medicaton,,,`);
    expect(e).toContain('Row 2, Type:');
    expect(e).toContain('“medicaton”');
  });

  it('refuses one treatment listed twice, however each row is marked', () => {
    // This used to be a bespoke medication-vs-remedy clash. With one treatment type it is just a
    // duplicate, caught by the ordinary check with a clearer message. A file still cannot tell the
    // app two different things about one option.
    const e = refuse(
      [PREF_HEADER, 'item,Coffee,medication,,,', 'item,Coffee,remedy,,,'].join('\n')
    );
    expect(e).toContain('Row 3, Label:');
    expect(e).toContain('row 2');
  });

  it('names the current type words when it refuses an unknown one', () => {
    const e = refuse([PREF_HEADER, 'item,Coffee,potion,,,'].join('\n'));
    expect(e).toContain('symptom, treatment, or factor');
  });

  it('refuses the same option listed twice', () => {
    const e = refuse([PREF_HEADER, 'item,Nausea,symptom,,,', 'item,nausea,symptom,,,'].join('\n'));
    expect(e).toContain('Row 3, Label:');
    expect(e).toContain('row 2');
  });

  it('refuses a word to track the app cannot use, naming the row', () => {
    const e = refuse([PREF_HEADER, 'item,Coffee,remedy,,,', 'setting,3 migraines!,noun,,,'].join('\n'));
    expect(e).toContain('Row 3, Label:');
    expect(e).toContain('word you track');
  });

  it('changes nothing when it refuses', () => {
    const e = refuse(`${PREF_HEADER}\nitem,Coffee,,,,`);
    expect(e).toContain('Nothing was changed.');
  });

  it('lets a symptom and a factor share a name, which the app allows', () => {
    const p = prefs([PREF_HEADER, 'item,Nausea,symptom,,,', 'item,Nausea,factor,,,'].join('\n'));
    expect(p.items).toHaveLength(2);
  });
});

// The blank templates ship in docs/templates/. A header the app would reject is a bad thing to
// hand someone, so the Preferences one is checked against the parser itself. (Like the other three
// templates it is a header to fill in, not a file to import as-is: an empty file has nothing to
// import and the app says so.)
describe('the blank Preferences template', () => {
  const TEMPLATE = 'Kind,Label,Type,Medication,Limit,DailyLimit,Archived,Watched';

  it('carries no column the app does not know', () => {
    const r = parseImportCsv(`${TEMPLATE}\nitem,Coffee,treatment,,,,,`);
    expect(r.errors).toEqual([]);
    expect(r.data?.kind).toBe('preferences');
  });

  it('states every optional setting, so a filled-in template says what it means', () => {
    const r = parseImportCsv(`${TEMPLATE}\nitem,Sumatriptan,treatment,medication,10,2,,`);
    if (r.data?.kind !== 'preferences') throw new Error('not read as a Preferences file');
    expect(r.data.prefs.states).toEqual({
      limit: true,
      archived: true,
      watched: true,
      dailyLimit: true,
      medication: true,
    });
    expect(r.data.prefs.items[0]).toMatchObject({
      label: 'Sumatriptan',
      type: 'treatment',
      medication: true,
      limit: 10,
      dailyLimit: 2,
    });
  });
});

// The conversion prompt asks an AI for a marks-only file: Kind, Label, Type, Medication and
// nothing else. Omitting the other columns is the point, so it cannot overwrite a limit, an
// archive state or a watched factor. This pins that the app reads it that way.
describe('a marks-only log options file', () => {
  it('is accepted, and states the mark and nothing else', () => {
    const r = parseImportCsv(
      ['Kind,Label,Type,Medication', 'item,Sumatriptan,treatment,medication', 'item,Coffee,treatment,'].join('\n')
    );
    expect(r.errors).toEqual([]);
    if (r.data?.kind !== 'preferences') throw new Error('not read as a Preferences file');
    expect(r.data.prefs.states).toEqual({
      medication: true,
      limit: false,
      dailyLimit: false,
      archived: false,
      watched: false,
    });
    expect(r.data.prefs.items.map((i) => [i.label, i.medication])).toEqual([
      ['Sumatriptan', true],
      ['Coffee', false],
    ]);
  });
});
