import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChipDef, Entry, Gap, MedEvent, StatsFilter, VocabItem } from './types';
import {
  ensureVocab,
  importBackfill,
  listEntries,
  prefs,
  putEntry,
  renameLabelInEntries,
  tombstoneEntry,
} from './db';
import { activeChips, dailyLimits, resolveAddItem, statsMeds, watchedFactors } from './vocab';
import { setConditionNoun } from './config';
import { LogOptionsScreen } from './screens/LogOptionsScreen';
import { ImportReviewScreen } from './screens/ImportReviewScreen';
import { planPrefsImport } from './importPrefs';
import type { PrefFile } from './importCsv';
import { TabBar, TAB_ORDER, type Tab } from './components/TabBar';
import { EntryForm } from './components/EntryForm';
import { ScreenFocus } from './components/ScreenFocus';
import { EventForm } from './components/EventForm';
import { FeedScreen } from './screens/FeedScreen';
import { StatsScreen } from './screens/StatsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useGoogleSync } from './google/useGoogleSync';
import { UpdateBanner } from './components/UpdateBanner';
import { BackupBanner } from './components/BackupBanner';

// The report pulls in pdfmake + an embedded font (a few MB). Lazy-load it so logging — the
// common path — never downloads or parses any of that. The same heavy code powers the monthly
// auto-backup, which dynamic-imports it below.
const ReportScreen = lazy(() =>
  import('./report/ReportScreen').then((m) => ({ default: m.ReportScreen }))
);

