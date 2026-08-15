// A monthly, full-history PDF snapshot dropped into Drive. A dumb, durable,
// human-readable safety net that survives even if the app, the code, and the sheet all break.
//
// Client-triggered (no backend): on app open, if this month's snapshot doesn't exist yet, make
// one and upload it. The drive.file scope can't see the user's hand-made folders, so the app keeps
// its own backups folder in Drive root (movable; access follows the file).
//
// Self-contained on purpose: it reuses only the access token, never the verified push/pull sync
// path, so it can't disturb the sheet mirror.

import { APP_NAME } from '../config';
import { getToken, handleTokenRejected } from './auth';
import { AUTH_REJECTED } from './sheets';
import { pad } from '../lib';
import { backupFileName } from '../report/filenames';

const FOLDER_NAME = `${APP_NAME} backups`;
const FOLDER_ID_KEY = 'dn_backup_folder_id';
const BACKUP_MONTH_KEY = 'dn_backup_month'; // 'YYYY-MM' of the last confirmed snapshot

export type BackupResult = 'skipped' | 'uploaded' | 'exists' | 'no-auth' | 'offline' | 'busy' | 'error';

let running = false;

async function dfetch(url: string, opts: RequestInit = {}): Promise<any> {
  const t = getToken();
  if (!t) throw new Error(AUTH_REJECTED);
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${t.token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    handleTokenRejected();
    throw new Error(AUTH_REJECTED);
  }
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Find-or-create the app's backups folder in Drive root, remembering its id. */
async function ensureBackupFolder(): Promise<string> {
  const cached = localStorage.getItem(FOLDER_ID_KEY);
  if (cached) return cached;

  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const found = await dfetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive&pageSize=1`
  );
  let id: string | undefined = found.files?.[0]?.id;
  if (!id) {
    const created = await dfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    id = created.id as string;
  }
  localStorage.setItem(FOLDER_ID_KEY, id);
  return id;
}

async function fileExists(folderId: string, name: string): Promise<boolean> {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const data = await dfetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive&pageSize=1`
  );
  return (data.files?.length ?? 0) > 0;
}

/** Two steps: create the file's metadata (in the folder), then upload the PDF bytes to it. */
async function uploadPdf(folderId: string, name: string, blob: Blob): Promise<void> {
  const meta = await dfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' }),
  });
  await dfetch(`https://www.googleapis.com/upload/drive/v3/files/${meta.id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/pdf' },
    body: blob,
  });
}

/**
 * If this month's snapshot hasn't been made yet, make and upload it. Cheap no-op once done for
 * the month (a localStorage marker), so it's safe to call on every app open. Never throws:
 * a failure (offline, auth, API) just defers to the next opportunity.
 */
export async function monthlyBackupIfDue(makePdf: () => Promise<Blob>, now: Date): Promise<BackupResult> {
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (localStorage.getItem(BACKUP_MONTH_KEY) === month) return 'skipped';
  if (!getToken()) return 'no-auth';
  if (!navigator.onLine) return 'offline';
  if (running) return 'busy';

  running = true;
  try {
    const folderId = await ensureBackupFolder();
    const name = backupFileName(now);
    // Already there (e.g. made on another device this month)? Record it and move on.
    if (await fileExists(folderId, name)) {
      localStorage.setItem(BACKUP_MONTH_KEY, month);
      return 'exists';
    }
    await uploadPdf(folderId, name, await makePdf());
    localStorage.setItem(BACKUP_MONTH_KEY, month);
    return 'uploaded';
  } catch {
    // A stale or trashed folder id would fail the same way every month (an invisible broken backup).
    // Drop the cached id so the next attempt re-finds or recreates the folder; a transient error
    // just makes it re-find the same folder next time. Harmless either way.
    localStorage.removeItem(FOLDER_ID_KEY);
    return 'error'; // silent: try again next open
  } finally {
    running = false;
  }
}

/**
 * Status for the Settings Backup card, from the cached markers only (no network): the last month a
 * full snapshot was confirmed, and a link to the Drive backups folder (once it exists). Lets a
 * chronic, otherwise-silent backup failure become visible — the whole point is that a safety net
 * you think you have but don't is the exact failure this app was built to avoid.
 */
export function getBackupStatus(): { lastMonth: string | null; folderUrl: string | null } {
  const lastMonth = localStorage.getItem(BACKUP_MONTH_KEY);
  const folderId = localStorage.getItem(FOLDER_ID_KEY);
  return {
    lastMonth: lastMonth || null,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
  };
}

/** Clear cached backup state on sign-out, so a reconnect re-establishes cleanly. */
export function forgetBackupState(): void {
  localStorage.removeItem(FOLDER_ID_KEY);
  localStorage.removeItem(BACKUP_MONTH_KEY);
}
