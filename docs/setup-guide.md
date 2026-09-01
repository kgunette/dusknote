<!-- Maintainer note: the setup prompt in ai-prompts.md embeds this guide's steps,
     because a plain chatbot can't read this repo. If the steps change here, update
     that prompt to match. -->

# Setting up your own Dusknote

Use this guide to create your own copy of Dusknote: a health tracker that runs at your own web address, saves to your own phone, and backs up to your own Google Drive. Nobody else's server is involved, so your data stays your own. Dusknote is free forever and takes about an hour to set up.

**There are two ways to set up Dusknote:**

- **With an AI assistant.** Paste the setup prompt from [ai-prompts.md](ai-prompts.md) into any AI assistant (Claude, ChatGPT, Gemini, whatever you already use; free tiers work fine) and it will walk you through every step, one at a time. The AI assistant can also help you troubleshoot any issues that arise, if you are less comfortable with the process of making an app.
- **Create it manually, following the instructions on this page.** Every step is written out below, so you don't need to use AI if you don't want to.

## What you need

Three free accounts. You may already have some of these:

1. **GitHub** (github.com), where the Dusknote code lives and where your copy of it will live. No account? Create one at github.com before you start; the free plan is all you need.
2. **Vercel** (vercel.com), which turns your copy of the Dusknote code into a live website. If you don't have an account, you'll create one in step 2 using your GitHub login, so there's nothing to do yet.
3. **Google**, for signing in and backing up to your own Drive. I will just assume you have a Google account (but if you do not have one, create one at google.com first).

**A few things to know before you start:** 
- **This setup involves no passwords, no secret keys, and nothing sensitive**. You'll sign in to three websites the way you normally do, and the one value you'll copy between screens (a "Client ID") is public by design. If anything ever asks you to paste a password or secret somewhere, something is wrong; stop and check the troubleshooting section.
- **Wondering how the code can be public but your data private?** [how-your-data-stays-yours.md](how-your-data-stays-yours.md) explains how the public code, your own copy, and your data relate.

## Step 1: Fork the repository

A "fork" is GitHub's word for your own copy of the code. Your copy stays linked to the original, so when Dusknote gets an update, you can bring it into your copy with one click.

1. Sign in to GitHub and open the Dusknote repository (github.com/kgunette/dusknote).
2. Click **Watch** → **Custom** → check **Releases** → **Apply**. This is how you'll hear about updates to the app, including security fixes. This is important, so do it now while you're on the page.
3. Click **Fork** (top right), then **Create fork**. Keep the defaults.
4. Keep this tab open on your browser, and open a new one for Step 2.

## Step 2: Deploy it on Vercel

1. Go to vercel.com. 
	1. If you're new to Vercel: click Sign Up, choose the free **Hobby** plan, and pick **Continue with GitHub**, so your Vercel account is simply your GitHub account. 
	2. If you already have an account: sign in. 
2. Either way, Vercel may prompt you to set up two-factor authentication; that's your Vercel account's own security, separate from Dusknote. Set it up if you like, or skip it and continue.
3. Click **Add New… → Project**, and import your Dusknote fork. Vercel shows a list of your GitHub repositories; find your Dusknote fork and click **Import** next to it. Importing connects Vercel to your copy of the code so it can turn it into a live website.
4. Vercel shows a settings screen for the new project. The Application Preset should already say **Vite** (Vercel reads that from the code); if it doesn't, pick Vite from the list. Leave everything else as it is, including the Environment Variables section (we'll come back to this section in Step 6).
5. **The project name becomes your web address:** the Name field plus `.vercel.app`. The suggested name is fine. Any word works, but don't use your own name or the condition you're tracking; the address lives in a few technical places. If a name's address is already taken, Vercel will assign a variant with a suffix, which works the same.
6. Click **Deploy** and wait a minute.

When the build finishes, Vercel shows a congratulations screen full of suggestions: a plugin to run in your terminal, custom domains, analytics. None of them are part of Dusknote's setup, so just ignore them and click **Continue to Dashboard**; Vercel keeps offering extras like these around its dashboard, and the only reason you'll come back is step 6, to add one setting in the Environment Variables section.

