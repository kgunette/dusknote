import type { ChipDef } from './types';

/** The seed rating words for levels 1–5 (worst point of the episode). The DEFAULT only — the
 *  words are editable in-app and stored/synced as a preference (`ratingWords`).
 *  0 is always the locked NO_RATING_LABEL (not stored here). */
export const RATING_WORDS = [
  'Very mild',
  'Mild',
  'Moderate',
  'Severe',
  'Very severe',
] as const;

/** A small, condition-neutral starter vocabulary so the log screen isn't empty on first open.
 *  Everything here is editable and deletable in-app (Settings → Log options), and people add
 *  their own medications there — the app presets none, and no medication limit exists until
 *  the user sets one. */
export const SEED_CHIPS: ChipDef[] = [
  // remedies
  { label: 'Water', type: 'remedy' },
  { label: 'Rest', type: 'remedy' },
  // factors
  { label: 'Stress', type: 'factor' },
  { label: 'Poor sleep', type: 'factor' },
  { label: 'Weather', type: 'factor' },
  { label: 'Travel', type: 'factor' },
  // symptoms (loggable with or without an episode)
  { label: 'Fatigue', type: 'symptom' },
  { label: 'Nausea', type: 'symptom' },
  { label: 'Dizziness', type: 'symptom' },
];
