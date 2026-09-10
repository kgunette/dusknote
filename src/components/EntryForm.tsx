import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, ChipDef, Entry, Helped } from '../types';
import { fmtDateLine, glyphClass, HELPED_WORD, SAVED_FLASH_MS, toHM, toISODate, uid } from '../lib';
import { RatingPicker } from './RatingPicker';
import { ChipRow } from './ChipRow';
import { RevealSection } from './RevealSection';
import { dosesOnDate } from '../vocab';

/** How long the "remove doses with the ×" hint stays up before fading on its own. */
const DOSE_HINT_MS = 4500;

/** Chronological order for an entry's attempts, applied at save (never live in the form, so a
 *  card can't jump mid-edit). Attempts within one entry never span midnight — a 1:30 AM redose
 *  belongs to the next day's entry — so a plain time sort is correct. Timeless (backfilled)
 *  attempts keep their original slots; the stable sort keeps tap order for equal times. */
function sortAttempts(list: Attempt[]): Attempt[] {
  const timed = list.filter((a) => a.time).sort((x, y) => x.time.localeCompare(y.time));
  return list.map((a) => (a.time ? (timed.shift() as Attempt) : a));
}

/** Collapse duplicate treatments for the collapsed-section summary: "Coffee, Ibuprofen ×2". */
function summarizeAttempts(attempts: Attempt[]): string {
  const counts = new Map<string, number>();
  for (const a of attempts) counts.set(a.treatment, (counts.get(a.treatment) ?? 0) + 1);
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}

/**
 * The log form, used for new entries and for editing existing ones
 * (from the Today card or History). Every field is optional, but an entry
 * needs at least one of a rating, symptom, treatment, factor, or note;
 * a completely empty save is refused (see hasSomething below).
 */