Your app now has an address, shown on the project page under Domains: something like `dusknote-xk29.vercel.app`. Open your newly created app address in your browser, your website is live! Dusknote is now up and running: you can log entries and they save on that device. In the Settings tab, it will say that Google backup isn't set up for this copy of the app yet. This is expected, and we will connect it in the following steps.

## Step 3: Create a Google Cloud project

This part has the most screens, but none of it is hard, it's just Google asking you to label things.

1. Go to **console.cloud.google.com** and sign in with the Google account whose Drive will hold your backups. Google may advertise free trials or credits along the way; ignore them. Nothing in this setup uses billing, and you never need to add a credit card.
2. Click the **project picker** at the top of the page, next to the Google Cloud logo. If you've used Google Cloud before it shows whatever project you last touched; if you're new to using Google Cloud it may say "Select a project." In the dialog that opens, click **New project**.
3. Name it anything ("Dusknote" is fine), leave the other fields as they are, and click **Create**.
4. Creation takes a few seconds, and the console does not switch to your new project on its own. A notification appears with a **Select Project** link: click it, then check that the picker at the top of the screen now shows your new project's name. Steps 3 through 5 all happen inside this project, so that name in the top bar is how you know you're in the right place.
5. Now enable the two connections Dusknote uses. In the search bar at the top of the console, type **Google Sheets API**. The results mix in documentation and similarly named products from other companies; click the result named exactly **Google Sheets API** ("Read and write Google Sheets data"), then click **Enable**.
6. After enabling, Google drops you on a statistics page and suggests creating credentials. Ignore both; step 5 of this guide creates the right kind by its own path. Go back to the search bar and repeat for **Google Drive API**: skip the lookalikes (Drive Activity API, Drive Labels API, products from other companies), click the one named exactly **Google Drive API**, and **Enable**.

Google moves its menus around from time to time, but the names above stay the same. Stay in the Google Cloud tab for Steps 4 and 5 as well.

## Step 4: The consent screen

This is the screen Google shows you when the app asks permission to create files in your Drive.

One thing to be aware of through this step: Google's screens are written for companies launching apps to the public, so they talk about "users" and an "audience." You are the app's only user. Wherever a form asks for an email, it's yours, and every question about your users is about you.

1. Search the console for **OAuth consent screen** (or find **Google Auth Platform** in the menu). You'll land on an overview saying it isn't configured yet. Click **Get started**.
2. A short wizard runs. 
	1. **App Information:** app name "Dusknote", your Gmail as the support email. 
	2. **Audience:** choose **External**. Internal sounds more private, but it's for companies on Google Workspace. The wizard's mention of possible verification doesn't apply to Dusknote; step 8 shows why. 
	3. **Contact Information:** your Gmail again. 
	4. **Finish:** agree to Google's policy and click **Create**.
3. Now **add yourself as a test user**: open **Audience** in the left menu, find the **Test users** section, click **Add users**, and enter your own Gmail address. New apps start in "Testing" status, and while in Testing only listed test users can sign in. Skipping this makes your first sign-in fail with an unhelpful error.
4. The Audience page also shows a **Publish app** button and a **Make internal** button. Leave both alone for now: publishing is step 8, and internal is for Workspace companies, not you.

## Step 5: Create the Client ID

1. In Google Auth Platform, open **Clients** in the left menu, then click **Create client**.
	1. Application type: **Web application**. The name field is only a console label; the suggested name is fine.
	2. Under **Authorized JavaScript origins**, add your app's address from step 2 exactly, starting with the https. If your address were `dusknote-xk29.vercel.app`, you'd enter `https://dusknote-xk29.vercel.app`
	3. Under **Authorized redirect URIs**, add the same address with a trailing slash on the end: `https://dusknote-xk29.vercel.app/`
	4. Click **Create**. A dialog shows your **Client ID**, a long string ending in `.apps.googleusercontent.com`: copy it. This is the public value mentioned earlier; it identifies your app to Google and is safe to see, copy, and keep in the open.
2. The same dialog shows a **client secret** and warns you to save it before closing. You can ignore all of this: Dusknote never uses the secret, there's nothing to copy or download, and your Client ID stays viewable in the Clients list forever. Click OK.

