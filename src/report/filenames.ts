// PDF file names. Kept light (no pdfmake) so the auto-backup path — reached from the
// main bundle via useGoogleSync — doesn't pull the heavy PDF library into the initial download.

import { APP_NAME, nounCap } from '../config';
import { pad } from '../lib';

/** "2026-07 Dusknote Backup.pdf" — the rolling monthly-snapshot name, date first so backups sort chronologically. */
export function backupFileName(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)} ${APP_NAME} Backup.pdf`;
}

/** "2026-07-04 Dusknote Episode Report.pdf" — a manual export, date first so exports sort chronologically. */
export function exportFileName(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${APP_NAME} ${nounCap()} Report.pdf`;
}