export default function App() {
  // A sign-in redirect reboots the app on the default tab. If it was launched from Settings,
  // a marker (set just before the redirect) brings us back there instead of landing on Log.
  // Which tab to open on. A cold start always opens on Log: that is what the app is for, and
  // reopening on Settings would be wrong. But when the page reloads UNDER the person, the tab
  // they were on is restored, because from where they sit nothing happened and being moved is
  // confusing. Two things reload the page: the service worker's post-deploy auto-update, and the
  // sign-in redirect. The first shows up as a 'reload' navigation; the second comes back as a
  // fresh navigation from Google, so it leaves its own marker before it goes.
  // localStorage, not sessionStorage: the latter is cleared across the OAuth redirect in an iOS
  // home-screen app.
  const [tab, setTab] = useState<Tab>(() => {
    if (localStorage.getItem('dn_return_tab') === 'settings') return 'settings';
    const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return 'log';
    const saved = localStorage.getItem('dn_tab');
    return TAB_ORDER.includes(saved as Tab) ? (saved as Tab) : 'log';
  });
  const [entries, setEntries] = useState<Entry[] | null>(null);
  // The merged vocabulary is the single source of truth. The legacy shapes the rest of
  // the app still speaks — tap options (chips), and the counted/shown medications — are derived.
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const chips = useMemo(() => activeChips(vocab), [vocab]);
  // Stats/Report count only medications that carry a limit (a med with no limit is log-only).
  const medsForStats = useMemo(() => statsMeds(vocab), [vocab]);
  // The log form's daily counts. Its own derivation, so the form never learns about VocabItem.
  const dailyForLog = useMemo(() => dailyLimits(vocab), [vocab]);
  const watchedForStats = useMemo(() => watchedFactors(vocab), [vocab]);
  const [ratingWords, setRatingWords] = useState<string[]>([]); // editable 1–5 words
  // Personalization settings (4c): the noun lives in config's module value for render-time
  // reads; this state mirror exists to re-render the tree when it changes and to feed the sync
  // snapshot. The name feeds the report + snapshot only.
  const [conditionNoun, setConditionNounState] = useState('episode');
  const [patientName, setPatientNameState] = useState('');
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [events, setEvents] = useState<MedEvent[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null); // an existing entry, opened from the feed
  const [creating, setCreating] = useState(false); // a brand-new entry ("Log a new episode")
  const [editingEvent, setEditingEvent] = useState<MedEvent | null>(null); // an existing event, from the feed
  const [creatingEvent, setCreatingEvent] = useState(false); // a brand-new event ("Add an event")
  const [showReport, setShowReport] = useState(false); // the report builder, opened from Settings
  const [showLogOptions, setShowLogOptions] = useState(false); // the Log options manager, from Settings
  // A picked Preferences file, waiting on the review screen. Holding it here changes nothing:
  // the file is only read, and Cancel drops it.
  const [prefsFile, setPrefsFile] = useState<{ prefs: PrefFile; name: string } | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(() => localStorage.getItem('dn_show_events') !== '0');
  const [statsFilter, setStatsFilter] = useState<StatsFilter | null>(null); // #8: a Stats tap → filtered Log
  const [navDir, setNavDir] = useState<'fwd' | 'back'>('fwd'); // slide direction for the tab transition
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null); // swipe-gesture origin

  // A Stats tap opens the Log filtered to those entries. Land on the feed with the filter active;
  // the feed shows a chip + count + clear.
  const openStatsFilter = useCallback((f: StatsFilter) => {
    setStatsFilter(f);
    setTab('log');
  }, []);

  const toggleEvents = useCallback(() => {
    setShowEvents((v) => {
      localStorage.setItem('dn_show_events', v ? '0' : '1');
      return !v;
    });
  }, []);
  const closeForm = useCallback(() => {
    setEditing(null);
    setCreating(false);
    setEditingEvent(null);
    setCreatingEvent(false);
  }, []);

  // The one path for changing tabs (the tab bar and swipe both call it): note the slide direction,
  // drop any overlay / marker / Stats filter, then switch. A manual tab move is a clean reset.
  const goTab = useCallback(
    (t: Tab) => {
      setNavDir(TAB_ORDER.indexOf(t) >= TAB_ORDER.indexOf(tab) ? 'fwd' : 'back');
      localStorage.removeItem('dn_return_tab'); // consume the post-reconnect marker on first navigation
      localStorage.setItem('dn_tab', t); // where to come back to if the page reloads under us
      closeForm();
      setShowReport(false);
      setShowLogOptions(false);
      setPrefsFile(null);
      setStatsFilter(null);
      setTab(t);
    },
    [tab, closeForm]
  );

  const reload = useCallback(async () => {
    const [e, v, rw, g, ev, noun, name] = await Promise.all([
      listEntries(),
      ensureVocab(), // one-time migration on first run, then just reads the stored vocab
      prefs.ratingWords(),
      prefs.gaps(),
      prefs.events(),
      prefs.conditionNoun(),
      prefs.patientName(),
    ]);
    setEntries(e);
    setVocab(v);
    setRatingWords(rw);
    setGaps(g);
    setEvents(ev);
    setConditionNoun(noun); // keep the render-time module value in step (e.g. after recovery)
    setConditionNounState(noun);
    setPatientNameState(name);
  }, []);

  // Personalization handlers (4c). The noun updates three places in one move: the module value
  // (render-time reads), this state (re-render + snapshot), and the pref (persistence).
  const changeNoun = useCallback((n: string) => {
    setConditionNoun(n);
    setConditionNounState(n);
    void prefs.setConditionNoun(n);
  }, []);
  const changePatientName = useCallback((n: string) => {
    const name = n.trim();
    setPatientNameState(name);
    void prefs.setPatientName(name);
  }, []);

  // Everything the sheet mirrors. Memoized so the sync engine only fires on real changes.
  const snapshot = useMemo(
    () => (entries ? { entries, vocab, ratingWords, gaps, events, conditionNoun, patientName } : null),
    [entries, vocab, ratingWords, gaps, events, conditionNoun, patientName]
  );
  // reload is the "import happened, refresh from IndexedDB" callback for new-phone recovery.
  const google = useGoogleSync(snapshot, reload);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Once connected and holding data, drop this month's full-history PDF snapshot into
  // Drive. A cheap no-op after the first success each month (guarded inside monthlyBackupIfDue).
  // The PDF machinery is dynamic-imported so it stays out of the initial bundle.
  useEffect(() => {
    if (google.phase !== 'ready' || !snapshot || snapshot.entries.length === 0) return;
    const now = new Date();
    const snap = snapshot;
    void (async () => {
      const [{ monthlyBackupIfDue }, { generateReportPdf }, { buildReportModel, BACKUP_OPTIONS }] =
        await Promise.all([
          import('./google/backup'),
          import('./report/pdf'),
          import('./report/model'),
        ]);
      await monthlyBackupIfDue(
        () =>
          generateReportPdf(
            buildReportModel(
              {
                entries: snap.entries,
                events: snap.events,
                gaps: snap.gaps,
                meds: statsMeds(snap.vocab),
                ratingWords: snap.ratingWords,
                watchedFactors: watchedFactors(snap.vocab), // BACKUP_OPTIONS is everything-on
                patientName: snap.patientName,
              },
              BACKUP_OPTIONS,
              now
            ),
            BACKUP_OPTIONS
          ),
        now
      );
    })();
  }, [google.phase, snapshot]);

  const saveEntry = useCallback(
    async (e: Entry) => {
      await putEntry(e);
      await reload();
    },
    [reload]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      await tombstoneEntry(id);
      await reload();
    },
    [reload]
  );

  // Adding a tap option from the log form runs through the SAME resolver as the Log options
  // manager (one set of collision rules for both surfaces). The form resolves without a message:
  // create or revive as needed, and an existing active name needs no change. Nothing interrupts
  // the person mid-record, because the form has already selected the label they typed.
  //
  // It states NO fields (2026-08-31), so a revived treatment keeps its own mark and both of its
  // limits. Typing the name of a medication you archived must never quietly turn it back into an
  // unmarked treatment and drop the limits with it. Whether a treatment is a medication is decided
  // in Log options, where the explanation lives.
  const addChip = useCallback(
    async (chip: ChipDef) => {
      const current = (await prefs.vocab()) ?? (await ensureVocab());
      const res = resolveAddItem(current, chip.type, chip.label);
      if (res.status === 'created' || res.status === 'revived') {
        await prefs.setVocab(res.vocab);
        await reload();
      }
    },
    [reload]
  );

  // The Log options manager edits the vocabulary wholesale: archive/restore, delete,
  // add, edit a limit. One setter persists and lets the derivations + sync follow.
  const updateVocab = useCallback((next: VocabItem[]) => {
    setVocab(next);
    void prefs.setVocab(next);
  }, []);

  // Editable 1–5 rating words. One setter persists + lets the form/report/sync follow.
  const updateRatingWords = useCallback((next: string[]) => {
    setRatingWords(next);
    void prefs.setRatingWords(next);
  }, []);

  // Rename rewrites the label across every past entry, then updates the vocab
  // item (or merges it into an existing same-type item, folding the two histories under one name).
  // The rewritten entries + new vocab both re-push on the next sync. reload picks up both.
  const renameVocabItem = useCallback(
    async (
      item: VocabItem,
      newLabel: string,
      // What the sheet set besides the name: the medication mark and either limit. Widened from a
      // bare limit (2026-08-31) so one save can carry a rename and a mark change together.
      fields: Partial<VocabItem>,
      mergeInto: VocabItem | null
    ) => {
      const field = item.type === 'symptom' ? 'symptom' : item.type === 'factor' ? 'factor' : 'treatment';
      // On a MERGE the existing target's name wins — the typed text only pointed at it, so its
      // casing is ignored (otherwise "testing"→"dizziness" would recase the real "Dizziness" and
      // leave its own past entries reading differently). A plain rename uses the typed newLabel.
      const canonical = mergeInto ? mergeInto.label : newLabel;
      await renameLabelInEntries(field, item.label, canonical);
      const next = mergeInto
        ? vocab
            .filter((v) => v !== item)
            .map((v) =>
              v === mergeInto
                ? {
                    ...v, // keep the target's label, mark and limits as-is; what the sheet held
                    // described the item being merged AWAY, so it must not overwrite the target
                    // (changing its mark or limit would drop it from Stats and report counts).
                    archived: v.archived && item.archived, // active if either was active
                  }
                : v
            )
        : vocab.map((v) => (v === item ? { ...v, label: newLabel, ...fields } : v));
      await prefs.setVocab(next);
      await reload();
    },
    [vocab, reload]
  );

  const updateGaps = useCallback((g: Gap[]) => {
    setGaps(g);
    void prefs.setGaps(g);
  }, []);

  const updateEvents = useCallback((ev: MedEvent[]) => {
    setEvents(ev);
    void prefs.setEvents(ev);
  }, []);

  const saveEvent = useCallback(
    (ev: MedEvent) => {
      const next = [...events.filter((e) => e.id !== ev.id), ev].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      updateEvents(next);
    },
    [events, updateEvents]
  );

  const removeEvent = useCallback(
    (id: string) => updateEvents(events.filter((e) => e.id !== id)),
    [events, updateEvents]
  );

  // Merge a backfill file (entries/events/gaps) into local, then refresh + let sync push it up.
  const importData = useCallback(
    async (data: { entries: Entry[]; events: MedEvent[]; gaps: Gap[] }) => {
      const res = await importBackfill(data);
      await reload();
      return res;
    },
    [reload]
  );

  // A Preferences file, worked out against what this device holds. One pass produces both the
  // list the review screen shows and the result Apply writes, so the screen cannot promise one
  // thing while the app does another. Nothing here writes: this runs on every render of the
  // review screen and must stay free of side effects.
  const prefsPlan = useMemo(
    () =>
      prefsFile
        ? planPrefsImport(prefsFile.prefs, { vocab, ratingWords, conditionNoun, patientName })
        : null,
    [prefsFile, vocab, ratingWords, conditionNoun, patientName]
  );

  const applyPrefs = useCallback(() => {
    if (!prefsPlan) return;
    const { changes, next } = prefsPlan;
    // Only write what actually changed: an identical rewrite would still churn the sync snapshot.
    if (changes.changed.length || changes.added.length) updateVocab(next.vocab);
    if (changes.ratings.length) updateRatingWords(next.ratingWords);
    if (changes.noun) changeNoun(next.conditionNoun);
    if (changes.name) changePatientName(next.patientName);
    const backingUp = google.phase === 'ready' || google.phase === 'preparing';
    setAppliedNotice(
      `Changes applied. ${backingUp ? 'Backing up now.' : 'They will back up when you connect Google.'}`
    );
    setPrefsFile(null);
  }, [prefsPlan, updateVocab, updateRatingWords, changeNoun, changePatientName, google.phase]);

  if (!entries) {
    return (
      <div className="app">
        <div className="scroll">
          <span className="muted">Loading…</span>
        </div>
      </div>
    );
  }

  const entryFormOpen = editing != null || creating;
  const eventFormOpen = editingEvent != null || creatingEvent;
  // Swipe navigation (Option A) is live only on a plain tab screen — never over a full-screen form,
  // the report, or the Log options manager.
  const overlayOpen = entryFormOpen || eventFormOpen || showReport || showLogOptions || prefsPlan != null;
  // One key per distinct surface. Changing it is what tells ScreenFocus a navigation happened.
  const surfaceKey = entryFormOpen
    ? 'entry-form'
    : eventFormOpen
      ? 'event-form'
      : prefsPlan
        ? 'import-review'
        : showReport
          ? 'report'
          : showLogOptions
            ? 'log-options'
            : tab;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s || overlayOpen) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Require a deliberate, dominantly-horizontal flick so vertical scrolling is never hijacked.
    if (Date.now() - s.t > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TAB_ORDER.indexOf(tab);
    const next = dx < 0 ? Math.min(i + 1, TAB_ORDER.length - 1) : Math.max(i - 1, 0);
    if (next !== i) goTab(TAB_ORDER[next]);
  };

  return (
    <div className="app" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <UpdateBanner />
      {/* The backup banner lives on the Log screen only (where an unbacked logging window would
          happen) and never over an open form. It surfaces the silent reconnect state and confirms
          a successful reconnect; both are no-ops otherwise. */}
      {tab === 'log' && !overlayOpen && (
        <BackupBanner phase={google.phase} onReconnect={google.connect} />
      )}
      {/* Swapping tab or opening a form unmounts the whole subtree, dropping focus to <body>: a
          keyboard user then tabs from the top of the document with no announcement that the
          screen changed, and again on the way back. Keying this wrapper on the current surface
          makes it remount, and the effect inside moves focus to the new screen's heading. */}
      <ScreenFocus surface={surfaceKey} />
      <div className={'screen-slide ' + navDir} key={tab}>
        {entryFormOpen ? (
        <EntryForm
          dailyLimits={dailyForLog}
          entries={entries}
          key={editing ? editing.id + editing.updated_at : 'new'}
          existing={editing ?? undefined}
          chips={chips}
          ratingWords={ratingWords}
          onSave={saveEntry}
          afterSave={closeForm}
          onCancel={closeForm}
          onDelete={
            editing
              ? async (id) => {
                  await deleteEntry(id);
                  closeForm();
                }
              : undefined
          }
          onAddChip={addChip}
        />
      ) : eventFormOpen ? (
        <EventForm
          key={editingEvent ? editingEvent.id + editingEvent.updated_at : 'new-event'}
          existing={editingEvent ?? undefined}
          onSave={saveEvent}
          afterSave={closeForm}
          onCancel={closeForm}
          onDelete={
            editingEvent
              ? (id) => {
                  removeEvent(id);
                  closeForm();
                }
              : undefined
          }
        />
      ) : prefsPlan ? (
        <ImportReviewScreen
          changes={prefsPlan.changes}
          fileName={prefsFile?.name ?? ''}
          onApply={applyPrefs}
          onCancel={() => setPrefsFile(null)}
        />
      ) : tab === 'log' ? (
        <FeedScreen
          entries={entries}
          events={events}
          showEvents={showEvents}
          onToggleEvents={toggleEvents}
          onOpen={setEditing}
          onOpenEvent={setEditingEvent}
          onNew={() => {
            setStatsFilter(null); // a brand-new entry may not match the active filter — show the full feed
            setCreating(true);
          }}
          onNewEvent={() => {
            setStatsFilter(null);
            setCreatingEvent(true);
          }}
          filter={statsFilter}
          onClearFilter={() => setStatsFilter(null)}
        />
      ) : showReport ? (
        <Suspense
          fallback={
            <div className="screen">
              <div className="scroll">
                <span className="muted">Loading…</span>
              </div>
            </div>
          }
        >
          <ReportScreen
            entries={entries}
            events={events}
            gaps={gaps}
            meds={medsForStats}
            ratingWords={ratingWords}
            watchedFactors={watchedForStats}
            patientName={patientName}
            onClose={() => setShowReport(false)}
          />
        </Suspense>
      ) : showLogOptions ? (
        <LogOptionsScreen
          vocab={vocab}
          entries={entries}
          ratingWords={ratingWords}
          conditionNoun={conditionNoun}
          onNounChange={changeNoun}
          onVocabChange={updateVocab}
          onRename={renameVocabItem}
          onRatingWordsChange={updateRatingWords}
          onClose={() => setShowLogOptions(false)}
        />
      ) : tab === 'stats' ? (
        <StatsScreen
          entries={entries}
          gaps={gaps}
          meds={medsForStats}
          ratingWords={ratingWords}
          watchedFactors={watchedForStats}
          onFilter={openStatsFilter}
        />
        ) : (
          <SettingsScreen
            google={google}
            gaps={gaps}
            hasEntries={entries.length > 0}
            patientName={patientName}
            onPatientName={changePatientName}
            onGaps={updateGaps}
            onImport={importData}
            onPrefsFile={(prefs, name) => {
              setAppliedNotice(null);
              setPrefsFile({ prefs, name });
            }}
            appliedNotice={appliedNotice}
            onOpenReport={() => setShowReport(true)}
            onOpenLogOptions={() => setShowLogOptions(true)}
          />
        )}
      </div>
      <TabBar tab={tab} onTab={goTab} />
    </div>
  );
}