**Don't change this Client ID.** If you regenerate or delete it later, a new one can't see the sheet the original created, so it starts over empty. Your data stays safe in the old sheet, and comes back if you restore the original Client ID.

## Step 6: Give the ID to your deployment

1. Go back to your Vercel tab (or re-open your Vercel account), open your project and click **Environment Variables** in the left menu; it's a top-level item in the project sidebar. Don't go to Settings → Environments, that's a different feature.
2. If a `VITE_GOOGLE_CLIENT_ID` row is already listed (Vercel often adds one for you), **delete it instead of editing it**: open its **⋯** menu and choose Remove. Vercel adds that row in a locked form it won't let you change, so editing runs into an error you can't get past. Adding a fresh one takes seconds.
3. Click **Add Environment Variable**. Key: `VITE_GOOGLE_CLIENT_ID`. Value: paste the Client ID you copied from the Google Auth Platform page. Type: **Config**. Leave the other options as they are.
4. Vercel warns that `VITE_` exposes the value to the browser and asks you to verify it's safe to share publicly. It is; that's how this value is designed to work. Mark it as safe and save.
5. The new value only takes effect on a fresh deployment. Go to **Deployments** in the left menu. The wide row in the list is your deployment: open its **⋯** menu, choose **Redeploy**, and confirm in the dialog. You'll know it worked when a new row appears at the top of the list and turns Ready in about a minute.

## Step 7: Connect and check