export function EntryForm({
  existing,
  chips,
  ratingWords,
  onSave,
  afterSave,
  onCancel,
  onDelete,
  onAddChip,
  dailyLimits,
  entries,
}: {
  existing?: Entry;
  chips: ChipDef[];
  ratingWords: string[];
  /** Daily dose limits by folded label, for the count on the attempt card. */
  dailyLimits: Map<string, number>;
  /** Every saved entry, so the day's count can look beyond the one being edited. */
  entries: Entry[];
  onSave: (e: Entry) => Promise<void>;
  afterSave: () => void;
  onCancel?: () => void;
  onDelete?: (id: string) => Promise<void>;
  onAddChip: (c: ChipDef) => Promise<void>;
}) {
  const now = useMemo(() => new Date(), []);
  const [date, setDate] = useState(existing?.date ?? toISODate(now));
  const [startTime, setStartTime] = useState(existing?.start_time ?? toHM(now));
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);
  const [attempts, setAttempts] = useState<Attempt[]>(existing?.treatments ?? []);
  const [factors, setFactors] = useState<string[]>(existing?.factors ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [symptomsOpen, setSymptomsOpen] = useState((existing?.symptoms.length ?? 0) > 0);
  const [treatmentsOpen, setTreatmentsOpen] = useState((existing?.treatments.length ?? 0) > 0);
  const [factorsOpen, setFactorsOpen] = useState((existing?.factors.length ?? 0) > 0);
  const [dtOpen, setDtOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  // Which treatment's "use the × to remove doses" hint is showing, if any. A fresh object per
  // tap, so re-tapping the chip restarts the fade timer below.
  const [doseHint, setDoseHint] = useState<{ treatment: string } | null>(null);

  useEffect(() => {
    if (!doseHint) return;
    const t = window.setTimeout(() => setDoseHint(null), DOSE_HINT_MS);
    return () => window.clearTimeout(t);
  }, [doseHint]);

  // Rating is never required (blank means "not recorded", as backfilled entries carry). But an
  // entry can't be completely empty: it needs at least one of these to be a real record.
  const hasSomething =
    rating !== null ||
    symptoms.length > 0 ||
    attempts.length > 0 ||
    factors.length > 0 ||
    notes.trim() !== '';

  // Dirty = anything changed from how the form opened, so the dismiss control can read "Cancel".
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        date: existing?.date ?? toISODate(now),
        startTime: existing?.start_time ?? toHM(now),
        rating: existing?.rating ?? null,
        symptoms: existing?.symptoms ?? [],
        attempts: existing?.treatments ?? [],
        factors: existing?.factors ?? [],
        notes: existing?.notes ?? '',
      }),
    [existing, now]
  );
  const dirty =
    JSON.stringify({ date, startTime, rating, symptoms, attempts, factors, notes }) !==
    initialSnapshot;

  const treatmentChips = chips.filter((c) => c.type === 'treatment');
  const factorChips = chips.filter((c) => c.type === 'factor');
  const symptomChips = chips.filter((c) => c.type === 'symptom');

  // Chip rule (2026-07-17): with one dose logged the chip toggles off as always; with two or
  // more it removes nothing — a stray chip tap must never wipe multiple doses — and instead
  // points at the per-card ×. Doses are ×'d down to one before the chip removes again.
  function toggleTreatment(label: string) {
    const count = attempts.filter((a) => a.treatment === label).length;
    if (count >= 2) {
      setDoseHint({ treatment: label });
      return;
    }
    setDoseHint(null);
    setAttempts((prev) =>
      prev.some((a) => a.treatment === label)
        ? prev.filter((a) => a.treatment !== label)
        : [...prev, { id: uid(), time: toHM(new Date()), treatment: label, helped: null }]
    );
  }

  // "Log another dose" (the 2026-07-07 escape hatch, built 2026-07-17): a second attempt of the
  // same treatment, stamped now, with its own time and outcome. Everything downstream (feed,
  // report, stats, sheet) already treats same-name attempts as separate lines.
  function addAnotherDose(treatment: string) {
    setAttempts((prev) => [
      ...prev,
      { id: uid(), time: toHM(new Date()), treatment, helped: null },
    ]);
  }

  function setHelped(id: string, helped: Helped) {
    setAttempts((prev) => prev.map((a) => (a.id === id ? { ...a, helped } : a)));
  }

  function setAttemptTime(id: string, time: string) {
    setAttempts((prev) => prev.map((a) => (a.id === id ? { ...a, time } : a)));
  }

  // Remove one specific attempt by id (the card's ×). Works for any attempt — including one whose
  // treatment has been archived, which no longer has a pill in the row to toggle off.
  function removeAttempt(id: string) {
    setDoseHint(null);
    setAttempts((prev) => prev.filter((a) => a.id !== id));
  }

  function toggleIn(list: string[], label: string): string[] {
    return list.includes(label) ? list.filter((l) => l !== label) : [...list, label];
  }

  async function handleSave() {
    if (saved) return;
    if (!hasSomething) {
      setError(true);
      return;
    }
    const stamp = new Date().toISOString();
    const entry: Entry = {
      id: existing?.id ?? uid(),
      date,
      start_time: startTime,
      rating,
      symptoms,
      treatments: sortAttempts(attempts),
      factors,
      notes: notes.trim(),
      source: existing?.source ?? 'normal',
      deleted: false,
      logged_at: existing?.logged_at ?? stamp,
      updated_at: stamp,
    };
    setSaved(true);
    await onSave(entry);
    window.setTimeout(afterSave, SAVED_FLASH_MS);
  }

  async function handleDelete() {
    if (existing && onDelete) await onDelete(existing.id);
  }

  // The note box grows with its text and shrinks back, never below the 96px it starts at. Reset
  // to a small height first so scrollHeight measures the text rather than the old box. Runs
  // before paint on every text change, and again whenever the box's width changes (the form
  // opening, a rotation), because the same text wraps to a different number of lines.
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fitNotes = () => {
    const t = notesRef.current;
    if (!t) return;
    t.style.height = '56px';
    t.style.height = Math.max(96, t.scrollHeight) + 'px';
  };
  useLayoutEffect(fitNotes, [notes]);
  useEffect(() => {
    const t = notesRef.current;
    if (!t || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fitNotes);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="screen">
      <div className="scroll form-scroll">
        {onCancel && (
          <button type="button" className="back-btn" onClick={onCancel}>
            ‹ {dirty ? 'Cancel' : 'Back'}
          </button>
        )}

        <button
          type="button"
          className="dateline"
          onClick={() => setDtOpen((o) => !o)}
          aria-expanded={dtOpen}
          aria-label={`Started ${fmtDateLine(date, startTime)}, tap to edit`}
        >
          {fmtDateLine(date, startTime)}{' '}
          <span className="muted small" style={{ fontWeight: 400 }}>
            · {dtOpen ? 'Done' : 'Edit'}
          </span>
        </button>

        {dtOpen && (
          <div className="dt-row">
            <label className="field">
              <span className="field-label">Date it started</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value || date)} />
            </label>
            <label className="field">
              <span className="field-label">Start time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value || startTime)}
              />
            </label>
          </div>
        )}

        <RatingPicker value={rating} onChange={(v) => setRating(v)} words={ratingWords} />

        <RevealSection
          label="Symptoms"
          summary={symptoms.join(', ')}
          open={symptomsOpen}
          onToggle={() => setSymptomsOpen((o) => !o)}
        >
          <ChipRow
            options={symptomChips.map((c) => c.label)}
            selected={symptoms}
            onToggle={(l) => setSymptoms((s) => toggleIn(s, l))}
            onAdd={(label) => {
              void onAddChip({ label, type: 'symptom' });
              setSymptoms((s) => [...s, label]);
            }}
            includeArchivedSelected
          />
        </RevealSection>

        <RevealSection
          label="Treatments"
          summary={summarizeAttempts(attempts)}
          open={treatmentsOpen}
          onToggle={() => setTreatmentsOpen((o) => !o)}
        >
          <ChipRow
            options={treatmentChips.map((c) => c.label)}
            selected={attempts.map((a) => a.treatment)}
            onToggle={toggleTreatment}
            onAdd={(label) => {
              // Unmarked, the way a factor arrives unwatched. Marking it a medication is done in
              // Log options, on purpose, rather than guessed at here mid-entry.
              void onAddChip({ label, type: 'treatment' });
              toggleTreatment(label);
            }}
          />
          {doseHint && (
            <p className="chip-hint" role="status">
              More than one {doseHint.treatment} dose is logged. Remove single doses with the ×
              on each card.
            </p>
          )}
          {attempts.map((a, i) => {
            // The daily count, and the first number the app shows while you are RECORDING rather
            // than reviewing. It is the whole reason a daily limit exists: read in the moment,
            // deciding whether to take another. A day can span more than one entry, so it counts
            // every saved entry carrying this date (minus this one, which the form itself holds)
            // plus what is in the form right now. Only on the LAST card of that treatment, where
            // "Log another dose" already sits. It stays a COUNT, not a gate.
            const fold = a.treatment.trim().toLowerCase();
            const limit = dailyLimits.get(fold);
            const isLastOfTreatment = !attempts.some(
              (x, j) => j > i && x.treatment.trim().toLowerCase() === fold
            );
            let dose: { taken: number; limit: number } | null = null;
            if (limit != null && isLastOfTreatment) {
              const elsewhere = dosesOnDate(
                entries.filter((e) => e.id !== existing?.id),
                a.treatment,
                date
              );
              const here = attempts.filter((x) => x.treatment.trim().toLowerCase() === fold).length;
              dose = { taken: elsewhere + here, limit };
            }
            return (
            <div className="attempt" key={a.id}>
              <div className="attempt-top">
                <span className="attempt-name">
                  {a.treatment}
                  {dose && (
                    // Amber only ABOVE the limit, never at it, which is the rule Stats already
                    // follows: a month goes amber when days used are GREATER than the limit. Two
                    // of two is exactly the number you chose and nothing is wrong with it.
                    <>
                      {' '}
                      <span className={'dose-count' + (dose.taken > dose.limit ? ' over' : '')}>
                        {dose.taken} of {dose.limit} today
                      </span>
                    </>
                  )}
                </span>
                <span className="attempt-top-right">
                  <input
                    type="time"
                    className="attempt-time"
                    value={a.time}
                    aria-label={`Time ${a.treatment} was taken`}
                    onChange={(e) => setAttemptTime(a.id, e.target.value || a.time)}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${a.treatment}`}
                    onClick={() => removeAttempt(a.id)}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
                    </svg>
                  </button>
                </span>
              </div>
              <div className="helped-row">
                <span className="helped-label">Did it help?</span>
                <div className="helped-opts">
                  {(['yes', 'partly', 'no'] as const).map((o) => (
                    <button
                      type="button"
                      key={o}
                      className={'outcome' + (a.helped === o ? ' sel' : '')}
                      aria-pressed={a.helped === o}
                      aria-label={`${a.treatment} ${HELPED_WORD[o]}`}
                      onClick={() => setHelped(a.id, a.helped === o ? null : o)}
                    >
                      <span className={'g ' + glyphClass(o)} aria-hidden="true" />
                      {HELPED_WORD[o]}
                    </button>
                  ))}
                </div>
              </div>
              {!attempts.slice(i + 1).some((b) => b.treatment === a.treatment) && (
                <button
                  type="button"
                  className="another-dose"
                  aria-label={`Log another dose of ${a.treatment}`}
                  onClick={() => addAnotherDose(a.treatment)}
                >
                  <span className="another-dose-plus" aria-hidden="true">
                    +
                  </span>
                  Log another dose
                </button>
              )}
            </div>
            );
          })}
        </RevealSection>

        <RevealSection
          label="Other factors"
          summary={factors.join(', ')}
          open={factorsOpen}
          onToggle={() => setFactorsOpen((o) => !o)}
        >
          <ChipRow
            options={factorChips.map((c) => c.label)}
            selected={factors}
            onToggle={(l) => setFactors((f) => toggleIn(f, l))}
            onAdd={(label) => {
              void onAddChip({ label, type: 'factor' });
              setFactors((f) => [...f, label]);
            }}
            includeArchivedSelected
          />
        </RevealSection>

        <textarea
          ref={notesRef}
          className="notes"
          value={notes}
          placeholder="Note"
          onChange={(e) => setNotes(e.target.value)}
        />

        {existing && onDelete && (
          confirmDelete ? (
            <div className="confirm-row">
              <span>Delete this entry?</span>
              <button type="button" className="text-btn" onClick={() => void handleDelete()}>
                Delete
              </button>
              <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(true)}>
              Delete entry
            </button>
          )
        )}
      </div>

      <div className="footer">
        {error && !hasSomething && (
          <div className="form-error" role="alert" style={{ marginBottom: 8 }}>
            <span className="form-error-dot" aria-hidden="true" /> Add a rating, symptom, treatment,
            factor, or note to save.
          </div>
        )}
        <button type="button" className="btn-primary" onClick={() => void handleSave()}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}
