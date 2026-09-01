// Google Sheets / Drive plumbing.
//
// Find-or-create the one app spreadsheet in the user's Drive and remember its id/url on the
// device. This file sets up the four tabs and their header rows; serialization lives next door.
//
// The drive.file scope can only ever see files this app created, so the Drive search
// below finds our own spreadsheet and nothing else in the user's Drive.

import { APP_NAME } from '../config';
import { getToken } from './auth';
import {
  headerOnlyTabs,
  LEGACY_OPTIONS_TAB,
  parseTabs,
  type SyncSnapshot,
  TAB_ORDER,
  type TabValues,
} from './serialize';
import { decideSheet, type SheetCandidate } from './sheetChoice';

const SHEET_NAME = APP_NAME;
const SHEET_ID_KEY = 'dn_sheet_id';
const SHEET_URL_KEY = 'dn_sheet_url';
const ENTRIES_GID_KEY = 'dn_sheet_entries_gid'; // so "Open the sheet" lands on Entries, not the last-viewed tab
const TABS_MIGRATED_KEY = 'dn_tabs_v3'; // one-time: rename Coverage->Gaps and Preferences->LogOptions, reorder to TAB_ORDER

/** Thrown when Google rejects the token (401). Caller surfaces a Reconnect prompt. */
export const AUTH_REJECTED = 'AUTH_REJECTED';

export function getSheetId(): string | null {
  return localStorage.getItem(SHEET_ID_KEY);
}

export function getSheetUrl(): string | null {
  return localStorage.getItem(SHEET_URL_KEY);
}

/** True until the sheet is fully resolved (id, Entries gid, open-url) and the tab migration ran. */
export function needsSheetSetup(): boolean {
  return (
    !getSheetId() ||
    !getSheetUrl() ||
    !localStorage.getItem(ENTRIES_GID_KEY) ||
    localStorage.getItem(TABS_MIGRATED_KEY) !== '1'
  );
}

/** Forget the cached sheet pointer (on sign-out). The sheet itself is untouched. */
export function forgetSheet(): void {
  localStorage.removeItem(SHEET_ID_KEY);
  localStorage.removeItem(SHEET_URL_KEY);
  localStorage.removeItem(ENTRIES_GID_KEY);
  localStorage.removeItem(TABS_MIGRATED_KEY);
}

interface TabProps {
  sheetId: number;
  title: string;
  index: number;
}

/**
 * Pure: given the sheet's current tabs, produce the batchUpdate requests to reach the desired
 * layout — rename a legacy "Coverage" tab to "Gaps", add any missing tab, and reorder to
 * TAB_ORDER. Kept separate from the network call so it can be tested directly.
 */
export function planTabLayout(current: TabProps[]): {
  requests: object[];
  addedTitles: string[];
} {
  const requests: object[] = [];
  const byTitle = new Map(current.map((t) => [t.title, { ...t }]));

  // Rename a tab that has been renamed in the app, PRESERVING its rows. This has to run before
  // the add-missing loop below, or that loop would create an empty tab under the new name and the
  // rename would never fire, leaving the data stranded in the old one. Guarded on the new name not
  // already existing, so it can never clobber a tab that is already there.
  const renameTab = (from: string, to: string) => {
    const old = byTitle.get(from);
    if (!old || byTitle.has(to)) return;
    requests.push({
      updateSheetProperties: { properties: { sheetId: old.sheetId, title: to }, fields: 'title' },
    });
    byTitle.set(to, { ...old, title: to });
    byTitle.delete(from);
  };
  renameTab('Coverage', 'Gaps'); // pre-2026-07
  renameTab(LEGACY_OPTIONS_TAB, 'LogOptions'); // pre-2026-09-01

  // Add any tab that's missing entirely (e.g. one was manually deleted).
  const addedTitles: string[] = [];
  for (const title of TAB_ORDER) {
    if (!byTitle.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
      addedTitles.push(title);
    }
  }

  // Reorder existing tabs to TAB_ORDER, but only if they're not already in order. Move each to
  // index 0 in reverse desired order: prepending is unambiguous, sidestepping the Sheets API's
  // off-by-one when moving a sheet to a *higher* index.
  const present = TAB_ORDER.filter((t) => byTitle.has(t));
  const currentOrder = [...byTitle.values()]
    .sort((a, b) => a.index - b.index)
    .map((t) => t.title)
    .filter((t) => (TAB_ORDER as readonly string[]).includes(t));
  if (currentOrder.join(',') !== present.join(',')) {
    for (const title of [...present].reverse()) {
      requests.push({
        updateSheetProperties: { properties: { sheetId: byTitle.get(title)!.sheetId, index: 0 }, fields: 'index' },
      });
    }
  }

  return { requests, addedTitles };
}