1. Go back to your Dusknote live app tab, and go to **Settings**, and tap **Connect Google** (if you logged entries first, the button may say **Reconnect Google**; it's the same button). Choose the Google account you added as the test user.
2. Google shows a warning: **"Google hasn't verified this app,"** with "Back to safety" as the big button. This is because your app is still in Testing status, and the developer who invited you is you. Click the small **Continue** link. In step 8 we'll switch this from testing to published, so you won't see this kind of warning again.
3. The consent screen from step 4 follows. It asks permission to "see, edit, create, and delete only the specific Google Drive files you use with this app": that's the narrow access Dusknote runs on, files it creates and nothing else. An info box may note there's no privacy policy to review and this is true, you never wrote one, and you're the only user. Click **Continue**.
4. Back in the app, Settings should read "All backed up" within a few seconds, and a spreadsheet named **Dusknote** now exists in your Google Drive.
5. Log a test entry, then open the sheet (**Settings → Open sheet**). Your entry is there, in plain readable columns. This Google Sheet is yours forever, whatever happens to the app.

## Step 8: Publish the consent screen

Your app is still in "Testing" status, and Testing expires your Google sign-in every 7 days, with no explanation when it happens. Publishing avoids this behavior in the future.

1. In the Google Cloud console: **Google Auth Platform → Audience → Publish app.**
2. A dialog asks "Push to production?" and notes that apps with more than 10 domains, a logo, or sensitive scopes will need verification. Dusknote has one domain, no logo, and only the narrow files-it-created permission, so none of that applies to you. Click **Confirm**. Publishing status now reads "In production."

"Publish" sounds bigger than it is, so here is exactly what it does and doesn't do. It stops the weekly expiry, and the "Google hasn't verified this app" warning from step 7 stops appearing too. It does **not** put your app in any store or directory, does **not** let anyone else into your data, and needs no review from Google (Dusknote only requests the narrow files-it-created permission, which is below the threshold that triggers verification). Your Client ID only works from your own app address, and a stranger who somehow finds your app address could only ever create a spreadsheet in *their own* Drive. Your data never becomes reachable to anyone else.

## Step 9: Put it on your phone

Dusknote is built to live on your mobile device's home screen.

- **iPhone:** open your address in Safari → Share button → **Add to Home Screen**. If an "Open as Web App" toggle appears, leave it on; turned off, you'd get a plain bookmark instead of the app. 
- **Android:** open it in Chrome → menu → **Add to Home screen** (or "Install app").

Using a different browser? Look in its menu for **Add to Home Screen** or **Install app**; every major phone browser has one or the other.

Open it from the home screen and sign in to Google once there too, since the installed app keeps its own sign-in.

## Step 10: Personalize it

You make Dusknote yours inside the app itself: the word for what you track, your rating words, the name on your report. Those choices are saved with your data, so they back up and populate on a new phone.

- **Log options → What you track:** the word for the thing you log ("episode", "headache", "flare", your call). The whole app re-words itself based on what makes most sense for you.
- **Log options:** rename the five rating words, and add your symptoms, treatments, and other factors. Tap the pill next to a treatment to mark it a medication, and give a medication a limit if you want it counted in Stats and your report. Tap the eye on a factor to watch it.
- **Settings → Your name:** printed on the exportable report, optional, and only if you want it there.

The [User Manual](using-dusknote.md) explains what each feature means and why you'd use it. **If you have history in another app or a journal, import it before doing the list above.** The [import guide](import-guide.md) walks you through it, and importing puts your treatment, symptom and factor names onto your lists for you, so all that's left is marking your medications.

Feel free to move your Dusknote spreadsheet and your "Dusknote backups" folder anywhere in your Google Drive. It's smoothest to leave them named as they are, but nothing is lost if you rename the sheet: a new phone will simply ask you to confirm which sheet to use.

## One device, or several?

Dusknote works best on one device. Everything you log lives on that phone and backs up to your Google Sheet, and a single-device setup is the smoothest. You can run it on more than one device at the same time if you want, and your data is secure either way, but the copies can drift a little out of step and may occasionally ask you which version to keep.

## Keeping your app up-to-date

When a new version exists, the app shows a banner. Updating is two steps, and only requires you to do one thing: 
1. on your fork's GitHub page, click **Sync fork → Update branch**
2. Vercel redeploys on its own within a couple of minutes. To confirm it worked, the bottom of **Settings → Backup** section shows a `build` code that changes with each version.

## Uninstalling Dusknote

Everything Dusknote created lives in your own accounts, so uninstalling and closing down the app takes a few minutes, and you keep all of your own data.

1. In Vercel: open your project → Settings → scroll to the bottom → **Delete Project**.
2. In the Google Cloud console: check that the project picker shows your Dusknote project, then **IAM & Admin → Settings → Shut down**. Google keeps the project recoverable for 30 days, then deletes it.
3. On your phone, remove the app's icon from the home screen.
4. In your Google Account (myaccount.google.com): under Security, find **Linked apps**, open **Dusknote**, and delete the connection. It's listed under the app's name, not under Vercel or Google Cloud.
5. **Your data is a separate decision, and it's yours.** The Dusknote spreadsheet and the "Dusknote backups" folder stay in your Drive, readable forever, whether or not the app exists. Delete them only if you're sure you no longer want the record.

## Troubleshooting

| What you see                                                                | What it is                                                                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asked to sign in to Google again about a week after setup, and weekly since | Your consent screen is still in Testing. Do step 8.                                                                                                                  |
| First sign-in fails or says access is denied                                | You're not on the test-user list (step 4), or you signed in with a different Google account than the one you listed.                                                 |
| "Connect Google" bounces back with an error                                 | The address in Google Cloud doesn't match your app's address exactly. Check both entries in step 5 for typos, https, and the trailing slash on the redirect URI.     |
| Connect fails right after you created or edited the Client ID               | Google's own note: settings can take from 5 minutes to a few hours to take effect. Wait a bit and try again before changing anything.                                |
| Settings says backup isn't set up for this copy                             | The environment variable from step 6 is missing, misnamed, or wasn't followed by a redeploy.                                                                         |
| The app looks out of date after an update                                   | The installed app can serve a cached build for a while. Swipe it fully closed and reopen; check the `build` code at the bottom of the **Settings → Backup** section. |
| A new phone shows no history and started a new empty sheet                  | The app found no sheet it created, so the old one was deleted or is in your Google Drive trash. Restore it from Drive trash and reconnect. A renamed sheet isn't the cause; the app finds and offers those. |
| Data is missing after you changed your Google or Vercel setup               | If you regenerated your Google OAuth Client ID, the app can't see the Google Sheet the old one created. Put your original Client ID back in Vercel and redeploy, and your data returns. Your old Google Sheet was never touched. |
| You changed the Google Sheet by mistake                                     | In the Google Sheet, open File, then Version history, and restore an earlier version. |

Stuck on something else? Paste the troubleshooting prompt from [ai-prompts.md](ai-prompts.md) into your assistant, or open an issue on the repository.
