# Using Dusknote

The [setup guide](setup-guide.md) helps you create your own copy of Dusknote. This doc explains what the features mean and why you would use them.

## Logging basics

An entry is one record of one moment: the date and time it started, plus whatever else you choose to add. Every field is optional. A rating alone is a valid entry, and so is a note alone. The form never makes you fill in more than you know.

The rating runs 0 to 5, answering "How bad, at its worst?" It is important to understand the difference between a rating of 0 and leaving the rating blank / unselected.

- **Leaving the rating blank** means that a rating is not recorded. The entry still counts as an episode day; it just doesn't have a number. If you import history, or backfill episodes, you may need to leave the ratings blank.
- **Choosing 0 ("No episode")** means that symptoms showed up, but it never became an episode. A 0 day is never counted as an episode day. It is how you keep track of near-misses and background symptoms without inflating your numbers.

The things you can tap while logging help you track a variety of things:

- **Symptoms**: what you felt.
- **Treatments**: what you did about it, split into **medications** (drugs) and **remedies** (non-drug things, like coffee or a hot shower). Only a medication can carry a monthly limit, and every treatment can take an outcome ("Did it help?").
- **Other factors**: the circumstances around the day, like poor sleep, weather, or travel. Factors are the things you'd like to capture that may be correlated with your episodes.
- **Notes**: anything else, in your own words.

## What gets counted, and what doesn't

Everything you log is saved. Your log shows all of your notes, and so does the timeline in your report. The summarized numbers on the Stats page and in your report come from two different places.

**Monthly counts come from what you've asked Dusknote to watch.**

- **Episode days and episode entries** are always counted.
- **A medication** starts counting once you give it a monthly limit. It counts days used, not doses, and shows a flag when you go over that limit.
- **A factor** starts counting once you tap its eye icon: each month splits into days with it and days without.
- **Everything else is log-only.** If a count you expect isn't there, check that the medication has a limit, or that the factor's eye is on.

**What helped comes from the outcomes you've recorded.**

- Every "did it help?" answer feeds the What helped card on Stats, and the What helped table in your report if you check that box.
- It counts tries, not days, because you answer once per attempt: two attempts on one day are two tries.
- On Stats it covers your whole history. In the report it follows the date range you chose, like everything else on the page.
- Attempts with no recorded outcome are counted separately ("20 of 44 tries have no outcome"), so you can always see how much of the picture the numbers cover.

## Watching a factor

A factor is a hypothesis about your body. Maybe poor sleep sets you off. Maybe it's weather, or travel. Watching is how you test it: tap the eye next to a factor in Log options, and Stats starts splitting each month into days with that factor and days without.

Why this helps: a month where six of your eight episode days had poor sleep is a pattern worth investigating further. A month where the split is even suggests the hypothesis is wrong, which is just as useful to know.

Watch as many factors as you like. Watching never changes your entries, only what gets summarized, so you can turn the eye on and off freely while you explore. A watched factor's split shows on Stats automatically; it goes in your report when you check "Watched factors."

One behavior to know, that might feel like a bug, but is intentional: in a month with zero days matching a watched factor, the split doesn't appear on Stats or in the report's month lines. In the report's summary table, where each watched factor has its own column, that month shows a 0.

## Medication limits

A limit counts the days you used a medication, not doses. Two doses on one day is one day.

Doctors often focus on days used. A limit really asks "am I reaching for this too often?", and clinical thresholds for "too often" are written in days per month, so the app counts the number most often used by the medical community.

Setting a limit is also what makes a medication count at all: it appears in Stats and the report from then on, and a month that goes over its limit is flagged. A medication without a limit stays log-only ("What gets counted," above, is the full story).

## What helped

Every time you answer "Did it help?" on a treatment, the answer accumulates. The card at the top of Stats lists every treatment you've tried with three counts: helped, partly, no. The same table goes in your report when you check "What helped," where it follows the report's date range. ("What gets counted," above, covers where the numbers come from.)

There is no percentage on purpose. At a handful of tries, "helped 1 · partly 0 · no 3" tells you more than "25%", and a percentage claims a precision that four attempts can't support.

A treatment with no outcomes recorded still appears, with its try count, so nothing looks lost.

## Coverage gaps

A coverage gap is a date range you know you weren't tracking: before you started, a stretch away from logging, a season the app wasn't in your life. Add one in Settings with a start date, an end date, and an optional reason.

The principle behind gaps is that **missing data is never counted as zero.** A month you didn't track is a blank, and the gap range ensures that it will be reflected as "nothing was recorded" instead of "nothing happened."

## Events

An event is a dated note about your care: an appointment, a scan, a medication change. It sits in the same timeline as your entries, but it isn't an episode and is never counted as one.

Events can be shown or hidden in the log, and go in your report when you check "Events."

## The printable report

The report turns your history into a document with monthly counts, what helped, and a timeline of entries, over whatever date range you choose. You choose what goes on the page: every section and detail is an opt-in checkbox. Notes start unchecked, in case yours are ones you'd rather not share, but they can always be included as you wish. The monthly PDF backups are this same report with every checkbox turned on; they have their own section below.

