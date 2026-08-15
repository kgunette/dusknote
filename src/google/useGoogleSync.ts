import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  handleTokenRejected,
  hasValidToken,
  isConnected,
  signIn,
  signOut,
} from './auth';
import {
  adoptSheet,
  AUTH_REJECTED,
  createFreshSheet,
  ensureSheet,
  forgetSheet,
  getSheetId,
  getSheetUrl,
  needsSheetSetup,
  pullSnapshot,
  pushTabs,
} from './sheets';
import type { SheetCandidate } from './sheetChoice';
import { buildTabs, isEmptySnapshot, SHEET_SCHEMA_VERSION, type SyncSnapshot } from './serialize';
import { guardPush } from './reconcile';
import { forgetBackupState } from './backup';
import { importSnapshot, reconcileMerge, tombstoneEntryIds, prefs } from '../db';

// Connection states, the push engine, and pull/recovery.
export type SyncPhase =
  | 'disconnected' // never signed in on this device
  | 'preparing' // connected, setting up / finding the sheet
  | 'choose' // connected, more than one sheet (or one renamed): the person picks
  | 'ready' // connected, sheet in place
  | 'reconnect' // was connected, token gone and can't renew silently
  | 'error'; // sheet setup failed

const LAST_SYNCED_KEY = 'dn_last_synced';
const LAST_HASH_KEY = 'dn_last_synced_hash';
// Legacy localStorage key for the reconciled flag. The flag now lives durably in IndexedDB
// (prefs.reconciled), co-located with the data so an eviction resets it; this key is cleared only
// on disconnect, to tidy up older installs that still carry it.
const RECONCILED_KEY = 'dn_reconciled';

export interface GoogleSync {
  phase: SyncPhase;
  sheetUrl: string | null;
  error: string | null; // sheet-setup error
  candidates: SheetCandidate[] | null; // when phase === 'choose', the sheets to pick from
  chooseSheet: (id: string) => void; // adopt one of the candidates
  startFresh: () => void; // ignore the candidates and make a new sheet
  connect: () => void;
  disconnect: () => void;
  // sync engine
  syncing: boolean;
  restoring: boolean; // pulling history down on a fresh device
  backupError: string | null;
  lastSyncedAt: string | null;
  pending: number; // entries changed since the last successful backup
  dirty: boolean; // local differs from what's in the sheet
  online: boolean;
  syncNow: () => void;
}

