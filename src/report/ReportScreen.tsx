import { Fragment, useMemo, useState } from 'react';
import './report.css';
import type { Entry, Gap, MedEvent, TrackedMed } from '../types';
import { SITE_DISPLAY, nounCap } from '../config';
import { fmtDayShort, fmtTime, shortFactor } from '../lib';

/** Summary-table header for a watched factor: the short word, capitalized ("Allergies"). */
function factorHeader(label: string): string {
  const s = shortFactor(label);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
import {
  buildReportModel,
  DEFAULT_OPTIONS,
  monthCountsParts,
  monthNoDataText,
  type EntryItem,
  type EventItem,
  type MonthSection,
  type ReportModel,
  type ReportOptions,
} from './model';
import { exportFileName } from './filenames';
import { generateReportPdf } from './pdf';

/** The report builder: options up top, a live light-ground preview, and a share/export button. */
export function ReportScreen({
  entries,
  events,
  gaps,
  meds,
  ratingWords,
  watchedFactors,
  patientName,
  onClose,
}: {
  entries: Entry[];
  events: MedEvent[];
  gaps: Gap[];
  meds: TrackedMed[];
  ratingWords: string[];
  watchedFactors: string[];
  patientName: string;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<ReportOptions>(DEFAULT_OPTIONS);
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('custom');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<ReportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  function pickRange(mode: 'all' | 'custom', s: string, e: string): ReportOptions['range'] {
    if (mode === 'all' || !s || !e) return null;
    return s <= e ? { start: s, end: e } : { start: e, end: s };
  }
  function onRangeMode(mode: 'all' | 'custom') {
    setRangeMode(mode);
    set({ range: pickRange(mode, customStart, customEnd) });
  }
  function onCustomDate(which: 'start' | 'end', v: string) {
    const s = which === 'start' ? v : customStart;
    const e = which === 'end' ? v : customEnd;
    if (which === 'start') setCustomStart(v);
    else setCustomEnd(v);
    set({ range: pickRange('custom', s, e) });
  }

  // Don't offer "What helped" when there's nothing to summarize (no attempt has ever been logged).
  const hasTreatments = useMemo(() => entries.some((e) => e.treatments.length > 0), [entries]);

  // The includeWatched gate lives here: off = the model never sees the watched factors.
  const model = useMemo(
    () =>
      buildReportModel(
        { entries, events, gaps, meds, ratingWords, watchedFactors: opts.includeWatched ? watchedFactors : [], patientName },
        opts,
        new Date()
      ),
    [entries, events, gaps, meds, ratingWords, watchedFactors, patientName, opts]
  );

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const now = new Date();
      const blob = await generateReportPdf(
        buildReportModel(
          { entries, events, gaps, meds, ratingWords, watchedFactors: opts.includeWatched ? watchedFactors : [], patientName },
          opts,
          now
        ),
        opts
      );
      const file = new File([blob], exportFileName(now), { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: `${nounCap()} report` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      // A user-cancelled share sheet throws AbortError — that's not an error worth showing.
      if ((e as Error)?.name !== 'AbortError') {
        setErr('Could not make the PDF. Your data is safe; try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const timelineOff = !opts.timeline;

  return (
    <div className="screen">
      <div className="scroll">
        <button type="button" className="back-btn" onClick={onClose}>
          ‹ back
        </button>
        <h1 className="screen-title">Report</h1>

        <div className="card report-controls">
          <div className="rc-group">
            <span className="rc-lbl">Date range</span>
            <div className="seg">
              <button
                type="button"
                className={'seg-opt' + (rangeMode === 'custom' ? ' on' : '')}
                aria-pressed={rangeMode === 'custom'}
                onClick={() => onRangeMode('custom')}
              >
                Custom range
              </button>
              <button
                type="button"
                className={'seg-opt' + (rangeMode === 'all' ? ' on' : '')}
                aria-pressed={rangeMode === 'all'}
                onClick={() => onRangeMode('all')}
              >
                All history
              </button>
            </div>
            {rangeMode === 'custom' && (
              <div className="rc-dates">
                <label className="field">
                  <span className="field-label">From</span>
                  <input type="date" value={customStart} onChange={(e) => onCustomDate('start', e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">To</span>
                  <input type="date" value={customEnd} onChange={(e) => onCustomDate('end', e.target.value)} />
                </label>
              </div>
            )}
          </div>

          <div className="rc-group">
            <span className="rc-lbl">Sections</span>
            <div className="rc-opts">
              <label className="rc-opt">
                <input
                  type="checkbox"
                  checked={opts.timeline}
                  onChange={(e) => set({ timeline: e.target.checked })}
                />
                Full timeline
              </label>
              <label className="rc-opt">
                <input
                  type="checkbox"
                  checked={opts.summaryTable}
                  onChange={(e) => set({ summaryTable: e.target.checked })}
                />
                Summary table
              </label>
              {watchedFactors.length > 0 && (
                <label className="rc-opt">
                  <input
                    type="checkbox"
                    checked={opts.includeWatched}
                    onChange={(e) => set({ includeWatched: e.target.checked })}
                  />
                  Watched factors
                </label>
              )}
              {hasTreatments && (
                <label className="rc-opt">
                  <input
                    type="checkbox"
                    checked={opts.includeOutcomes}
                    onChange={(e) => set({ includeOutcomes: e.target.checked })}
                  />
                  What helped
                </label>
              )}
            </div>
          </div>

          <div className={'rc-group' + (timelineOff ? ' disabled' : '')}>
            <span className="rc-lbl">Rating</span>
            <div className="seg">
              <button
                type="button"
                className={'seg-opt' + (opts.ratingMode === 'num' ? ' on' : '')}
                aria-pressed={opts.ratingMode === 'num'}
                disabled={timelineOff}
                onClick={() => set({ ratingMode: 'num' })}
              >
                Numbers + key
              </button>
              <button
                type="button"
                className={'seg-opt' + (opts.ratingMode === 'word' ? ' on' : '')}
                aria-pressed={opts.ratingMode === 'word'}
                disabled={timelineOff}
                onClick={() => set({ ratingMode: 'word' })}
              >
                Words
              </button>
            </div>
          </div>

          <div className={'rc-group' + (timelineOff ? ' disabled' : '')}>
            <span className="rc-lbl">Include</span>
            <div className="rc-opts">
              {(
                [
                  ['includeSymptoms', 'Symptoms'],
                  ['includeTreatments', 'Treatments'],
                  ['includeFactors', 'Other factors'],
                  ['includeNotes', 'Notes'],
                  ['includeEvents', 'Events'],
                ] as Array<[keyof ReportOptions, string]>
              ).map(([k, label]) => (
                <label className="rc-opt" key={k}>
                  <input
                    type="checkbox"
                    checked={Boolean(opts[k])}
                    disabled={timelineOff}
                    onChange={(e) => set({ [k]: e.target.checked } as Partial<ReportOptions>)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {err && <div className="report-err" role="alert">{err}</div>}

        <ReportPaper model={model} opts={opts} />
      </div>

      <div className="footer">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleExport()}>
          {busy ? 'Preparing…' : 'Export PDF'}
        </button>
      </div>
    </div>
  );
}

/** The light-ground preview. Mirrors the exported PDF field-for-field. */
function ReportPaper({ model, opts }: { model: ReportModel; opts: ReportOptions }) {
  const medCols = model.meds.length + model.watchedLabels.length;
  // The "No outcome" column only earns its width when something is actually missing.
  const anyMissing = model.outcomes.some((t) => t.noOutcome > 0);
  return (
    <div className="paper">
      <h1>{nounCap()} report</h1>
      <div className="p-sub">{model.subtitle}</div>

      {opts.summaryTable && (
        <>
          <div className="p-section">Monthly counts</div>
          <hr className="p-section-rule" />
          <table className="count-table">
            <thead>
              <tr>
                <th className="l">Month</th>
                <th>{nounCap()} days</th>
                <th>{nounCap()} entries</th>
                {model.meds.map((m) => (
                  <th key={m.name}>{m.name}</th>
                ))}
                {model.watchedLabels.map((l) => (
                  <th key={l}>{factorHeader(l)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.months.map((m) =>
                m.status === 'data' ? (
                  <tr key={m.key}>
                    <td className="l">{m.label}</td>
                    <td>{m.episodeDays}</td>
                    <td>{m.entryCount}</td>
                    {m.medDays.map((d) => (
                      <td key={d.name}>
                        {d.limit != null && d.days > d.limit ? <b>{d.days}</b> : d.days}
                      </td>
                    ))}
                    {m.breakouts.map((b) => (
                      <td key={b.label}>{b.days}</td>
                    ))}
                  </tr>
                ) : (
                  <tr className="nd" key={m.key}>
                    <td colSpan={3 + medCols}>
                      {m.label}: {monthNoDataText(m)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </>
      )}

      {opts.includeOutcomes && model.outcomes.length > 0 && (
        <>
          <div className="p-section">What helped</div>
          <hr className="p-section-rule" />
          {/* Scope before numbers. Every other section carries its own time markers (a Month
              column, dated entries); this one is a bare aggregate, so it has to say what period
              it covers and in what unit, near the table rather than pages away in the subtitle. */}
          <p className="p-note p-note-lead">{model.outcomesScope}</p>
          <table className="count-table">
            <thead>
              <tr>
                <th className="l">Treatment</th>
                <th>Helped</th>
                <th>Partly</th>
                <th>No</th>
                {anyMissing && <th>No outcome</th>}
              </tr>
            </thead>
            <tbody>
              {model.outcomes.map((t) => (
                <tr key={t.name}>
                  <td className="l">{t.name}</td>
                  <td>{t.yes}</td>
                  <td>{t.partly}</td>
                  <td>{t.no}</td>
                  {anyMissing && <td>{t.noOutcome}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {opts.timeline && (
        <>
          <div className="p-section">Timeline</div>
          <hr className="p-section-rule" />
          {/* The rating scale explains the numbers on the timeline's entries and nothing else, so
              it lives inside the timeline rather than orphaned at the top of the page. */}
          {model.showKey && (
            <div className="sev-keybox">
              <div className="sev-keyhead">Rating scale</div>
              <div className="sev-keygrid">
                {model.ratingKey.map(([n, w]) => (
                  <span key={n}>
                    <span className="kn">{n}</span> {w}
                  </span>
                ))}
              </div>
            </div>
          )}
          {model.months.map((m) => (
            <MonthBlock key={m.key} m={m} opts={opts} />
          ))}
          {model.months.length === 0 && <p className="p-nodata">No entries in this range.</p>}
        </>
      )}

      <div className="p-foot">
        <span>{model.preparedLabel}</span>
        <span>{SITE_DISPLAY}</span>
      </div>
    </div>
  );
}

function MonthBlock({ m, opts }: { m: MonthSection; opts: ReportOptions }) {
  return (
    <div>
      <div className={'mdiv' + (m.status !== 'data' ? ' nodata' : '')}>
        <span className="m">{m.label}</span>
        <span className="c">
          {monthCountsParts(m).map((p, i) => (
            <Fragment key={i}>
              {i > 0 ? '  ·  ' : ''}
              <span className={p.over ? 'over' : undefined}>{p.text}</span>
            </Fragment>
          ))}
        </span>
      </div>
      {m.status !== 'data' && <p className="p-nodata">{monthNoDataText(m)}</p>}
      {m.status === 'data' &&
        m.items.map((it, i) =>
          it.kind === 'entry' ? (
            <EntryBlock key={i} e={it} opts={opts} />
          ) : (
            <EventBlock key={i} v={it} />
          )
        )}
      {m.status === 'data' && m.partialGapReasons.length > 0 && (
        <p className="p-nodata" style={{ fontSize: '0.8125rem' }}>
          Partial data: {m.partialGapReasons.join('; ')}
        </p>
      )}
    </div>
  );
}

function EntryBlock({ e, opts }: { e: EntryItem; opts: ReportOptions }) {
  const dateStr = fmtDayShort(e.date) + (e.time ? ` · ${fmtTime(e.time)}` : '');
  const sevStr =
    opts.ratingMode === 'num'
      ? `  ·  ${e.rating == null ? '—' : e.rating}`
      : `  —  ${e.ratingWord}`;
  return (
    <div className="p-entry">
      <div className="top">
        <span className="dt">{dateStr}</span>
        <span className="sev">{sevStr}</span>
      </div>
      {opts.includeSymptoms && e.symptoms.length > 0 && (
        <div className="det">
          <span className="lbl">Symptoms:</span> {e.symptoms.join(', ')}
        </div>
      )}
      {opts.includeTreatments && e.treatments.length > 0 && (
        <div className="det">
          <span className="lbl">Treatments:</span>
          <div className="treat-lines">
            {e.treatments.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
      {opts.includeFactors && e.factors.length > 0 && (
        <div className="det">
          <span className="lbl">Other factors:</span> {e.factors.join(', ')}
        </div>
      )}
      {opts.includeNotes && e.notes.trim() && <div className="note">“{e.notes.trim()}”</div>}
    </div>
  );
}

function EventBlock({ v }: { v: EventItem }) {
  return (
    <div className="p-event">
      <div className="top">{fmtDayShort(v.date)} — Event</div>
      <div className="det">{v.note}</div>
    </div>
  );
}
