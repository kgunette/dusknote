<!-- Maintainer note: this file is the ONLY copy of these prompts; the README and the
     product page link here rather than duplicating. The setup prompt embeds the
     guide's steps because a plain chatbot can't read this repo, so if setup-guide.md
     changes, change the prompt to match. A note atop setup-guide.md points back here. -->

# AI Prompts

These prompts turn any AI assistant into a guide for setting up and running your own copy of Dusknote. They work in Claude, ChatGPT, Gemini, or whatever you already use; free tiers are fine. Each one is self-contained: copy the whole box, paste it into a fresh chat, and go.

None of these prompts will ever ask you for a password, a key, or anything secret, because Dusknote's setup has none. If a conversation ever drifts toward pasting a credential into the chat, please stop and re-read the [setup guide](setup-guide.md).

If you'd rather not use an AI at all, the [setup guide](setup-guide.md) covers everything these prompts do.

## The setup prompt

Paste this into your AI assistant's chatbox, to begin the setup process to create your own copy of Dusknote. It should take about an hour to complete the setup from start to finish.

```
I want to set up my own copy of Dusknote, a free open-source health tracker I
deploy myself. Guide me through it one step at a time: tell me what to do, ask
me what I see, and don't move on until the step worked. I may know very little
about GitHub, Vercel, or Google Cloud, so use plain language.

Facts about this setup you must respect:
- It needs three free accounts: GitHub, Vercel, Google.
- There are no secrets anywhere in it. Never ask me to paste a password, token,
  or key into this chat. The one value I'll copy around, a Google OAuth Client
  ID, is public by design. The "client secret" Google shows is unused; tell me
  to ignore it.
- Never have me edit the app's code. Personalization happens inside the app
  after setup. The only configuration is one environment variable.
- The deploy path is: fork the repo, then connect the fork to Vercel. Never
  suggest a deploy button or any path that copies the code without forking,
  because a disconnected copy can never receive updates.

The steps, which you will walk me through in order:
1. On GitHub: open the Dusknote repository (kgunette/dusknote). First click
   Watch -> Custom -> Releases while I'm still on the original repo's page,
   so I hear about new versions and security fixes. Then click Fork ->
   Create fork, keeping the defaults.
2. On Vercel (free Hobby plan; sign up or sign in with my GitHub account):
   Add New -> Project, import my fork. The settings screen's defaults are
   right; the preset should say Vite, and the Environment Variables section
   waits until step 7. The project name becomes my web address: the suggested
   name is fine, but never my name or my condition. Deploy, and ignore
   Vercel's suggested extras (plugins, domains, analytics).
3. Confirm the app runs at my new address. It works device-only at this point;
   Settings will say Google backup isn't set up yet. That's expected.
4. On console.cloud.google.com: create a new project (the project picker at
   the top -> New project), confirm the picker now shows it, then enable two
   APIs by searching their exact names: Google Sheets API and Google Drive
   API. Ignore similarly named third-party results, and ignore the
   create-credentials suggestion after enabling.
5. The consent screen, in a console section called Google Auth Platform: from
   its Overview, click Get started. In the wizard: app name Dusknote, my
   email in the email fields, Audience External (Internal is only for Google
   Workspace companies), agree and Create. Then under Audience, add my own
   Gmail address as a test user. While the app is in Testing status only
   listed test users can sign in, so skipping this breaks the first sign-in.
   Leave the Publish app button alone until step 9.
6. Google Auth Platform -> Clients -> Create client -> Web application.
   Authorized JavaScript origins: my exact app address with https. Authorized
   redirect URIs: the same address with a trailing slash. Copy the Client ID
   from the confirmation dialog, and ignore its warning about saving the
   client secret; the Client ID stays viewable under Clients, and the secret
   is never used.
7. In Vercel: Environment Variables (a top-level item in the project's left
   menu, not under Settings), add (or, if Vercel already created it during
   import, edit) VITE_GOOGLE_CLIENT_ID = the Client ID. When
   Vercel warns the VITE_ value is exposed to the browser, mark it as safe;
   it's public by design. Then redeploy: Deployments -> the deployment row's
   menu -> Redeploy, and wait for the new row to turn Ready.
8. In the app: Settings -> Connect Google (the button may say Reconnect), and
   sign in. Google will warn "Google hasn't verified this app": that's
   Testing status, and the developer who invited me is me, so Continue. Then
   confirm Settings soon reads "All backed up" and a spreadsheet named
   Dusknote appeared in my Drive. Have me log a test entry and find it in the
   sheet.
9. Google Auth Platform -> Audience -> Publish app. The dialog says
   verification applies to apps with more than 10 domains, a logo, or
   sensitive scopes; none apply to Dusknote. Publishing stops Google expiring
   my authorization every 7 days, removes the "hasn't verified" warning, and
   exposes nothing: no store listing, no review, and my Client ID only works
   from my own address.
10. Install to my phone's home screen (iPhone: Safari -> Share -> Add to Home
    Screen, leaving "Open as Web App" on. Android: Chrome menu -> Add to Home
    screen), and sign in once in the installed app too.

Known traps, in case I hit them: a failed first sign-in usually means the
test-user step was skipped or I used a different Google account; a connect
error usually means the address in Google Cloud doesn't exactly match my app's
address (https, typos, the trailing slash); Google says Client ID settings
can take from 5 minutes to a few hours to take effect, so a connect failure
right after creating the ID may just need a wait; if the app ever looks
stale after an update, I should swipe it fully closed and reopen it.

Google renames and moves its console screens sometimes. If what I see doesn't
match, help me find the equivalent rather than insisting on the old path.

Start by asking me which of the three accounts I already have.
```

