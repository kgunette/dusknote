import type { Attempt, Entry, Gap, Helped, MedEvent, VocabItem } from './types';
import { importSnapshot } from './db';

// The try-it demo's sample data. All invented, all condition-neutral, and built fresh from
// today's date on every visit, so the demo always shows the last three months: this month with
// a handful of entries, last month with a medication over its monthly limit, and the month
// before with only a travel gap. The same story as the product page's screenshots, which come
// from the Darkroom capture rig's frozen copy of this data.

const RATING_WORDS = ['Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'];
const PATIENT_NAME = 'Jane Doe';
const CONDITION_NOUN = 'episode';

const V = (label: string, type: VocabItem['type'], extra: Partial<VocabItem> = {}): VocabItem => ({
  label,
  type,
  limit: null,
  archived: false,
  ...extra,
});

const VOCAB: VocabItem[] = [
  V('Ibuprofen', 'treatment', { medication: true, limit: 10, dailyLimit: 2 }),
  V('Advil', 'treatment', { medication: true }),
  V('Water', 'treatment'),
  V('Rest', 'treatment'),
  V('Heat pack', 'treatment'),
  V('Stress', 'factor'),
  V('Poor sleep', 'factor', { watched: true }),
  V('Weather', 'factor'),
  V('Travel', 'factor'),
  V('Fatigue', 'symptom'),
  V('Nausea', 'symptom'),
  V('Dizziness', 'symptom'),
];

/** 'YYYY-MM-DD' for a day of a month, both counted the way a calendar does (month 1 = January). */
function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The calendar month `back` months before the given one, as [year, month]. */
function monthBefore(year: number, month: number, back: number): [number, number] {
  const d = new Date(year, month - 1 - back, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

let attemptId = 0;
const attempt = (treatment: string, time: string, helped: Helped): Attempt => ({
  id: `demo-a${++attemptId}`,
  time,
  treatment,
  helped,
});

interface EntrySpec {
  time?: string;
  symptoms?: string[];
  tx?: Attempt[];
  factors?: string[];
  notes?: string;
}

function entry(id: string, date: string, rating: number | null, o: EntrySpec = {}): Entry {
  const stamp = new Date(`${date}T${o.time || '09:00'}:00`).toISOString();
  return {
    id,
    date,
    start_time: o.time || '09:00',
    rating,
    symptoms: o.symptoms || [],
    treatments: o.tx || [],
    factors: o.factors || [],
    notes: o.notes || '',
    source: 'normal',
    deleted: false,
    logged_at: stamp,
    updated_at: stamp,
  };
}

export interface DemoSnapshot {
  entries: Entry[];
  vocab: VocabItem[];
  gaps: Gap[];
  events: MedEvent[];
  ratingWords: string[];
  conditionNoun: string;
  patientName: string;
}

/** The sample data as of `today`. Nothing is dated after today. */
export function demoSnapshot(today: Date = new Date()): DemoSnapshot {
  attemptId = 0;
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const [ly, lm] = monthBefore(y, m, 1); // last month: the over-limit month
  const [gy, gm] = monthBefore(y, m, 2); // two months back: the travel gap only

  // This month: the showcase. Six episode days (three with Poor sleep, three without), one
  // symptom-only day, one unrated day, Ibuprofen on three days (under its monthly limit of 10),
  // one of which goes over its daily limit of 2. Only the days up to today exist yet.
  const thisMonth: Entry[] = [
    entry('demo-t1', ymd(y, m, 3), 2, { time: '08:00', symptoms: ['Fatigue'], factors: ['Poor sleep'], tx: [attempt('Water', '08:15', 'partly')] }),
    entry('demo-t2', ymd(y, m, 6), 0, { time: '14:00', symptoms: ['Nausea'] }),
    entry('demo-t3', ymd(y, m, 9), 3, { time: '07:30', factors: ['Stress'], tx: [attempt('Ibuprofen', '07:45', 'yes'), attempt('Heat pack', '08:30', 'yes')] }),
    entry('demo-t4', ymd(y, m, 12), 4, { time: '06:30', factors: ['Poor sleep', 'Weather'], tx: [attempt('Ibuprofen', '06:45', 'partly'), attempt('Ibuprofen', '10:00', 'yes'), attempt('Ibuprofen', '11:30', 'yes')], notes: 'Woke with it, eased by noon.' }),
    entry('demo-t5', ymd(y, m, 15), null, { time: '12:00', symptoms: ['Dizziness'] }),
    entry('demo-t6', ymd(y, m, 19), 1, { time: '18:00', tx: [attempt('Rest', '18:30', null)] }),
    entry('demo-t7', ymd(y, m, 22), 5, { time: '05:00', factors: ['Poor sleep'], tx: [attempt('Ibuprofen', '05:15', 'no'), attempt('Advil', '09:00', null)] }),
    entry('demo-t8', ymd(y, m, 26), 2, { time: '09:00', symptoms: ['Fatigue'], tx: [attempt('Heat pack', '09:20', 'yes')] }),
  ].filter((e) => Number(e.date.slice(-2)) <= d);

  // Last month: twelve distinct Ibuprofen days against the limit of 10, outcomes mixed with
  // several blanks. Every day is the 28th or earlier so the month is never February-short.
  const lastMonthSpec: [number, number, Helped][] = [
    [1, 3, 'yes'], [2, 2, 'partly'], [4, 4, 'yes'], [5, 2, null], [8, 3, 'no'], [10, 5, 'yes'],
    [12, 2, null], [15, 3, 'partly'], [18, 4, null], [22, 2, 'yes'], [25, 3, null], [27, 4, 'yes'],
  ];
  const lastMonth = lastMonthSpec.map(([day, rating, helped], i) => {
    const extra: Attempt[] = [];
    if (day === 4) extra.push(attempt('Advil', '15:00', 'yes'));
    if (day === 15) extra.push(attempt('Advil', '20:00', 'no'));
    if (day === 8) extra.push(attempt('Rest', '11:00', null));
    return entry(`demo-l${i + 1}`, ymd(ly, lm, day), rating, {
      time: ['06:30', '08:00', '09:30', '07:15'][i % 4],
      factors: i % 3 === 0 ? ['Poor sleep'] : i % 3 === 1 ? ['Stress'] : [],
      tx: [attempt('Ibuprofen', '10:00', helped), ...extra],
    });
  });

  const events: MedEvent[] = d >= 17
    ? [{ id: 'demo-e1', date: ymd(y, m, 17), note: 'Specialist appointment', updated_at: new Date(`${ymd(y, m, 17)}T12:00:00`).toISOString() }]
    : [];

  const gaps: Gap[] = [
    { id: 'demo-g2', start: ymd(gy, gm, 4), end: ymd(gy, gm, 10), reason: 'Traveling' },
  ];
  if (d >= 29) gaps.unshift({ id: 'demo-g1', start: ymd(y, m, 27), end: ymd(y, m, 29), reason: 'Traveling' });

  return {
    entries: [...thisMonth, ...lastMonth],
    vocab: VOCAB,
    gaps,
    events,
    ratingWords: RATING_WORDS,
    conditionNoun: CONDITION_NOUN,
    patientName: PATIENT_NAME,
  };
}

/** Replace everything on this device with today's sample data. Demo builds only (main.tsx). */
export async function seedDemo(): Promise<void> {
  await importSnapshot(demoSnapshot());
}
