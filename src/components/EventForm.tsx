import { useMemo, useState } from 'react';
import type { MedEvent } from '../types';
import { SAVED_FLASH_MS, toISODate, uid } from '../lib';

/**
 * The medical-event editor, opened from the feed for a new event or to edit an existing one.
 * Small on purpose: an event is just a date and a note (MRI, med change, appointment).
 */
export function EventForm({
  existing,
  onSave,
  afterSave,
  onCancel,
  onDelete,
}: {
  existing?: MedEvent;
  onSave: (ev: MedEvent) => void | Promise<void>;
  afterSave: () => void;
  onCancel: () => void;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const now = useMemo(() => new Date(), []);
  const [date, setDate] = useState(existing?.date ?? toISODate(now));
  const [note, setNote] = useState(existing?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const dirty = date !== (existing?.date ?? toISODate(now)) || note !== (existing?.note ?? '');

  async function handleSave() {
    if (saved) return;
    if (!note.trim()) {
      setError(true);
      return;
    }
    const ev: MedEvent = {
      id: existing?.id ?? uid(),
      date,
      note: note.trim(),
      updated_at: new Date().toISOString(),
    };
    setSaved(true);
    await onSave(ev);
    window.setTimeout(afterSave, SAVED_FLASH_MS);
  }

  return (
    <div className="screen">
      <div className="scroll form-scroll">
        <button type="button" className="back-btn" onClick={onCancel}>
          ‹ {dirty ? 'Cancel' : 'Back'}
        </button>

        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || date)} />
        </label>

        <label className="field">
          <span className="field-label">What happened</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {existing &&
          onDelete &&
          (confirmDelete ? (
            <div className="confirm-row">
              <span>Delete this event?</span>
              <button type="button" className="text-btn" onClick={() => void onDelete(existing.id)}>
                Delete
              </button>
              <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(true)}>
              Delete event
            </button>
          ))}
      </div>

      <div className="footer">
        {error && !note.trim() && (
          <div className="form-error" role="alert" style={{ marginBottom: 8 }}>
            <span className="form-error-dot" aria-hidden="true" /> Add a description to save.
          </div>
        )}
        <button type="button" className="btn-primary" onClick={() => void handleSave()}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}
