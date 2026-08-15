import { useMemo, useState } from 'react';
import type { Entry, Gap, StatsFilter, TrackedMed } from '../types';
import { fmtDayShort, pad, ratingWord } from '../lib';
import { noun } from '../config';
import { shortFactor } from '../lib';
import { buildReportModel, DEFAULT_OPTIONS, monthNoDataText, type MonthSection } from '../report/model';
import { treatmentOutcomes, type CalDay, type TreatmentOutcome } from '../report/counts';
import { RevealSection } from '../components/RevealSection';

// Opacity per rating level (index = level - 1), fading like the app icon's dusk bands:
// 5 = full olive down to 1 = faintest. Shared by the calendar shading, the rating shade-key
// swatches, and the Calendar Key ramp so all three read as one language.
const RATING_OPACITY = [0.32, 0.46, 0.62, 0.8, 1] as const;
const oliveAt = (level: number) => `rgba(142,154,115,${RATING_OPACITY[level - 1]})`;

/**
 * One card per month: a weekday calendar of the month (each day shaded by its worst rating,
 * outlined for a episode with no rating recorded, hatched for a coverage gap), then episode days
 * (with any watched-factor splits), episodes, a Rating shade-key (which doubles as the calendar's shade
 * legend), and one row per tracked medication's days. Runs on the same month model the report uses,
 * so counts and the calendar can never disagree and missing data stays missing, never zero.
 *
 * A single Calendar Key sits once at the top of the tab (not per card). Tap to filter: a calendar
 * day with an episode, the episode-days count, each rating row, and each medication row all open
 * the Log filtered to those entries.
 */
export function StatsScreen({
  entries,
  gaps,
  meds,
  ratingWords,
  watchedFactors,
  onFilter,
}: {
  entries: Entry[];
  gaps: Gap[];
  meds: TrackedMed[];
  ratingWords: string[];
  watchedFactors: string[];
  onFilter: (f: StatsFilter) => void;
}) {
  const model = useMemo(
    () =>
      buildReportModel(
        { entries, events: [], gaps, meds, ratingWords, watchedFactors },
        DEFAULT_OPTIONS,
        new Date()
      ),
    [entries, gaps, meds, ratingWords, watchedFactors]
  );

  // All-time, so it reads the raw entries rather than the month-sectioned model.
  const outcomes = useMemo(() => treatmentOutcomes(entries), [entries]);

  if (model.months.length === 0) {
    return (
      <div className="screen">
        <div className="scroll">
          <h1 className="screen-title">Stats</h1>
          <div className="muted">Stats appear once there are entries.</div>
        </div>
      </div>
    );
  }

  const hasData = model.months.some((m) => m.status === 'data');

  return (
    <div className="screen">
      <div className="scroll">
        <h1 className="screen-title">Stats</h1>
        {/* All-time, so it sits above the months rather than between them. Collapsed by default and
            placed ahead of the Calendar Key, which has to stay against the calendars it explains. */}
        <WhatHelped outcomes={outcomes} />
        {hasData && <CalendarKey />}
        {model.months.map((m) => {
          // Gap / before-tracking months (already collapsed into ranges by the model).
          if (m.status !== 'data') {
            return (
              <div key={m.key}>
                <h2 className="section-head" style={{ color: 'var(--muted)' }}>
                  {m.label}
                </h2>
                <div className="muted" style={{ fontSize: '1rem' }}>
                  {monthNoDataText(m)}
                </div>
              </div>
            );
          }
          return <DataMonth key={m.key} m={m} words={ratingWords} onFilter={onFilter} />;
        })}
      </div>
    </div>
  );
}

/** The one legend for the calendar, at the top of the tab: a mild-to-worse shade ramp plus the
 *  three non-shaded cell types. The per-card rating rows carry the shade-to-word mapping. */
function CalendarKey() {
  return (
    <div className="card col cal-key">
      <div className="rating-lbl">CALENDAR KEY</div>
      <div className="cal-ramp">
        <span className="cal-ramp-cap">milder</span>
        {[1, 2, 3, 4, 5].map((level) => (
          <span key={level} className="cal-ramp-sw" style={{ background: oliveAt(level) }} />
        ))}
        <span className="cal-ramp-cap">worse</span>
      </div>
      <div className="cal-key-types">
        <span>
          <span className="cal-key-sq cal-key-outline" />
          unrated {noun()}
        </span>
        <span>
          <span className="cal-key-sq cal-key-hatch" />
          gap
        </span>
        <span>
          <span className="cal-key-sq cal-key-none" />
          no {noun()}
        </span>
      </div>
    </div>
  );
}