## Your monthly backup

Once a month, Dusknote saves a PDF of everything you've logged so far into a "Dusknote backups" folder in your own Google Drive. You don't have to do anything to enable it. Each month adds a new file, and the old ones never change. Settings → Backup → Open backups takes you to the folder.

It's the same printable report described above, with every section checked on, so each file is a complete record of your history as of the day it was made.

**Why it's worth having when you already have the sheet.** Your sheet is the living document. It mirrors what's in the app right now, and it gets rewritten every time your phone backs up. That's what makes it the thing that restores your history onto a new phone. It also means the sheet has no memory. If you delete an entry, the next backup removes it from the sheet too.

The monthly PDFs are a snapshot in time. Delete something in March and your June file won't have it, but your February one still will. A PDF also needs nothing to stay readable: no app, no spreadsheet software, no Google account. Years from now, each file will still open on anything.

## Reading and exporting your Google Sheet

Your Google Sheet always holds a current, readable copy of everything you've logged, so you can open it, read it, print it, or export it whenever you like. Make your changes in the app only, though: anything typed directly into the sheet won't flow back to the app. Add, edit, and delete inside Dusknote, and use the sheet to read and to export.

It's smoothest to leave your sheet named "Dusknote". Moving it into a folder is fine, and renaming it doesn't lose anything: a new device will just ask you to confirm which sheet to use.

Your sheet also keeps its own history. Google Sheets automatically saves earlier versions, so if anything in it ever changes by accident, you can open File, then Version history, and restore how it looked before.

## One device, or several?

Dusknote works best on one device. Everything you log lives on that phone and backs up to your Google Sheet, and a single-device setup is the smoothest. You can run it on more than one device at the same time if you want, and your data is secure either way, but the copies can drift a little out of step and may occasionally ask you which version to keep.

None of this applies when you get a new phone, which is fully supported. Install it, sign in with the same Google account, and your full history comes back from your Google Sheet.

## Import basics

The import format is your live sheet's own columns: an import file looks exactly like your Dusknote data already does, and you can read and fix it in any spreadsheet app.

Dusknote only accepts CSV files in that exact format. The [import guide](import-guide.md) has blank templates you can fill in yourself, and a conversion prompt for turning another app's export or a journal into the right format with an AI assistant. Either way, you end up with a finalized CSV file: you check it, then import it.

Validation is strict: a file with any problem imports nothing, and errors name their row and column ("Row 14, Date: expected a date like 2026-03-05"). A rejected file touches nothing, so a bad file can never reach your phone or overwrite your sheet.

Importing the same file twice is safe: rows already in your data are recognized and skipped.

## Why some things work the way they do

**Why the rating scale is fixed.** The five words are yours to rename, but the 0 to 5 scale is locked, and 0 always means "no episode." Ratings only stay comparable across years if the scale never changes, and every count in the app depends on the difference between 0 and everything above it.

**Why there are no warning colors.** Dusknote assumes it may be used on a hard day: dark, low glare, nothing blinking. Going over a medication limit shows as an amber fraction, not a red warning.

**Why the app carries its own security rules.** The rules that protect the app are built into the app itself, not just set by the hosting service, so every copy keeps them no matter where it's deployed. That matters because your Google sign-in is stored in your browser, and these rules block outside code from reading it.

**Why the app name must stay Dusknote.** Everything personal lives in your data: your vocabulary, your rating words, the word for what you track. The app stays named Dusknote in every copy because renaming it means editing code, and an edited copy can no longer pull updates cleanly, when needed.

**Why your Google OAuth Client ID shouldn't change.** The Client ID you set up in Google is what lets Dusknote find your Google Sheet, and it can only see the sheet the original Client ID created. Regenerate or delete it later and a new one starts over with an empty sheet. Your data stays safe in the original sheet, and comes back if you restore the original Client ID.

**App limitations.** English only, US date formats, 12-hour times, weeks starting on Sunday. There are no settings to change these at this time.

## The update banner

Once a day, the app pings GitHub to verify what the newest version of Dusknote is. When a newer one exists, a banner appears with a link to what's new, but nothing installs itself. When you're ready to update, the [update prompt](ai-prompts.md#the-update-prompt) walks your assistant through it, or you can update manually: on your fork's GitHub page, press **Sync fork → Update branch**, and Vercel redeploys on its own.

Your data never leaves your device except to your own Google Drive (your live sheet and your monthly PDF backups) and any report you choose to export. The version check is the app's only other network contact, and it carries nothing about you.

There is no setting to turn the check off, and the banner is the only channel that can tell a running copy about a security fix or updated feature set.

## Uninstalling

If you ever want to shut your copy down, the setup guide's [Uninstalling Dusknote](setup-guide.md#uninstalling-dusknote) section walks through it. Your sheet and your monthly backups are yours to keep either way.
