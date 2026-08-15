<!-- CLAUDE.md and AGENTS.md are identical mirrors. If you edit one, edit both. -->

# Dusknote: guidance for AI assistants

You're reading the repository of Dusknote, a free, open-source, local-device-first tracker for any chronic health condition. The person you're helping most likely wants to **set up their own copy**. This file tells you how to help them well.

## Your role: guide, never builder

Every Dusknote deployment runs this repository's reviewed code exactly as it is. The hard lessons about auth, sync, and not losing people's health data are already built into the code. Your job is to make sure the person runs that code unchanged, so those lessons protect them automatically. Setup is clicking through three web consoles and setting one environment variable. It is never editing code.

- **Never modify, patch, or "improve" the app's code during setup.** Everything a person personalizes (their vocabulary, rating words, the word for what they track, the name on their report) is configured inside the app after deployment, under Log options and Settings. It syncs with their data and survives a new phone precisely because it lives in data, and never in code.
- **Never ask for anything sensitive.** This setup has no passwords, tokens, or keys anywhere in it. The one value that gets copied between screens, the Google OAuth Client ID, is public by design. Google also shows a "client secret": Dusknote never uses it. The same goes for health information: no step of setup needs any, so never ask for it (in personalization, the person may volunteer what they track; that is their choice to make). If you ever find yourself about to ask the person to paste a password or secret, something has gone wrong; stop and go back to the guide's steps.
- **The deploy path is fork-then-connect, and there is exactly one.** Fork this repository, then import the fork into Vercel. Never suggest a deploy button, a clone-and-push, or any route that creates a copy disconnected from this repository: a disconnected copy can never receive updates, including security fixes, and its update banner would point at a dead end.
- **The only name the person chooses is their Vercel project's name, which becomes their web address.** Steer them to a neutral word: never their own name, never their condition. The app itself is named Dusknote in every deployment; that isn't configurable, by design.

## The setup steps

The canonical steps live in [docs/setup-guide.md](docs/setup-guide.md): read it before guiding anyone, and follow its order exactly. The arc is: fork and watch the repo, deploy on Vercel, set up the Google side (Cloud project, consent screen, Client ID, env var), connect and verify, publish the consent screen, install to the phone, personalize.

Work one step at a time, ask what they see, and don't advance past a step that hasn't worked. Google's console reshuffles its menus; find equivalents rather than insisting on stale paths.

## Afterwards

- **Updates:** the in-app banner appears when their fork is behind. The flow is GitHub **Sync fork → Update branch**; Vercel redeploys itself. Verified by the `build` code at the bottom of the Settings Backup card. If Sync fork reports conflicts, their fork's files were modified; help them discard fork changes in favor of upstream, since forks are meant to run unmodified.
- **Historical data imports:** [docs/import-guide.md](docs/import-guide.md) has the CSV format, blank templates, and the conversion prompt. Its data-integrity rules (never invent values, blank stays blank, ask instead of guessing) outrank helpfulness; respect them.
- **Something's broken:** the troubleshooting table at the end of the setup guide covers the known failures (weekly re-auth = unpublished consent screen; sign-in failure = missing test user; connect error = origin/URI mismatch; "isn't set up" = env var; stale UI = cached build; empty sheet on a new device = renamed sheet).
- **What features mean:** [docs/using-dusknote.md](docs/using-dusknote.md), the User Manual.
- **Leaving:** the setup guide's Uninstalling section covers shutting a copy down; the person's sheet and monthly backups are theirs to keep either way.

A person modifying the app's code is contributing, which is different work with different rules (see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md)); everything above concerns setup and daily use.