/**
 * What helped: one all-time card, above the months because it's the summary they're the detail of.
 * Counts attempts, not days (an outcome is recorded per attempt), which is why the rows say
 * "tries". No percentages on purpose: at these sample sizes "0%" reads harsher and less clearly
 * than "no 3", and a percentage would imply a precision that a handful of attempts can't carry.
 *
 * Attempts with no outcome are shown on their own dim line and never enter the counts, the same
 * rule the rest of the app follows for missing data. The line doubles as the honest caveat (these
 * numbers describe the times an outcome got recorded, not every time you tried) and as the only
 * nudge to record more of them. It's omitted entirely when every attempt has one, since the three
 * counts then already sum to the number of tries.
 */
function WhatHelped({ outcomes }: { outcomes: TreatmentOutcome[] }) {
  const [open, setOpen] = useState(false);
  if (outcomes.length === 0) return null;
  return (
    <RevealSection
      label="What helped"
      summary={`${outcomes.length} ${outcomes.length === 1 ? 'treatment' : 'treatments'}`}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="card col">
        <div className="rating-lbl">ALL TIME</div>
        {outcomes.map((t) => (
          <div className="tx-row" key={t.name}>
            <div className="tx-name">{t.name}</div>
            {t.yes + t.partly + t.no === 0 ? (
              <div className="tx-none">
                no outcomes recorded · {t.tries} {t.tries === 1 ? 'try' : 'tries'}
              </div>
            ) : (
              <div className="tx-counts">
                <Count n={t.yes} word="helped" />
                <span className="tx-sep" aria-hidden="true">·</span>
                <Count n={t.partly} word="partly" />
                <span className="tx-sep" aria-hidden="true">·</span>
                <Count n={t.no} word="no" />
              </div>
            )}
            {t.noOutcome > 0 && t.noOutcome < t.tries && (
              <div className="tx-no-outcome">
                {t.noOutcome} of {t.tries} tries have no outcome
              </div>
            )}
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

/** One outcome count. A zero drops to the dim caption tone so the eye lands on what actually
 *  happened, while the zeros stay visible (a real "never helped" is worth reading). */
function Count({ n, word }: { n: number; word: string }) {
  return (
    <span className={n === 0 ? 'tx-ct tx-ct-zero' : 'tx-ct'}>
      {word} {n}
    </span>
  );
}

/**
 * The month's weekday calendar. Cells: rated (olive by level), unrated episode (olive outline),
 * gap (hatched), or none (faint). Faint day numbers ride on every real cell.
 *
 * Only episode days are buttons; everything else stays a span. That's both the product rule (a
 * blank day has nothing to open, and a gap's reason isn't an entry) and what keeps the calendar
 * usable by keyboard: a month contributes ~9 tab stops instead of 31, on a screen that can show a
 * year of them. Each button carries a spelled-out label, because the shading is the whole point of
 * the calendar and a background colour is invisible to a screen reader.
 */
function MonthCalendar({
  days,
  monthKeyStr,
  words,
  onFilter,
}: {
  days: CalDay[];
  monthKeyStr: string;
  words: string[];
  onFilter: (f: StatsFilter) => void;
}) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  return (
    <div className="cal-wrap">
      <div className="cal-grid">
        {/* Each day button already spells out its weekday, so to a screen reader this row is
            seven loose letters before every grid. Purely visual. */}
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="cal-dowh" aria-hidden="true">
            {d}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`b${i}`} className="cal-cell cal-blank" />
        ))}
        {days.map((cd) => {
          let cls = 'cal-cell';
          let style: React.CSSProperties | undefined;
          if (cd.rating != null) {
            cls += ' cal-hit';
            // Ratings 4–5 fill the cell brightly enough that a light day number washes out; the
            // number flips to on-accent ink there. See .cal-ink in theme.css.
            if (cd.rating >= 4) cls += ' cal-ink';
            style = { background: oliveAt(cd.rating) };
          } else if (cd.episode) {
            cls += ' cal-unrated';
          } else if (cd.gap) {
            cls += ' cal-gap';
          }
          if (!cd.episode) {
            // A gap day and an ordinary no-episode day look different (hatch vs flat) but would
            // announce identically as a bare number. "No records" and "nothing happened" are
            // opposite claims, and the app is careful about that distinction everywhere else.
            return (
              <span key={cd.day} className={cls} style={style}>
                <span className="cal-dn">{cd.day}</span>
                {cd.gap && (
                  <span className="sr-only">{fmtDayShort(`${monthKeyStr}-${pad(cd.day)}`)}, no records</span>
                )}
              </span>
            );
          }
          const date = `${monthKeyStr}-${pad(cd.day)}`;
          const dayLabel = fmtDayShort(date);
          // "Tuesday, Jul 14, rated 3 (Moderate)" / "…, no rating recorded" — the shading in words.
          const ratingSpoken =
            cd.rating != null
              ? `rated ${cd.rating}${ratingWord(cd.rating, words) ? ` (${ratingWord(cd.rating, words)})` : ''}`
              : 'no rating recorded';
          return (
            <button
              type="button"
              key={cd.day}
              className={cls + ' cal-tap'}
              style={style}
              aria-label={`${dayLabel}, ${ratingSpoken}`}
              onClick={() =>
                onFilter({ kind: 'date', month: monthKeyStr, date, label: dayLabel })
              }
            >
              <span className="cal-dn">{cd.day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataMonth({
  m,
  words,
  onFilter,
}: {
  m: MonthSection;
  words: string[];
  onFilter: (f: StatsFilter) => void;
}) {
  const ratingsTotal = m.ratings.reduce((a, b) => a + b, 0);

  return (
    <div>
      <h2 className="section-head">{m.label}</h2>
      <div className="card col">
        {/* The month as a portrait — one cell per day, the card's visual anchor. */}
        {m.days.length > 0 && (
          <MonthCalendar
            days={m.days}
            monthKeyStr={m.key}
            words={words}
            onFilter={onFilter}
          />
        )}

        {/* Episode days — the headline, tappable to the month's episodes. Allergy breakout below. */}
        {m.episodeDays > 0 ? (
          <div>
            <button
              type="button"
              className="metric metric-tap"
              onClick={() => onFilter({ kind: 'month', month: m.key, label: m.label })}
            >
              <span className="stat-value">{m.episodeDays}</span>
              <span className="metric-label">
                {noun()} {m.episodeDays === 1 ? 'day' : 'days'}
              </span>
              <span className="tap-arrow" aria-hidden="true">›</span>
            </button>
            {m.breakouts.filter((b) => b.days > 0).map((b) => (
              <div className="stat-sublist" key={b.label}>
                <div>
                  {m.episodeDays - b.days} without {shortFactor(b.label)}
                </div>
                <div>
                  {b.days} with {shortFactor(b.label)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="metric">
            <span className="stat-value">0</span>
            <span className="metric-label">{noun()} days</span>
          </div>
        )}

        {/* Episode entries — read-only (same entries as the day count, counted per entry, not
            per day). Labeled "episode entries", never plain "entries": this count excludes
            rating-0 (symptom-only) records while the log's word "entries" means every saved
            record, so the bare word here would disagree with the list it summarizes. Not
            "episodes" either ("3 episode days · 4 episodes" reads like a contradiction). */}
        <div className="metric">
          <span className="stat-value">{m.entryCount}</span>
          <span className="metric-label">
            {noun()} {m.entryCount === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Rating shade-key: level 5 → 1, all five shown, swatch matches the calendar's shade for
            that rating. A rated level is tappable to filter; a zero level is a hollow swatch. */}
        {ratingsTotal > 0 && (
          <div className="rating-block">
            <div className="rating-lbl">RATING</div>
            {[5, 4, 3, 2, 1].map((level) => {
              const count = m.ratings[level - 1];
              const word = ratingWord(level, words) ?? `Rating ${level}`;
              if (count === 0) {
                return (
                  <div className="rating-row" key={level}>
                    <span className="rating-sw rating-sw-empty" />
                    <span className="rating-word rating-zero">{word}</span>
                    <span className="rating-leader" aria-hidden="true" />
                    <span className="rating-ct rating-zero">0</span>
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  className="rating-row rating-tap"
                  key={level}
                  onClick={() =>
                    onFilter({
                      kind: 'rating',
                      month: m.key,
                      rating: level,
                      label: `${m.label} · rated ${level}`,
                    })
                  }
                >
                  <span className="rating-sw" style={{ background: oliveAt(level) }} />
                  <span className="rating-word">{word}</span>
                  <span className="rating-leader" aria-hidden="true" />
                  <span className="rating-ct">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* One row per tracked medication's days. Over-limit reads as a one-line amber fraction
            (12/10); under-limit is plain, no limit shown. Tappable when there's at least one day. */}
        {m.medDays.map((d) => {
          const over = d.limit != null && d.days > d.limit;
          const value = over ? `${d.days}/${d.limit}` : String(d.days);
          const label = `${d.name} ${d.days === 1 ? 'day' : 'days'}`;
          if (d.days === 0) {
            return (
              <div className="metric" key={d.name}>
                <span className="stat-value">0</span>
                <span className="metric-label">{label}</span>
              </div>
            );
          }
          return (
            <button
              type="button"
              className="metric metric-tap"
              key={d.name}
              onClick={() => onFilter({ kind: 'med', month: m.key, med: d.name, label: `${m.label} · ${d.name}` })}
            >
              <span className={'stat-value' + (over ? ' over' : '')}>{value}</span>
              <span className="metric-label">{label}</span>
              <span className="tap-arrow" aria-hidden="true">›</span>
            </button>
          );
        })}

        {m.partialGapReasons.length > 0 && (
          <div className="caption">partial data (part of this month is a coverage gap)</div>
        )}
      </div>
    </div>
  );
}
