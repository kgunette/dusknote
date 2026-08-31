export type ChipType = 'medication' | 'remedy' | 'factor' | 'symptom';

export interface ChipDef {
  label: string;
  type: ChipType;
}

export type Helped = 'yes' | 'partly' | 'no' | null;

/** One treatment attempt: what was taken and when, with an optional outcome. */
export interface Attempt {
  id: string;
  time: string; // HH:MM, 24h
  treatment: string; // chip label
  helped: Helped;
}

/** One entry = one episode. */
export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD — the day the episode started
  start_time: string; // HH:MM
  /** 1–5 worst point; 0 = symptoms, no episode; null = not recorded. */
  rating: number | null;
  symptoms: string[];
  treatments: Attempt[];
  factors: string[];
  notes: string;
  source: 'normal' | 'backfilled';
  /** Tombstone — kept so sync can carry deletes to the sheet. */
  deleted: boolean;
  logged_at: string; // ISO
  updated_at: string; // ISO
}

export interface Gap {
  id: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  reason: string;
}

/** A medical-context event: appointment, scan, med change. Not a episode. */
export interface MedEvent {
  id: string;
  date: string; // YYYY-MM-DD
  note: string;
  updated_at: string; // ISO
}

export interface TrackedMed {
  name: string;
  /** Monthly over-use limit, or null to just count with no threshold. */
  limit: number | null;
}

/**
 * One vocabulary item — the single source of truth for everything you can tap when logging
 * A medication carries an optional monthly `limit`; the old separate TrackedMed list
 * is gone. Identity is the label itself: entries store the readable word, never a hidden
 * id, so the Google Sheet stays human-readable. The legacy `ChipDef` (tap options) and
 * `TrackedMed` (counted meds) shapes are now *derived* from this list, so existing consumers
 * don't change (see `vocab.ts`).
 */
/**
 * A structured filter that opens the Log filtered from a Stats tap (#8). The Stats screen builds
 * it (with a ready-to-show `label`); the feed reads `kind`/`month`/`rating`/`med` to filter and
 * shows `label` in the filter chip. The feed's text search is the sibling front door onto the
 * same filtered-log view.
 */
export interface StatsFilter {
  kind: 'month' | 'rating' | 'med' | 'date';
  /** 'YYYY-MM' — every filter is scoped to at least one month. */
  month: string;
  /** kind 'rating': the 1–5 level tapped. */
  rating?: number;
  /** kind 'med': the medication name whose days were tapped. */
  med?: string;
  /** kind 'date': the single 'YYYY-MM-DD' tapped in the Stats calendar. */
  date?: string;
  /** Chip text, e.g. "April 2026 · rated 5". */
  label: string;
}

export interface VocabItem {
  label: string;
  type: ChipType;
  /** The MONTHLY limit: days used in a month, not doses. Only meaningful for medications; always
   *  null otherwise. A monthly limit is also what makes a medication show a dose row in
   *  Stats/Report (confirmed 2026-07-05): no monthly limit = log-only. Named `limit` rather than
   *  `monthlyLimit` because it is the sheet's own `Limit` column, which older sheets and exports
   *  carry under that name. */
  limit: number | null;
  /** The DAILY limit: doses in one day. Only meaningful for medications; null for no daily limit.
   *  Read while logging (the attempt card shows "2 of 2 today") and nowhere else: Stats and the
   *  report ignore it, deliberately, and both limit captions say so. Added 2026-08-31 with its own
   *  `DailyLimit` sheet column; a sheet or export written before that has no such column, which
   *  states nothing and reads as null, so nothing older needs migrating. */
  dailyLimit?: number | null;
  /** Archived items keep their history but never appear as a tap option when logging. */
  archived: boolean;
  /** Only meaningful for factors: a watched factor gets a with/without split of each month's
   *  episode days on Stats (not in the printable report). Pure computation over existing
   *  entries — toggling it never changes any data. */
  watched?: boolean;
}
