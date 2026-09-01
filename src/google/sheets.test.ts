import { describe, it, expect } from 'vitest';
import { planTabLayout } from './sheets';

// planTabLayout decides whether a tab the app renamed gets RENAMED (keeping its rows) or gets
// re-created empty beside the old one (stranding them). It was kept pure so it could be tested
// directly; it never had tests until the Preferences -> LogOptions rename made it load-bearing for
// a real person's data.

const tab = (title: string, index: number, sheetId = index + 100) => ({ title, sheetId, index });

/** The rename requests in a plan, as {sheetId, title} pairs. */
const renames = (requests: object[]) =>
  requests
    .map((r) => (r as { updateSheetProperties?: { properties: { sheetId: number; title?: string } } }).updateSheetProperties)
    .filter((u): u is { properties: { sheetId: number; title: string } } => !!u?.properties.title)
    .map((u) => ({ sheetId: u.properties.sheetId, title: u.properties.title }));

const adds = (requests: object[]) =>
  requests
    .map((r) => (r as { addSheet?: { properties: { title: string } } }).addSheet)
    .filter(Boolean)
    .map((a) => a!.properties.title);

describe('renaming Preferences to LogOptions', () => {
  const legacy = [tab('Entries', 0), tab('Events', 1), tab('Gaps', 2), tab('Preferences', 3)];

  it('renames the tab in place, so its rows come with it', () => {
    const { requests } = planTabLayout(legacy);
    expect(renames(requests)).toContainEqual({ sheetId: 103, title: 'LogOptions' });
  });

  it('does NOT also add an empty LogOptions tab, which would strand the data', () => {
    // The whole risk of this migration in one assertion: if the add-missing pass ran before the
    // rename, a person's options would sit in an orphaned "Preferences" tab while the app read an
    // empty new one and concluded they had no options at all.
    const { requests, addedTitles } = planTabLayout(legacy);
    expect(adds(requests)).not.toContain('LogOptions');
    expect(addedTitles).not.toContain('LogOptions');
  });

  it('leaves an existing LogOptions tab alone rather than clobbering it', () => {
    const both = [...legacy, tab('LogOptions', 4)];
    expect(renames(planTabLayout(both).requests)).not.toContainEqual({ sheetId: 103, title: 'LogOptions' });
  });

  it('still renames the older Coverage tab to Gaps', () => {
    const older = [tab('Entries', 0), tab('Events', 1), tab('Coverage', 2), tab('Preferences', 3)];
    const r = renames(planTabLayout(older).requests);
    expect(r).toContainEqual({ sheetId: 102, title: 'Gaps' });
    expect(r).toContainEqual({ sheetId: 103, title: 'LogOptions' });
  });
});

describe('a sheet that is already current', () => {
  it('asks for nothing at all, so a sync does no needless writing', () => {
    const current = [tab('Entries', 0), tab('Events', 1), tab('Gaps', 2), tab('LogOptions', 3)];
    expect(planTabLayout(current).requests).toEqual([]);
  });

  it('adds a tab someone deleted by hand', () => {
    const missing = [tab('Entries', 0), tab('Events', 1), tab('Gaps', 2)];
    expect(planTabLayout(missing).addedTitles).toEqual(['LogOptions']);
  });
});
