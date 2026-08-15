import { Fragment, useState } from 'react';
import type { Entry, MedEvent, StatsFilter } from '../types';
import { fmtMonth, fmtTime, fmtWeekdayDay, glyphClass, groupAttempts, HELPED_WORD, monthKey } from '../lib';
import { AppMark } from '../components/AppMark';
import { aNoun } from '../config';

function SearchIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** One tappable entry card: the date, a rating circle, then the labeled fields that have
 *  content (Symptoms / Treatments / Other factors / Notes), matching the report's structure. */
function EntryCard({ entry, onOpen }: { entry: Entry; onOpen: (e: Entry) => void }) {
  const groups = groupAttempts(entry.treatments);
  const notes = entry.notes.trim();
  return (
    <button type="button" className="card entry-card" onClick={() => onOpen(entry)}>
      <div className="entry-head">
        <span className="entry-date">{fmtWeekdayDay(entry.date)}</span>
        <span
          className={'entry-sev' + (entry.rating == null ? ' none' : '')}
          aria-label={entry.rating == null ? 'no rating recorded' : `rated ${entry.rating} of 5`}
        >
          {entry.rating == null ? '–' : entry.rating}
        </span>
      </div>
      <div className="entry-fields">
        {entry.symptoms.length > 0 && (
          <div className="entry-field">
            <div className="f-lbl">Symptoms</div>
            <div className="f-val">{entry.symptoms.join(', ')}</div>
          </div>
        )}
        {groups.length > 0 && (
          <div className="entry-field">
            <div className="f-lbl">Treatments</div>
            <div className="treat-rows">
              {groups.map((g, i) => (
                <div className="treat-row" key={i}>
                  <span className="treat-time">{g.time ? fmtTime(g.time) : ''}</span>
                  <span className="treat-name">{g.names}</span>
                  {/* The glyph is the only thing carrying the outcome on this card, and a shape
                      can't be read aloud. The word rides alongside it, visually hidden, so the
                      most useful fact on the entry isn't dropped for screen-reader users. */}
                  <span className={'g ' + glyphClass(g.helped)} aria-hidden="true" />
                  {g.helped && <span className="sr-only">{HELPED_WORD[g.helped]}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {entry.factors.length > 0 && (
          <div className="entry-field">
            <div className="f-lbl">Other factors</div>
            <div className="f-val">{entry.factors.join(', ')}</div>
          </div>
        )}
        {notes && (
          <div className="entry-field">
            <div className="f-lbl">Notes</div>
            <div className="entry-notes">{notes}</div>
          </div>
        )}
      </div>
    </button>
  );
}

// The one feed: episode entries and medical events in a single reverse-chronological
// timeline, every entry tappable to edit, with "Log a new episode" pinned at the bottom.
// This replaces the old separate Log and History screens.

type Row =
  | { type: 'entry'; date: string; sort: string; entry: Entry }
  | { type: 'event'; date: string; sort: string; event: MedEvent };

/** The searchable text of an entry: symptoms, treatment names, other factors, and notes.
 *  Ratings and dates are deliberately out of scope: a number or a date typed into a search box
 *  almost always means something else. This predicate is the
 *  "text query" seam: a future structured query (from Stats) can filter the same rows a
 *  different way and reuse everything below. */
function entryHaystack(e: Entry): string {
  return [...e.symptoms, ...e.treatments.map((a) => a.treatment), ...e.factors, e.notes]
    .join(' ')
    .toLowerCase();
}

/** The "structured query" seam: does this entry belong to a Stats-driven filter?
 *  Every filter is scoped to at least a month. 'month' = the month's episodes (episode days),
 *  'rating' = a single 1–5 level, 'med' = days with a matching medication attempt, 'date' = one
 *  day tapped in the calendar. 'date' returns every entry on that day, symptom-only included:
 *  you tapped a specific square to see what's behind it, so hiding part of the day would be a
 *  surprise, where the month-level counts deliberately exclude symptom-only days. */
function matchesFilter(e: Entry, f: StatsFilter): boolean {
  if (monthKey(e.date) !== f.month) return false;
  if (f.kind === 'date') return e.date === f.date;
  if (f.kind === 'rating') return e.rating === f.rating;
  if (f.kind === 'med') {
    const n = (f.med ?? '').toLowerCase();
    return e.treatments.some((a) => a.treatment.toLowerCase() === n);
  }
  return e.rating !== 0; // 'month': every episode that month (symptom-only excluded)
}

export function FeedScreen({
  entries,
  events,
  showEvents,
  onToggleEvents,
  onOpen,
  onOpenEvent,
  onNew,
  onNewEvent,
  filter,
  onClearFilter,
}: {
  entries: Entry[];
  events: MedEvent[];
  showEvents: boolean;
  onToggleEvents: () => void;
  onOpen: (e: Entry) => void;
  onOpenEvent: (ev: MedEvent) => void;
  onNew: () => void;
  onNewEvent: () => void;
  filter?: StatsFilter | null;
  onClearFilter?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // A Stats-driven filter (#8) takes over the feed and supersedes text search while it's active.
  const filtering = !!filter;
  const searching = !filtering && searchOpen && query !== '';

  // Filtering (from Stats) shows only the matching episodes, no events. Otherwise: search matches
  // entries and event notes (events always considered while searching), or the normal browse feed.
  const shownEntries = filtering
    ? entries.filter((e) => matchesFilter(e, filter!))
    : searching
      ? entries.filter((e) => entryHaystack(e).includes(query))
      : entries;
  const shownEvents = filtering
    ? []
    : searching
      ? events.filter((ev) => ev.note.toLowerCase().includes(query))
      : showEvents
        ? events
        : [];

  // The Stats numbers that open this feed count distinct DAYS (episode days, medication days),
  // while the feed lists entries. Report the day count so the chip reconciles with the number that
  // was tapped, appending "· N entries" only when a day holds more than one. (A rating filter is
  // already entry-for-entry, so it stays entries.)
  const filterCountLabel = (() => {
    const n = shownEntries.length;
    const ent = `${n} ${n === 1 ? 'entry' : 'entries'}`;
    // 'date' reports entries too: the chip already names the day, so "1 day" would say nothing.
    if (!filter || filter.kind === 'rating' || filter.kind === 'date') return ent;
    const days = new Set(shownEntries.map((e) => e.date)).size;
    const day = `${days} ${days === 1 ? 'day' : 'days'}`;
    return days === n ? day : `${day} · ${ent}`;
  })();

  // Merge into one newest-first timeline. Within a day, events sort after entries.
  const rows: Row[] = [
    ...shownEntries.map(
      (e): Row => ({ type: 'entry', date: e.date, sort: `${e.date}T${e.start_time}`, entry: e })
    ),
    ...shownEvents.map(
      (ev): Row => ({ type: 'event', date: ev.date, sort: `${ev.date}T99:99`, event: ev })
    ),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  // fold into month groups preserving order
  const groups: Array<{ key: string; items: Row[] }> = [];
  for (const r of rows) {
    const key = monthKey(r.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(r);
    else groups.push({ key, items: [r] });
  }

  const nothingLogged = entries.length === 0 && events.length === 0;

  function closeSearch() {
    setSearchOpen(false);
    setQ('');
  }

  // Count line while searching. Events are searchable too, so surface them honestly rather than
  // hiding a match behind an entries-only count. "N entries" is the frequency answer for the
  // common case (symptoms/treatments/factors).
  const nE = shownEntries.length;
  const nV = shownEvents.length;
  const ent = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
  const evt = (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`;
  let countLabel = '0 entries';
  if (nE > 0 && nV > 0) countLabel = `${ent(nE)} · ${evt(nV)}`;
  else if (nE > 0) countLabel = ent(nE);
  else if (nV > 0) countLabel = evt(nV);

  const feed = groups.map((g) => (
    <Fragment key={g.key}>
      <h2 className="section-head section-head-sticky">{fmtMonth(g.key)}</h2>
      {g.items.map((r) =>
        r.type === 'entry' ? (
          <EntryCard key={r.entry.id} entry={r.entry} onOpen={onOpen} />
        ) : (
          <button
            type="button"
            className="event-row"
            key={r.event.id}
            onClick={() => onOpenEvent(r.event)}
            aria-label={`Edit event: ${r.event.note}, ${fmtWeekdayDay(r.event.date)}`}
          >
            <span className="event-dot" aria-hidden="true" />
            <span className="muted small">
              <span style={{ fontWeight: 700 }}>{fmtWeekdayDay(r.event.date)}</span> · {r.event.note}
            </span>
          </button>
        )
      )}
    </Fragment>
  ));

  return (
    <div className="screen">
      <div className="scroll">
        {/* The app's landing screen had no heading at all, so a screen-reader user arrived with
            no structural entry point and nothing to navigate by. Visually hidden: the header row
            below (mark, search, add event) already says where you are to a sighted user. */}
        <h1 className="sr-only">Your log</h1>
        <div className="feed-head">
          {filtering ? (
            <>
              <div className="filter-bar">
                <span className="filter-chip">{filter!.label}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Clear filter"
                  onClick={onClearFilter}
                >
                  <ClearIcon />
                </button>
              </div>
              <div className="search-count">{filterCountLabel}</div>
            </>
          ) : searchOpen ? (
            <>
              <div className="search-bar">
                <span className="search-ic" aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={q}
                  autoFocus
                  placeholder="Search entries"
                  aria-label="Search entries"
                  onChange={(e) => setQ(e.target.value)}
                />
                <button type="button" className="icon-btn" aria-label="Close search" onClick={closeSearch}>
                  <ClearIcon />
                </button>
              </div>
              {searching && <div className="search-count">{countLabel}</div>}
            </>
          ) : (
            <>
              <div className="feed-topline">
                <AppMark size={30} />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Search entries"
                  onClick={() => setSearchOpen(true)}
                >
                  <SearchIcon />
                </button>
              </div>
              <hr className="hair-rule" />
              <div className="feed-events">
                <button type="button" className="feed-toggle" onClick={onNewEvent}>
                  + Add an event
                </button>
                {events.length > 0 && (
                  <button type="button" className="feed-toggle" onClick={onToggleEvents}>
                    {showEvents ? 'Hide events' : 'Show events'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {filtering ? (
          rows.length === 0 ? (
            <div className="muted">No matching entries.</div>
          ) : (
            feed
          )
        ) : searching ? (
          rows.length === 0 ? (
            <div className="muted">No matches.</div>
          ) : (
            feed
          )
        ) : nothingLogged ? (
          <div className="muted">Nothing logged yet.</div>
        ) : (
          feed
        )}
      </div>
      <div className="footer">
        <button type="button" className="btn-primary" onClick={onNew}>
          Log {aNoun()}
        </button>
      </div>
    </div>
  );
}
