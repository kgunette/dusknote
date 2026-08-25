# Bringing your historical data into Dusknote

If you've been tracking in another app, a spreadsheet, or a journal, that history can come with you into Dusknote. Dusknote imports CSV files whose columns are exactly the columns of its own Google Sheet, so an import file looks just like your data already does: readable, checkable, and fixable in any spreadsheet app.

An import always **adds**; it never replaces or deletes anything. Importing the same file twice is safe, because rows the app already has are recognized and skipped. And a file with any problem imports **nothing**: the app rejects it whole and tells you the exact row and column of each problem, so a half-broken file can never mix bad rows into your record or reach your sheet.

## Three ways to format the historical data for import

**With AI**
- **You have an export from another app:** use the conversion prompt below to turn it into Dusknote's format.
- **You have notes, a journal, or are rebuilding from memory:** the same prompt handles input from a variety of sources; it will ask questions rather than make assumptions about it.

**Manually, without AI**
- **You'd rather assemble it yourself:** build the file manually in any spreadsheet app, following the exact format below. The blank templates give you each file's headers ready-made; fill in your rows, save as CSV, and import. No AI needed.

The Import option in the app can be found at **Settings → Import CSV file**.

**A note on privacy, and using AI to format the import:** your health history is sensitive, and if you opt to use AI, that means pasting this sensitive data into an AI chat. Use an AI assistant only if you're comfortable with it, or assemble the file manually instead. This is the only place in Dusknote's guides where personal data would get entered into a chat window, and it's your decision to make.

## The file format

You can import three kinds of files: entries, events, or gaps. You don't have to tell the app which one you're giving it; it reads the first row of the file (the column names) and recognizes the kind from there. Only the columns listed as required need to exist; leave out any others you have no data for.

**Entries** (template: [entries-template.csv](templates/entries-template.csv))

| Column                    | Rule                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                      | Required. `2026-03-05` format.                                                                                                                      |
| Start                     | Optional. 24-hour time, like `08:30` (the app displays it as 8:30 AM).                                                                               |
| Rating                    | Optional. Blank, or a whole number 0 to 5. Blank means not recorded; 0 means a symptom-only day.                                                    |
| Rating word               | Leave blank; the app fills it.                                                                                                                      |
| Symptoms                  | Optional. Separated by `; ` like `Nausea; Fatigue`.                                                                                                 |
| Treatments                | Optional. Each attempt as `time name` with an optional outcome arrow: `08:30 Ibuprofen → yes; 09:15 Coffee`. Outcomes are `yes`, `partly`, or `no`. |
| Other factors             | Optional. Separated by `; `.                                                                                                                        |
| Notes                     | Optional. Free text.                                                                                                                                |
| Source                    | Optional. Blank, `normal`, or `backfilled`. Imported history is `backfilled`.                                                                       |
| ID, Logged at, Updated at | Leave blank and the app fills them. One exception: if this file came out of a Dusknote sheet, yours or an older instance of it, keep these columns as they are. The import preserves them, so your entries keep their real IDs and the times you actually recorded them. |

**Events** (template: [events-template.csv](templates/events-template.csv)): `Date` (required, same format) and `Note` (required; an appointment, a scan, a medication change).

**Gaps** (template: [gaps-template.csv](templates/gaps-template.csv)): `Start` and `End` dates (required), `Reason` (optional). A gap marks a range you know you weren't tracking, so missing time is never mistaken for good time.

Limits: a file can hold up to 20,000 rows and 2 MB. Bigger histories import fine as several files.

**Whatever spreadsheet you use, check the dates before you import.** Excel, Numbers, and Google Sheets all like to rewrite a date like `2026-03-05` into a shorter local form like `3/5/26`, and Dusknote rejects the whole file when they do. Set the Date column's format to `yyyy-mm-dd` before you save the file. To verify that the dates are formatted correctly, open the saved file in TextEdit on a Mac or Notepad on Windows: those show the file exactly as it is, without applying formatting of their own.

## When a file is rejected

The message lists each problem by row and column, like `Row 14, Date: expected a date like 2026-03-05, got "3/5/26".` It's written to be pasted straight back to whatever produced the file: give it to your assistant and ask for a corrected file, or find row 14 yourself in a spreadsheet app. Nothing was imported, so there's nothing to undo; fix and import again.

## What you still have to set up yourself

Import brings your history: your entries, events, and gaps. It doesn't bring your personalization. After importing, go to **Settings → Log options** and add the things you track: your medications and how many days a month you can take each one, your symptoms, your remedies, the other factors you want to keep an eye on, the words you want for the 1 to 5 ratings, and the word for what you're tracking (episode, headache, flare). Medication is only counted once you've given it a monthly limit, so this will impact how your Stats are reflected.

When you log an entry, you pick from your own lists: your medications, your symptoms, and so on. Your imported history may mention things that aren't on those lists, like a medication you stopped taking years ago. The app adds each of them so your old entries still make sense, but files them under **Archived** instead of putting them on the lists you tap every day. Anything you still use, you can move back to your active list with one tap.

Important note: changing the Google Sheet by hand won't change the information in the app. The app is where your data lives, and its next backup will overwrite whatever you typed into the sheet.

## The historical data conversion prompt

Paste this into your AI chat, then provide your export or notes when it asks.

```
I need my health-tracking history converted into the CSV import format of
Dusknote, my own self-hosted tracker. I'll give you my data (an export from
another app, or my own notes) and you produce the CSV.

Data-integrity rules, which outrank everything else:
- Never invent anything. No made-up ratings, dates, times, symptoms, or
  outcomes. If the source doesn't say it, the cell stays blank.
- Blank is always correct for missing information. A missing rating stays a
  missing rating.
- When the source is ambiguous, stop and ask me instead of guessing, and if
  I don't know either, leave it blank and tell me which rows are affected.
- Convert formats only: dates to YYYY-MM-DD, times to 24-hour HH:MM. Never
  shift, reinterpret, or "clean up" the underlying facts.

The format. A file is one of three kinds, identified by its header row, and
each kind is its own file:

1. Entries. Header exactly:
   Date,Start,Rating,Rating word,Symptoms,Treatments,Other factors,Notes,Source,ID,Logged at,Updated at
   - Date required, YYYY-MM-DD.
   - Start optional, 24-hour HH:MM.
   - Rating optional: blank, or a whole number 0-5 ONLY if the source
     clearly states a severity on a comparable scale. 0 means "symptoms but
     no episode". Do not map vague words to numbers without asking me first.
   - Rating word: always blank.
   - Symptoms and Other factors: items separated by "; ".
   - Treatments: attempts separated by "; ", each as "HH:MM Name" with the
     outcome appended as " → yes", " → partly", or " → no" only when the
     source states one. Time can be omitted if unknown ("Name" alone).
   - Source: "backfilled".
   - ID, Logged at, Updated at: always blank.
2. Events (appointments, scans, medication changes). Header exactly:
   Date,Note
3. Gaps (ranges I wasn't tracking). Header exactly:
   Start,End,Reason

Output real CSV in a code block, one block per file, no example rows, no
commentary inside the block. Quote any field containing a comma. If my data
spans entries and events, produce two files. Suggest a Gaps file if my data
shows obvious untracked stretches, but let me decide.

If the app rejects the file, I'll paste its error message back to you; it
names each problem's row and column. Fix only what it names.

Ask me now for my data, and ask what scale my ratings used before mapping
any of them.
```