/** One-time: bring an existing sheet's tabs to the current names and order. */
async function ensureTabLayout(id: string): Promise<void> {
  const meta = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,index)`
  );
  const current: TabProps[] = (meta.sheets ?? []).map((s: { properties: TabProps }) => s.properties);
  const { requests, addedTitles } = planTabLayout(current);
  if (requests.length === 0) return;

  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
  // Give any freshly-added tab its header row.
  if (addedTitles.length) {
    await writeTabs(id, headerOnlyTabs().filter((t) => addedTitles.includes(t.title)));
  }
}

/** A link that opens the sheet on the Entries tab when the gid is known. */
function openUrl(id: string, gid: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  return gid != null ? `${base}#gid=${gid}` : base;
}

async function gfetch(url: string, opts: RequestInit = {}): Promise<any> {
  const t = getToken();
  if (!t) throw new Error(AUTH_REJECTED);
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${t.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) throw new Error(AUTH_REJECTED);
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

interface DriveSheet {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
}

/**
 * List every spreadsheet this app created in the user's Drive. The drive.file scope guarantees the
 * result is only ever our own sheets, never anything else in their Drive, and dropping the name
 * filter means a sheet renamed in Drive still turns up (it is still one we created). Ordered
 * oldest-first, so the original leads a split-brain pair.
 */
async function listCandidates(): Promise<DriveSheet[]> {
  const params = new URLSearchParams({
    q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id,name,createdTime,modifiedTime)',
    spaces: 'drive',
    pageSize: '50',
    orderBy: 'createdTime',
  });
  const data = await gfetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  return (data.files ?? []) as DriveSheet[];
}

/** The gid of the Entries tab, for deep-linking. Stored once, then reused. */
async function fetchEntriesGid(id: string): Promise<string | null> {
  const data = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`
  );
  const entries = (data.sheets ?? []).find((s: any) => s.properties?.title === 'Entries');
  return entries ? String(entries.properties.sheetId) : null;
}

/** Create the spreadsheet with its four tabs and write the header rows. Returns its id. */
async function createSheet(): Promise<string> {
  const created = await gfetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: SHEET_NAME },
      sheets: TAB_ORDER.map((title) => ({ properties: { title } })),
    }),
  });
  const id = created.spreadsheetId as string;
  // Capture the Entries gid straight from the create response (no extra call).
  const entries = (created.sheets ?? []).find((s: any) => s.properties?.title === 'Entries');
  if (entries) localStorage.setItem(ENTRIES_GID_KEY, String(entries.properties.sheetId));

  await writeTabs(id, headerOnlyTabs());
  return id;
}

/** Write each tab's values at A1 (does not clear stale rows on its own). */
async function writeTabs(id: string, tabs: TabValues[]): Promise<void> {
  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: tabs.map((t) => ({ range: `${t.title}!A1`, values: t.values })),
    }),
  });
}

/**
 * Wholesale-rewrite every tab from local state, safe-by-construction: WRITE the new values first
 * (each tab overwrites from A1 down), THEN clear only the rows *below* the new data (stale rows left
 * over when the data shrank). The sheet therefore always holds at least the current data — it is
 * never momentarily empty. Worst case if the trim step fails: a few stale trailing rows that the
 * next successful push cleans up (a harmless resurrection, self-healing), never a wiped sheet.
 * (Was clear-then-write, which left the sheet empty between the two calls — a mid-push interruption
 * plus a phone switch could then lose all history, the exact disaster this app exists to prevent.)
 */
export async function pushTabs(id: string, tabs: TabValues[]): Promise<void> {
  await writeTabs(id, tabs);
  // Clear from the first row past the new data (values.length rows written, header included) to the
  // bottom, per tab. Clearing a range beyond existing rows is a safe no-op.
  const trailing = tabs.map((t) => `${t.title}!A${t.values.length + 1}:Z`);
  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: trailing }),
  });
}

/** Read every tab and parse it back into a local snapshot (new-phone recovery). */
export async function pullSnapshot(id: string): Promise<SyncSnapshot> {
  const params = TAB_ORDER.map((t) => `ranges=${encodeURIComponent(`${t}!A:Z`)}`).join('&');
  const data = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}`
  );
  const raw: Record<string, string[][]> = {};
  (data.valueRanges ?? []).forEach((vr: { values?: string[][] }, i: number) => {
    raw[TAB_ORDER[i]] = vr.values ?? [];
  });
  return parseTabs(raw);
}

