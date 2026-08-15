# Why Dusknote's Google sign-in works the way it does

Dusknote signs into Google using the OAuth *implicit flow*: the app sends you to Google's own sign-in page, and Google sends you back holding an *access token*, a temporary key that lets the app write to your Google Sheet. Google discourages this method for new apps, and the next version of the OAuth standard removes it. This page explains why it is still the right choice for an app built the way Dusknote is.

## The constraint: no backend

Dusknote has no *backend*: no server of its own running somewhere, no database, no company in the middle. The app is a *static site*, just the files you deploy with nothing running behind them. Your data lives on your device and in your own Google Sheet. Every sign-in option has to fit inside that constraint.

## The alternatives

**Authorization code flow with PKCE** is the modern recommendation. Instead of Google handing back the token in the web address, the app trades a one-time code for it over a *back channel*, a direct app-to-Google connection you never see, so the token stays out of the web address entirely. The catch: for web apps, Google's side of that trade requires a *client secret*, a private password that proves the request really comes from the app's maker. A static site has nowhere to hide one, since anything shipped to the browser can be read by anyone. Using this flow with Google means running a server to hold the secret, which brings back the dependency Dusknote works very hard to avoid, for the maintainer and for every self-hosted copy.

**Google Identity Services** is Google's ready-made sign-in library for browser-only apps. It hands out the same kind of short-lived token this app already uses, and it has two drawbacks. It signs in through a popup, and popups inside an installed iPhone home-screen app failed in this app's on-device testing. And it loads Google's own scripts into the app while it runs, where Dusknote's security policy allows no outside scripts; the library would be a standing exception that Google can change at any time.

**What Dusknote does:** a hand-written implicit flow. Full-page redirect, no secret, no popup, no outside scripts. Tested on-device, including the installed-app cases where iOS drops some browser storage across the redirect.

## The known weakness, and its mitigations

During sign-in, the token appears briefly in the web address. What limits the risk:

- The token is short-lived (about an hour), then useless.
- The permission it asks for is `drive.file` only: the token can touch files the app itself created, nothing else in your Drive or account.
- The app sends the browser strict security rules (no outside scripts may run, and it shares as little as possible about where you came from), which closes the common ways a token could leak or be stolen.
- The app clears the token from the web address the instant it has read it.
- This is a single-user app on a personal device, with no shared-computer scenario in its design.

## Why the app sometimes asks you to reconnect

The access token from sign-in lasts only about an hour. An app with a server would also receive a *refresh token*, a long-lived credential the server keeps out of sight and uses to renew the access token on its own, so you are never asked again. Dusknote has no server to store such a credential, so Google issues no refresh token. Instead, just before the access token expires, the app asks Google for a fresh one in the background. That works while you are still signed in to Google. When your Google session has ended, or you have logged out of your Google account, Google turns the request down, and the app asks you to reconnect. This is expected for a no-backend app, and reconnecting resumes the backup. Dusknote shows a "Backup disconnected" prompt on the Log screen so a lapse is caught before a stretch of entries goes unbacked.

## If Google retires this flow

Google supports this sign-in method today. If Google ever announces a date to shut it down, the way forward is Google Identity Services, the library described above, with rigorous testing on a real phone before it's released.

## Policy for contributors

Auth is the most fragile code in the app, and the part that depends most on the actual device it runs on. Any change to how sign-in works has to be tested on a real iPhone with the app installed to the home screen, not in a desktop browser tab. [CONTRIBUTING.md](../CONTRIBUTING.md) has the full expectations.
