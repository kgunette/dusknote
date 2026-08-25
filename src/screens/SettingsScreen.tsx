import { useRef, useState } from 'react';
import type { Gap } from '../types';
import { fmtDateFull, fmtMonth, fmtRelativeTime, uid } from '../lib';
import { AppMark } from '../components/AppMark';
import { XCircleIcon } from '../components/icons';
import { getBackupStatus } from '../google/backup';
import { type GoogleSync } from '../google/useGoogleSync';
import { APP_NAME, APP_VERSION, GOOGLE_CLIENT_ID, SITE_URL } from '../config';
import { parseImportCsv } from '../importCsv';

// Injected at build time by vite.config.ts (the git short SHA). Shown in the footer so the
// deployed version is verifiable: if it doesn't match the latest commit, the app is serving a
// stale cached build, which a service worker can do for a surprisingly long time.
declare const __BUILD__: string;

type ImportResult = { entries: number; events: number; gaps: number };

/** One honest line about the backup, local-save always the reassuring fallback. */
function backupStatusText(g: GoogleSync): string {
  if (g.restoring) return 'Restoring your history…';
  if (g.syncing) return 'Backing up…';
  if (g.backupError) return g.backupError;
  if (!g.online) return "Offline. Will back up when you're back on.";
  if (g.dirty) {
    return g.pending > 0 ? `${g.pending} change${g.pending > 1 ? 's' : ''} pending` : 'Changes pending';
  }
  if (g.lastSyncedAt) return `All backed up · ${fmtRelativeTime(g.lastSyncedAt)}`;
  return 'Not backed up yet.';
}

/** External-link glyph on the "Open the sheet" link (it opens Google in a new tab). */
function ExternalLinkIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 5h5v5" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M18.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18V7.5A1.5 1.5 0 0 1 6.5 6H11" />
    </svg>
  );
}