export function useGoogleSync(
  snapshot: SyncSnapshot | null,
  onImported: () => Promise<void>
): GoogleSync {
  const [sheetUrl, setSheetUrl] = useState<string | null>(getSheetUrl());
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [candidates, setCandidates] = useState<SheetCandidate[] | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [reconciledLoaded, setReconciledLoaded] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    localStorage.getItem(LAST_SYNCED_KEY)
  );
  const [lastHash, setLastHash] = useState<string>(localStorage.getItem(LAST_HASH_KEY) ?? '');
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const reconcileRef = useRef(false); // one reconcile attempt per app session (survives StrictMode)

  // Find-or-create the sheet (and resolve the Entries gid) once we hold a token.
  useEffect(() => {
    if (!hasValidToken() || !needsSheetSetup()) return;
    let cancelled = false;
    const initial = getSheetUrl() == null; // no url yet = first setup; else a quiet gid upgrade
    if (initial) setPreparing(true);
    ensureSheet()
      .then((r) => {
        if (cancelled) return;
        if ('choose' in r) {
          setCandidates(r.choose); // ambiguous: hold in the 'choose' phase until the person picks
        } else {
          setSheetUrl(r.resolved.url);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(
          e.message === AUTH_REJECTED
            ? 'Google connection expired before setup finished. Reconnect to try again.'
            : `Could not set up the sheet. ${e.message}`
        );
      })
      .finally(() => {
        if (initial && !cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track connectivity so a push fires when the phone comes back online.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Include the sheet schema version so a header-only rename (which leaves the data unchanged)
  // still registers as dirty and forces one re-push to update the sheet's columns.
  const currentHash = useMemo(
    () => (snapshot ? JSON.stringify({ v: SHEET_SCHEMA_VERSION, snapshot }) : ''),
    [snapshot]
  );
  const dirty = snapshot != null && currentHash !== lastHash;
  const pending = useMemo(
    () =>
      snapshot
        ? snapshot.entries.filter((e) => !lastSyncedAt || e.updated_at > lastSyncedAt).length
        : 0,
    [snapshot, lastSyncedAt]
  );

  const doPush = useCallback(async () => {
    if (snapshot == null || !getSheetId() || !hasValidToken() || !reconciled) return; // never push before reconcile
    const hash = currentHash;
    setSyncing(true);
    setBackupError(null);
    try {
      // Guard: read the sheet and refuse to overwrite it with less than it holds. If the sheet is
      // ahead (records the phone lacks and has not deleted), merge them down instead of pushing;
      // the merged data then pushes safely on the next cycle. This is what enforces the invariant.
      const remote = await pullSnapshot(getSheetId()!);
      if (!guardPush(snapshot, remote, await tombstoneEntryIds()).safe) {
        await reconcileMerge(remote);
        await onImported();
        return;
      }
      await pushTabs(getSheetId()!, buildTabs(snapshot));
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNCED_KEY, now);
      localStorage.setItem(LAST_HASH_KEY, hash);
      setLastSyncedAt(now);
      setLastHash(hash);
    } catch (e) {
      if ((e as Error).message === AUTH_REJECTED) {
        handleTokenRejected();
        setBackupError('Google connection expired. Reconnect to back up.');
      } else {
        setBackupError("Couldn't back up. Your entries are saved on this phone.");
      }
    } finally {
      setSyncing(false);
    }
  }, [snapshot, currentHash, reconciled, onImported]);

  const ready = !error && isConnected() && hasValidToken() && !preparing && sheetUrl != null;

  // Load the durable reconciled flag from IndexedDB (co-located with the data) on mount, so the
  // decision below waits for the real value instead of assuming not-reconciled.
  useEffect(() => {
    void prefs.reconciled().then((v) => {
      setReconciled(v);
      setReconciledLoaded(true);
    });
  }, []);

  // Reconcile once per device. An empty phone that finds a sheet with data pulls it down (recovery).
  // A phone that has data AND meets a sheet with data MERGES the two, so neither side is lost. A
  // phone with data meeting an empty sheet adopts its own (first-ever setup). Either way, mark
  // reconciled in IndexedDB, beside the data, so push can take over.
  useEffect(() => {
    if (!ready || !reconciledLoaded || reconciled || snapshot == null || reconcileRef.current) return;
    reconcileRef.current = true;
    const localEmpty = isEmptySnapshot(snapshot);
    void (async () => {
      if (localEmpty) setRestoring(true);
      try {
        const pulled = await pullSnapshot(getSheetId()!);
        const remoteEmpty = !(pulled.entries.length || pulled.events.length || pulled.gaps.length);
        if (localEmpty && !remoteEmpty) {
          await importSnapshot(pulled); // recovery: adopt the sheet
          await onImported();
        } else if (!localEmpty && !remoteEmpty) {
          await reconcileMerge(pulled); // both have data: merge, never overwrite
          await onImported();
        }
        await prefs.setReconciled(true);
        setReconciled(true);
      } catch (e) {
        reconcileRef.current = false; // allow a retry on the next mount
        if ((e as Error).message === AUTH_REJECTED) handleTokenRejected();
        setBackupError('Could not sync with the sheet. Your local data is unchanged.');
      } finally {
        setRestoring(false);
      }
    })();
  }, [ready, reconciledLoaded, reconciled, snapshot, onImported]);

  // Auto-push, debounced, once reconciled and local drifts from the sheet.
  useEffect(() => {
    if (!ready || !reconciled || !online || !dirty || syncing) return;
    const t = setTimeout(() => {
      void doPush();
    }, 1500);
    return () => clearTimeout(t);
  }, [ready, reconciled, online, dirty, syncing, doPush]);

  const connect = useCallback(() => signIn(), []);
  const syncNow = useCallback(() => {
    void doPush();
  }, [doPush]);

  // The person resolved the chooser. Both paths finalize a sheet (cache id/url, migrate, gid), then
  // clear the candidates so the phase falls through to 'ready'; reconcile then merges local + sheet
  // safely. A failure surfaces the same setup error the initial resolve would.
  const finishChoice = useCallback((run: () => Promise<{ url: string }>) => {
    setPreparing(true);
    run()
      .then((s) => {
        setSheetUrl(s.url);
        setError(null);
      })
      .catch((e: Error) => {
        setError(
          e.message === AUTH_REJECTED
            ? 'Google connection expired before setup finished. Reconnect to try again.'
            : `Could not set up the sheet. ${e.message}`
        );
      })
      .finally(() => {
        setCandidates(null);
        setPreparing(false);
      });
  }, []);
  const chooseSheet = useCallback(
    (id: string) => finishChoice(() => adoptSheet(id)),
    [finishChoice]
  );
  const startFresh = useCallback(() => finishChoice(() => createFreshSheet()), [finishChoice]);

  const disconnect = useCallback(() => {
    signOut();
    void prefs.setConnected(false); // clear the durable mirror too, else launch would re-restore it
    forgetSheet();
    forgetBackupState();
    localStorage.removeItem(LAST_SYNCED_KEY);
    localStorage.removeItem(LAST_HASH_KEY);
    localStorage.removeItem(RECONCILED_KEY); // legacy key; the flag now lives in IndexedDB
    void prefs.setReconciled(false);
    reconcileRef.current = false;
    setSheetUrl(null);
    setError(null);
    setBackupError(null);
    setLastSyncedAt(null);
    setLastHash('');
    setReconciled(false);
    setCandidates(null);
  }, []);

  let phase: SyncPhase;
  if (error) phase = 'error';
  else if (!isConnected()) phase = 'disconnected';
  else if (!hasValidToken()) phase = 'reconnect';
  else if (preparing) phase = 'preparing';
  else if (candidates) phase = 'choose';
  else if (!sheetUrl) phase = 'preparing';
  else phase = 'ready';

  return {
    phase,
    sheetUrl,
    error,
    candidates,
    chooseSheet,
    startFresh,
    connect,
    disconnect,
    syncing,
    restoring,
    backupError,
    lastSyncedAt,
    pending,
    dirty,
    online,
    syncNow,
  };
}