export type SheetResolution =
  | { resolved: { id: string; url: string } }
  | { choose: SheetCandidate[] };

// Drive's search index can lag a few seconds behind a sheet that really exists. If the first listing
// comes back empty we wait this long and list once more, so we never create a duplicate on a false
// empty (the split-brain the fresh-miss review flagged).
const RECHECK_DELAY_MS = 2500;

/**
 * Resolve the device's spreadsheet. If one is already cached, just finalize it (a quiet gid/url
 * upgrade). Otherwise list the app's own sheets in Drive and decide: create a fresh one (nothing
 * found, a first-time setup), adopt the single named one (new-phone recovery), or hand the
 * candidates back for the person to choose (two or more, or one renamed). Never guesses when it's
 * ambiguous, because guessing wrong could orphan a history.
 */
export async function ensureSheet(): Promise<SheetResolution> {
  const cached = getSheetId();
  if (cached) return { resolved: await finalizeSheet(cached) };

  let candidates = await listCandidates();
  if (candidates.length === 0) {
    await new Promise((r) => setTimeout(r, RECHECK_DELAY_MS));
    candidates = await listCandidates();
  }

  const decision = decideSheet(candidates, SHEET_NAME);
  if (decision.kind === 'create') return { resolved: await finalizeSheet(await createSheet()) };
  if (decision.kind === 'adopt') return { resolved: await finalizeSheet(decision.id) };
  return { choose: await enrichCandidates(candidates) };
}

/** The person picked one of the sheets the chooser offered: adopt it. */
export async function adoptSheet(id: string): Promise<{ id: string; url: string }> {
  return finalizeSheet(id);
}

/** The person chose "start fresh": make a new sheet and use it. The other sheets are left untouched. */
export async function createFreshSheet(): Promise<{ id: string; url: string }> {
  return finalizeSheet(await createSheet());
}

/** Read each candidate's entry count for the chooser. A candidate we can't read still lists (as 0). */
async function enrichCandidates(files: DriveSheet[]): Promise<SheetCandidate[]> {
  return Promise.all(
    files.map(async (f) => {
      let entryCount = 0;
      try {
        entryCount = (await pullSnapshot(f.id)).entries.length;
      } catch {
        // Leave the count at 0 rather than letting one unreadable sheet block the whole chooser.
      }
      return {
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        entryCount,
      };
    })
  );
}

/**
 * Cache the chosen sheet's id, run the one-time tab migration, resolve the Entries gid, cache the
 * open-url. Shared by adopt, create, create-fresh, and the quiet re-run on an already-cached sheet.
 * The migration runs before the gid is cached, because a fresh device must migrate the sheet it just
 * adopted before push/pull use the new tab names.
 */
async function finalizeSheet(id: string): Promise<{ id: string; url: string }> {
  localStorage.setItem(SHEET_ID_KEY, id);

  if (localStorage.getItem(TABS_MIGRATED_KEY) !== '1') {
    await ensureTabLayout(id);
    localStorage.setItem(TABS_MIGRATED_KEY, '1');
  }

  let gid = localStorage.getItem(ENTRIES_GID_KEY);
  if (gid == null) {
    gid = await fetchEntriesGid(id);
    if (gid != null) localStorage.setItem(ENTRIES_GID_KEY, gid);
  }

  const url = openUrl(id, gid);
  localStorage.setItem(SHEET_URL_KEY, url);
  return { id, url };
}