/** Utilitarian list: backup status, tracked medications, coverage gaps. (Events live in the feed.) */
export function SettingsScreen({
  google,
  gaps,
  hasEntries,
  patientName,
  onPatientName,
  onGaps,
  onImport,
  onOpenReport,
  onOpenLogOptions,
}: {
  google: GoogleSync;
  gaps: Gap[];
  /** Whether the local store holds any entries. Distinguishes a device that already has data
   *  (post-logout: "Reconnect", history is here) from a genuinely fresh one ("Connect", new-phone
   *  recovery copy). */
  hasEntries: boolean;
  /** The name printed on the report/backup PDFs; committed on blur so per-keystroke changes
   *  never churn the sync snapshot. */
  patientName: string;
  onPatientName: (name: string) => void;
  onGaps: (g: Gap[]) => void;
  onImport: (data: unknown) => Promise<ImportResult>;
  onOpenReport: () => void;
  onOpenLogOptions: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false); // "Start fresh with a new sheet" confirm
  // Coverage-gap editor: null = closed, { id: null } = adding a new gap, { id } = editing that gap.
  const [gapEditor, setGapEditor] = useState<{ id: string | null } | null>(null);
  const [gStart, setGStart] = useState('');
  const [gEnd, setGEnd] = useState('');
  const [gReason, setGReason] = useState('');
  const [gError, setGError] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Local draft of the report name; committed to the app (and the synced pref) on blur.
  const [nameDraft, setNameDraft] = useState(patientName);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const parsed = parseImportCsv(await file.text());
      if (!parsed.data) {
        // Whole-file reject: nothing merged. The message lists row-and-column problems,
        // written to be pasted back to an AI assistant (or found in a spreadsheet app).
        setImportMsg(parsed.errors.join('\n'));
        return;
      }
      const r = await onImport(parsed.data);
      const parts = [
        `${r.entries} ${r.entries === 1 ? 'entry' : 'entries'}`,
        `${r.events} ${r.events === 1 ? 'event' : 'events'}`,
        `${r.gaps} ${r.gaps === 1 ? 'gap' : 'gaps'}`,
      ];
      // "Backing up now" is only true when a connected sync can actually run; a device that
      // hasn't connected Google yet (the guide's own order allows importing first) gets the
      // honest tail instead.
      const backingUp = google.phase === 'ready' || google.phase === 'preparing';
      setImportMsg(
        r.entries + r.events + r.gaps === 0
          ? 'Nothing new to import. It looks like this file is already in.'
          : `Imported ${parts.join(', ')}. ${backingUp ? 'Backing up now.' : 'It will back up when you connect Google.'}`
      );
    } catch {
      setImportMsg('Could not read that file. It should be a CSV exported or converted per the import guide.');
    } finally {
      setImporting(false);
    }
  }

  // Sign-in is a full-page redirect that reboots the app; leave a marker so it returns here.
  // localStorage survives the redirect in an iOS home-screen app; sessionStorage does not.
  function handleConnect() {
    localStorage.setItem('dn_return_tab', 'settings');
    google.connect();
  }

  function openNewGap() {
    setGapEditor({ id: null });
    setGStart('');
    setGEnd('');
    setGReason('');
    setGError(false);
  }
  function openEditGap(g: Gap) {
    setGapEditor({ id: g.id });
    setGStart(g.start);
    setGEnd(g.end);
    setGReason(g.reason);
    setGError(false);
  }
  function cancelGap() {
    setGapEditor(null);
    setGError(false);
  }
  function saveGap() {
    // Start and end are required; reason is optional.
    if (!gStart || !gEnd) {
      setGError(true);
      return;
    }
    // The pickers' min/max already keep the dates in order; normalize as a safety net.
    const [start, end] = gStart <= gEnd ? [gStart, gEnd] : [gEnd, gStart];
    const id = gapEditor?.id ?? uid();
    const next = { id, start, end, reason: gReason.trim() };
    onGaps([...gaps.filter((x) => x.id !== id), next].sort((a, b) => b.start.localeCompare(a.start)));
    setGapEditor(null);
    setGError(false);
  }

  // One editor form, shown either in place of the gap being edited or below the list when adding.
  const gapForm = (
    <div className="col" style={{ gap: 12 }}>
      <div className="dt-row">
        <label className="field">
          <span className="field-label">From</span>
          <input
            type="date"
            value={gStart}
            max={gEnd || undefined}
            className={gError && !gStart ? 'inp-error' : undefined}
            onChange={(e) => setGStart(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input
            type="date"
            value={gEnd}
            min={gStart || undefined}
            className={gError && !gEnd ? 'inp-error' : undefined}
            onChange={(e) => setGEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Reason</span>
        <textarea
          className="ta"
          value={gReason}
          placeholder="Optional"
          onChange={(e) => setGReason(e.target.value)}
        />
        <span className="caption">
          If left blank, Stats and the report show &ldquo;No records for this period.&rdquo;
        </span>
      </label>
      {gError && (
        <div className="form-error" role="alert">
          <span className="form-error-dot" aria-hidden="true" /> Add both a start and end date.
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn-quiet" style={{ width: 'auto' }} onClick={cancelGap}>
          Cancel
        </button>
        <button type="button" className="btn-accent" onClick={saveGap}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="screen">
      <div className="scroll">
        <h1 className="screen-title">Settings</h1>

        <div className="card col">
          <div className="card-title">Backup</div>

          {google.phase === 'disconnected' && !GOOGLE_CLIENT_ID && (
            <div className="caption">
              Google backup isn’t set up for this copy of the app yet (it needs a Google Client
              ID, a later setup step). Your entries still save on this device. The setup guide
              covers connecting your own Google account.
            </div>
          )}
          {google.phase === 'disconnected' && GOOGLE_CLIENT_ID && (
            <>
              <div className="caption">
                {hasEntries
                  ? 'Connect your Google account to back up to a Google Sheet. Your entries are safe on this phone.'
                  : 'Connect your Google account to back up to a Google Sheet. On a new phone, sign in with the same account and your full history comes back.'}
              </div>
              <button type="button" className="btn-primary" onClick={handleConnect}>
                Connect Google
              </button>
            </>
          )}

          {google.phase === 'preparing' && (
            <div className="muted" style={{ fontSize: '1rem' }}>
              Setting up your sheet…
            </div>
          )}

          {google.phase === 'choose' && google.candidates && (
            <>
              <div className="prompt">Which sheet should {APP_NAME} use?</div>
              <div className="caption">
                {google.candidates.length > 1
                  ? `${APP_NAME} found more than one sheet it created. Pick the one you’d like to use. The others stay in your Drive, untouched.`
                  : `${APP_NAME} found a sheet it created under a different name. Use it to bring your history back, or start fresh.`}
              </div>

              {google.candidates.map((c) => {
                const count = `${c.entryCount} ${c.entryCount === 1 ? 'entry' : 'entries'}`;
                const dates = `created ${fmtDateFull(c.createdTime.slice(0, 10))} · last updated ${fmtDateFull(
                  c.modifiedTime.slice(0, 10)
                )}`;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="sheet-pick"
                    onClick={() => google.chooseSheet(c.id)}
                    aria-label={`Use ${c.name}, ${count}, ${dates}`}
                  >
                    <span className="sheet-name">{c.name}</span>
                    <span className="sheet-count">{count}</span>
                    <span className="sheet-dates">{dates}</span>
                  </button>
                );
              })}

              <hr className="hair-rule" />

              {confirmFresh ? (
                <>
                  <div className="prompt">Start fresh with a new sheet?</div>
                  <div className="caption">
                    {APP_NAME} will create a new sheet named &ldquo;{APP_NAME}&rdquo; and back up to
                    it from now on. Your other sheets stay in your Drive, untouched.
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-quiet"
                      style={{ width: 'auto' }}
                      onClick={() => setConfirmFresh(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-accent"
                      onClick={() => {
                        setConfirmFresh(false);
                        google.startFresh();
                      }}
                    >
                      Start fresh
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button type="button" className="text-btn" onClick={() => setConfirmFresh(true)}>
                    Start fresh with a new sheet
                  </button>
                </div>
              )}
            </>
          )}

          {google.phase === 'ready' &&
            (() => {
              // Option 1: status reads as the caption line, one context button (Back up now when
              // there's something to sync, otherwise Open sheet), and a demoted quiet sign-out.
              const needsBackup =
                google.online && !google.syncing && !google.restoring && (google.dirty || google.backupError);
              const dotState =
                google.syncing || google.restoring
                  ? 'busy'
                  : google.backupError || !google.online || google.dirty
                    ? 'pending'
                    : 'ok';
              const bk = getBackupStatus();
              return (
                <>
                  {/* Two bullets. First: what the two backups are, plus the read-only-in-app
                      boundary (the sheet is rewritten on every sync, so it has no memory and a
                      direct edit is lost on the next push; the monthly PDFs are the only thing
                      here that keeps a deleted entry). Second: the one-device guidance, its
                      subject named so "one device" reads as using the app, not the backup. */}
                  <div className="cap-list">
                    <div className="cap-item">
                      <span className="cap-bullet" aria-hidden="true">
                        •
                      </span>
                      <span>
                        <span className="cap-lead">Two backups in your own Google Drive</span>: a
                        live sheet to read or export, and monthly PDF snapshots. Make changes in the
                        app only; sheet edits won&rsquo;t sync back.
                      </span>
                    </div>
                    <div className="cap-item">
                      <span className="cap-bullet" aria-hidden="true">
                        •
                      </span>
                      <span>
                        <span className="cap-lead">{APP_NAME} works best on one device.</span> Your
                        data is safe on several, but the copies can drift out of step.
                      </span>
                    </div>
                  </div>

                  <span className="sync-line">
                    <span className="sync-dot" data-state={dotState} aria-hidden="true" />
                    {/* The text is the only carrier of sync state (the dot is decorative), and it
                        changes on its own as a backup runs. Announce it politely. */}
                    <span className="muted" role="status" style={{ fontSize: '1rem' }}>
                      {backupStatusText(google)}
                    </span>
                  </span>

                  {needsBackup ? (
                    <button type="button" className="btn-secondary" onClick={google.syncNow}>
                      {google.backupError ? 'Try again' : 'Back up now'}
                    </button>
                  ) : (
                    <>
                      <div className="btn-stack">
                        {google.sheetUrl && (
                          <a
                            className="btn-secondary link-block"
                            href={google.sheetUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open sheet <ExternalLinkIcon />
                          </a>
                        )}
                        {bk.folderUrl && (
                          <a
                            className="btn-secondary link-block btn-stacked"
                            href={bk.folderUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {/* "Open backups" lines up with "Open sheet"; the last-backup month
                                hangs just below, so this button extends a little further down. The
                                month is the backup status — a stale month is the chronic-failure signal. */}
                            <span className="btn-main">
                              Open backups <ExternalLinkIcon />
                            </span>
                            <span className="btn-sub">
                              {bk.lastMonth ? fmtMonth(bk.lastMonth) : 'none yet'}
                            </span>
                          </a>
                        )}
                      </div>
                      {!bk.folderUrl && <div className="caption">Monthly backup · none yet</div>}
                    </>
                  )}

                  {signingOut ? (
                    <div className="cta-row" style={{ justifyContent: 'center' }}>
                      <span className="muted" style={{ fontSize: '1rem' }}>
                        Sign out of Google?
                      </span>
                      <span>
                        <button
                          type="button"
                          className="text-btn"
                          style={{ color: 'var(--text)' }}
                          onClick={() => {
                            google.disconnect();
                            setSigningOut(false);
                          }}
                        >
                          Sign out
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          style={{ color: 'var(--muted)' }}
                          onClick={() => setSigningOut(false)}
                        >
                          Cancel
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div className="backup-quiet">
                      {needsBackup && (
                        <>
                          {google.sheetUrl && (
                            <a
                              className="text-btn link-inline"
                              href={google.sheetUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open sheet <ExternalLinkIcon />
                            </a>
                          )}
                          {bk.folderUrl && (
                            <a
                              className="text-btn link-inline"
                              href={bk.folderUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open backups <ExternalLinkIcon />
                            </a>
                          )}
                        </>
                      )}
                      <button type="button" className="btn-signout" onClick={() => setSigningOut(true)}>
                        Sign out of Google
                      </button>
                    </div>
                  )}
                </>
              );
            })()}

          {google.phase === 'reconnect' && (
            <>
              <div className="muted" style={{ fontSize: '1rem' }}>
                Reconnect to back up. Your entries are safe on this phone.
              </div>
              <button type="button" className="btn-primary" onClick={handleConnect}>
                Reconnect Google
              </button>
            </>
          )}

          {google.phase === 'error' && (
            <>
              <div className="muted" style={{ fontSize: '1rem' }}>
                {google.error} Your entries are saved on this phone either way.
              </div>
              <button type="button" className="btn-primary" onClick={handleConnect}>
                Reconnect Google
              </button>
            </>
          )}

          <div className="caption" style={{ opacity: 0.6, marginTop: 2, textAlign: 'right' }}>
            v{APP_VERSION} &middot; build {__BUILD__}
          </div>
        </div>

        <div className="card col">
          <div className="card-title">Report</div>
          <div className="caption">
            A printable report: monthly counts and your full log, over any date range.
          </div>
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              type="text"
              value={nameDraft}
              placeholder="Optional"
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => onPatientName(nameDraft)}
            />
          </label>
          <span className="caption">Printed at the top of your report.</span>
          <button type="button" className="btn-secondary" onClick={onOpenReport}>
            Create report
          </button>
        </div>

        <div className="card col">
          <div className="card-title">Log options</div>
          <div className="caption">
            Everything you can tap when you log: medications (and their limits), remedies, symptoms,
            and factors. Archive what you no longer use, add new options, or set a medication's
            monthly limit.
          </div>
          <button type="button" className="btn-secondary" onClick={onOpenLogOptions}>
            Manage log options
          </button>
        </div>

        <div className="card col">
          <div className="card-title">Coverage gaps</div>
          <div className="caption">
            Known ranges with no records, so that missing data isn't counted as zero.
          </div>
          {gaps.map((g) =>
            gapEditor && gapEditor.id === g.id ? (
              <div key={g.id}>{gapForm}</div>
            ) : (
              <div className="gap-item" key={g.id}>
                <button type="button" className="gap-edit" onClick={() => openEditGap(g)}>
                  <span className="gap-date">
                    {fmtDateFull(g.start)} – {fmtDateFull(g.end)}
                  </span>
                  {g.reason && <span className="muted small">{g.reason}</span>}
                  <span className="gap-hint">Tap to edit</span>
                </button>
                {removing === g.id ? (
                  <span>
                    <button
                      type="button"
                      className="text-btn"
                      style={{ color: 'var(--text)' }}
                      onClick={() => {
                        onGaps(gaps.filter((x) => x.id !== g.id));
                        setRemoving(null);
                      }}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      style={{ color: 'var(--muted)' }}
                      onClick={() => setRemoving(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove this gap"
                    onClick={() => setRemoving(g.id)}
                  >
                    <XCircleIcon />
                  </button>
                )}
              </div>
            )
          )}
          {gapEditor && gapEditor.id === null ? (
            gapForm
          ) : (
            <button type="button" className="btn-secondary" onClick={openNewGap}>
              Add gap
            </button>
          )}
        </div>

        <div className="card col">
          <div className="card-title">Import</div>
          <div className="caption">
            Import historical records from a CSV file with the same columns as your {APP_NAME}{' '}
            sheet (an Entries, Events, or Gaps table). Adds to the log (but never replaces), and
            then backs up to the Google Spreadsheet. A file with any problem imports nothing.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="text/csv,.csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV file'}
          </button>
          {importMsg && (
            // Arrives asynchronously, and on a rejected file it's a list of row-and-column
            // problems. Without a live region a screen reader never learns the import finished.
            <div
              className="muted small"
              role="status"
              style={{ fontSize: '1rem', whiteSpace: 'pre-wrap' }}
            >
              {importMsg}
            </div>
          )}
        </div>

        {/* The maker's mark. No personal name: attribution lives in LICENSE (which MIT makes every
            fork carry) and on the other end of this link, and a stranger's own health tracker
            shouldn't wear someone else's name. "in Brooklyn" is the 2010s "Made in NYC" convention,
            a nod to the city's tech scene rather than a personal location.

            rel="noreferrer" is load-bearing, not boilerplate: the app's Referrer-Policy trims the
            path but still sends the origin, so without it dusknote.app's logs would slowly collect
            the URLs of people's private deployments. Don't remove it. */}
        <a
          className="caption footer-mark"
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <AppMark size={22} />
          <span>
            {APP_NAME}, made with <span style={{ color: 'var(--accent)' }}>♥</span> in Brooklyn
          </span>
        </a>
      </div>
    </div>
  );
}