## The personalization prompt

Once your app is set up and running, paste this prompt to shape the app around your condition. Nothing here leaves the chat; you'll type the results into the app yourself.

```
My Dusknote health tracker is set up, and I want to personalize it for what I
track. Everything is configured inside the app, in Log options (reached from
Settings). Nothing needs code or files, and don't ask me for any of my health
records. You're helping me choose words, and the words are mine; suggest,
don't prescribe, and nothing here is medical advice.

What can be personalized:
- "What you track": the single word for the thing I log. Default is
  "episode"; it can be any short singular word that pluralizes with an s,
  like "headache" or "flare". The whole app re-words itself around it.
- The five rating words for levels 1 to 5 (defaults: Very mild, Mild,
  Moderate, Severe, Very severe). Level 0 is locked and means "no episode",
  a symptom-only day.
- Treatments: anything I do about it, from a drug to an ice pack, all on one
  list. Any of them can be marked as a medication by tapping the pill next to
  it. A medication can carry a monthly limit (days used, which is what
  makes it appear in stats) and a daily limit (doses in a day, shown while I
  log).
- Symptoms, and factors (circumstances like poor sleep, weather, travel).
  Factors can be "watched", which splits each month's episode days into days
  with and without that factor.

Ask me what I track and how I'd naturally talk about it, then propose: the
word for what I track, five rating words in my own register, and a starter
set of symptoms, treatments, and factors worth watching. Keep
each list short; I can add more in the app anytime. Then tell me exactly
where in the app to enter each thing, one group at a time.
```

## The update prompt

Paste this when the app shows its "A new version of Dusknote is available." banner.

```
My self-deployed Dusknote app (a GitHub fork of kgunette/dusknote, deployed
on Vercel) is showing a banner that a new version is available. Walk me
through updating, one step at a time:

1. On my fork's GitHub page: click "Sync fork", then "Update branch".
2. Wait a couple of minutes; Vercel redeploys my app on its own when the fork
   updates. No Vercel action needed.
3. Verify: I open the app, swipe it fully closed and reopen if it looks
   unchanged (the installed app can serve a cached build briefly), and check
   that the "build" code at the bottom of Settings changed.

Also show me the release notes if I want them: they're on the original
repository's Releases page. If "Sync fork" reports conflicts, something
changed my fork's files; help me discard my fork's changes in favor of the
original, since Dusknote forks are meant to run the code unmodified.
```

## The troubleshooting prompt

Paste this when something's wrong, then describe what you're seeing.

```
I run my own copy of Dusknote, an open-source, local-device-first health tracker: a static web app (my fork of kgunette/dusknote) deployed on Vercel, data in the browser's IndexedDB on my phone, synced to a Google Sheet in my own Drive via Google's APIs, with one env var (VITE_GOOGLE_CLIENT_ID). There is no server and no database of mine. Help me diagnose the problem I describe below, one question or step at a time. Never ask me for passwords, tokens, or the
contents of my health data.

Known issues to check against first:
- Asked to fully re-sign-in to Google about weekly: my OAuth consent screen
  is still in "Testing" status. Fix: Google Cloud console -> OAuth consent
  screen -> Publish app. Safe: no review needed at Dusknote's permission
  level, and publishing exposes no data.
- First-ever sign-in fails: I'm missing from the consent screen's test-user
  list, or signed in with a different Google account.
- Connect bounces with an error: the authorized origin or redirect URI in
  Google Cloud doesn't exactly match my app's address (https, typos,
  trailing slash on the redirect URI).
- Settings says Google backup isn't set up for this copy: the
  VITE_GOOGLE_CLIENT_ID env var is missing or misnamed in Vercel, or wasn't
  followed by a redeploy.
- App looks stale after an update: cached build. Swipe the app fully closed,
  reopen, check the "build" code at the bottom of Settings.
- New device created an empty sheet: the app finds its sheet by the name
  "Dusknote"; if it was renamed in Drive, rename it back and reconnect.
- "Reconnect" appearing occasionally is normal (sign-in tokens expire);
  entries are always safe on the phone regardless of connection state.

What I'm seeing:
```

## Importing historical data

The prompt for turning another app's export, or your own notes, into an importable file lives in the [import guide](import-guide.md), next to the file format it produces.
