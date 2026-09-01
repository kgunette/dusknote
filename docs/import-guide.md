# Bringing your historical data into Dusknote

If you've been tracking in another app, a spreadsheet, or a journal, that history can come with you into Dusknote. Dusknote imports CSV files whose columns are exactly the columns of its own Google Sheet, so an import file looks just like your data already does: readable, checkable, and fixable in Google Sheets or a text editor.

There are two kinds of import file and they behave differently. Your history (entries, events, gaps) is only ever added to: rows the app already has are recognized and skipped, so importing the same file twice is safe and nothing you have is replaced. Your log options can be changed by a file import, so the app lists every change first and waits for you to Apply.

In both cases, a file with any problem imports nothing, and shows you what is wrong. The app shows an error message, and tells you the exact row and column of each problem, so that you can fix it before trying to re-import it again.

## Three ways to format the historical data for import

**With AI**
- **You have an export from another app:** use the conversion prompt below to turn it into Dusknote's format.
- **You have notes, a journal, or are rebuilding from memory:** the same prompt handles input from a variety of sources; it will ask questions rather than make assumptions about it.

**Manually, without AI**
- **You'd rather assemble it yourself:** build the file manually in Google Sheets or a text editor, following the exact format below. The blank templates give you each file's headers ready-made; fill in your rows, save as CSV, and import. No AI needed.

The Import option in the app can be found at **Settings → Import CSV file**.

**A note on privacy, and using AI to format the import:** your health history is sensitive, and if you opt to use AI, that means pasting this sensitive data into an AI chat. Use an AI assistant only if you're comfortable with it, or assemble the file manually instead. This is the only place in Dusknote's guides where personal data would get entered into a chat window, and it's your decision to make.

## What to do first

If you have any tracking history to import, do that import first. The app reads the treatment, symptom and factor names out of your entries and puts the names on your log options lists on your device. Everything will be imported unmarked. After the import, you can then mark any of your medications under Settings → Log options by tapping the pill next to each one. Add a limit to any you want counted in Stats and your report.

If you also have a log options file, import that too and it sets the medication marks and limits for you. Either file can be imported first, the result is the same.

If you have no history to import, set your options up manually at Settings → Log options.

## The file format

You can import four kinds of file: entries, events, gaps, or your log options. You don't have to tell the app which one you're giving it; it reads the first row of the file (the column names) and recognizes the kind from there. Only the columns listed as required need to exist; leave out any others you have no data for.

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

**Log options** (template: [logoptions-template.csv](templates/logoptions-template.csv)). This is the one file that can change something you already have, so the app lists every change and waits for you to Apply before anything happens.

The rule: **anything the file has a setting for, it overwrites. Anything it doesn't have a setting for, nothing changes.** Leave out a whole column and the app keeps its own answer for every row.

| Column     | Rule                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Kind       | Required. `item` for an option, `rating` for a rating word, `setting` for the word you track or the name on your report.  |
| Label      | Required. The option's name; for a `rating` row the word itself; for a `setting` row the value.                           |
| Type       | Required. On an `item` row: `symptom`, `treatment`, or `factor`. On a `rating` row: the level, 1 to 5. On a `setting` row: `noun` for the word you track, `name` for the report name. |
| Medication | Optional. The word `medication` on a treatment that is one, blank on any that isn't.                                      |
| MonthlyLimit | Optional. A monthly limit: a whole number of days, 1 or more. Only on a medication.                                   |
| DailyLimit | Optional. A daily limit: a whole number of doses, 1 or more. Only on a medication.                                       |
| Archived   | Optional. The word `archived`, or blank.                                                                                 |
| Watched    | Optional. The word `watched` on a factor, or blank.                                                                      |

Older files still import. Before September 2026 the Type column carried `medication` and `remedy` instead of `treatment` plus a Medication column, the monthly limit's column was called `Limit`, and the tab in your sheet was called `Preferences`. The app reads all of those, and renames the tab in your own sheet the next time it syncs, keeping its rows.

Limits: a file can hold up to 20,000 rows and 2 MB. Bigger histories import fine as several files.

**Whatever spreadsheet you use, check the dates before you import.** Excel, Numbers, and Google Sheets all like to rewrite a date like `2026-03-05` into a shorter local form like `3/5/26`, and Dusknote rejects the whole file when they do. Set the Date column's format to `yyyy-mm-dd` before you save the file. To verify that the dates are formatted correctly, open the saved file in TextEdit on a Mac or Notepad on Windows: those show the file exactly as it is, without applying formatting of their own.

## When a file is rejected

The message lists each problem by row and column, like `Row 14, Date: expected a date like 2026-03-05, got "3/5/26".` It's written to be pasted straight back to whatever produced the file: give it to your assistant and ask for a corrected file, or find row 14 yourself in a spreadsheet app. Nothing was imported, so there's nothing to undo; fix and import again.

## What import doesn't pull in

Importing your history includes pulling in any names of treatments, symptoms, or factors mentioned in the history. It doesn't pull in which treatments are medications, what their limits are, which factors you want watched, the words you want for the 1 to 5 ratings, and the word for what you're tracking. Those live at Settings → Log options.

If you have a log options file, this is an exception. It carries all of those details, and it will require you to review and approve the import before applying the changes.

Important note: changing the Google Sheet by hand won't change the information in the app. The app is where your data lives, and its next backup will overwrite whatever you typed into the sheet.

## The historical data conversion prompt

Paste this into your AI chat, then provide your export or notes when it asks.

The prompt asks your assistant to mark which treatments are drugs, because it can tell and the app can't. Nothing it marks takes effect until you've seen it: the app lists every change and waits for you to Apply.

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

The format. A file is one of four kinds, identified by its header row, and
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
4. Log options: which of the treatments are medications. Header exactly:
   Kind,Label,Type,Medication
   - One row per distinct treatment named in the entries file, spelled
     identically to how it appears there.
   - Kind: always "item". Type: always "treatment".
   - Medication: the word "medication" on a treatment that is a drug,
     prescription or over-the-counter. Blank on everything else: a hot
     shower, a nap, coffee, rest, an ice pack.
   - Use only those four columns. Never add Limit, DailyLimit, Archived or
     Watched, even if my data mentions a dose limit: those are medical
     facts about me and I set them myself.

Output real CSV in a code block, one block per file, no example rows, no
commentary inside the block. Quote any field containing a comma. If my data
spans entries and events, produce two files. If my data names any
treatments, produce the log options file too. Suggest a Gaps file if my
data shows obvious untracked stretches, but let me decide.

If the app rejects the file, I'll paste its error message back to you; it
names each problem's row and column. Fix only what it names.

Ask me now for my data, and ask what scale my ratings used before mapping
any of them.
```
