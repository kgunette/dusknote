# Dusknote

A calm, local-device-first tracker for any chronic health condition.

Your entries live on your phone first. They sync to a Google Sheet in your own Google Drive, so you own the data, it stays readable forever, and no company can lose it or hold it hostage. It installs to your home screen, works fully offline, and prints a report you can hand to a doctor.

Dusknote ships condition-neutral. You personalize it inside the app: what you call the thing you track, your own vocabulary, your own rating words.

See it at [dusknote.app](https://dusknote.app).

## How it works

- **Your device holds the record.** Your entries live in your phone's own storage, and saving one needs no connection. The backup catches up when you're next online.
- **Your Google Sheet is the backup.** It lives in your Drive, in your account. You can open it, read it, sort it, or export it, with or without this app. Once a month Dusknote also saves a PDF of everything you've logged so far, so you keep a record that needs no app at all.
- **There is no server.** No account to create, no company in the middle, nothing that can be shut down. You deploy your own copy, and it talks only to your own Google Drive.
- **Nothing reports back to anyone.** Your entries go one place only: your own Google Sheet. The only other thing the app ever asks the internet is whether a newer version exists, so it can show you an update notice. That check carries nothing about you or anything you've logged, though like any web request it does show where your copy lives, which is worth knowing when you choose your app's address.

The longer version of how the public code, your deployment, and your data relate is [docs/how-your-data-stays-yours.md](docs/how-your-data-stays-yours.md), including why a stranger who somehow found your app's address would see only an empty app, never your data.

## Setting it up

You will run your own copy of the app. It requires three free accounts (GitHub, Vercel, Google) and takes about an hour to set up. There are two ways to create it, with an AI assistant walking you through every step or manually on your own; the **[setup guide](docs/setup-guide.md)** explains both and gets you started.

**Watch this repository** (Watch → Custom → Releases) whether or not you've set up yet; it's how you hear about new versions, including security fixes. When your copy is behind, the app shows a banner, and updating is one press of a button: GitHub's **Sync fork**, after which Vercel redeploys on its own, nothing else needed from you.

## Using it

The **[User Manual](docs/using-dusknote.md)** explains what each feature means and why you'd want it, separately from the setup mechanics. Bringing history from another app or a journal? The **[import guide](docs/import-guide.md)** has the format, blank templates, and a conversion prompt.

More docs:

- [ai-prompts.md](docs/ai-prompts.md) — paste-anywhere prompts: setup, personalization, updating, troubleshooting
- [auth-design.md](docs/auth-design.md) — why sign-in works the way it does, and the policy on changing it
- [how-your-data-stays-yours.md](docs/how-your-data-stays-yours.md) — how the public repo, your deployment, and your data relate

## This is not medical advice

Dusknote is a place to record what you observe about your own health. It is not a medical device, it diagnoses nothing, and nothing in it is medical advice. Talk to a clinician about your health, and use this to bring better notes to that conversation.

## Security

Found a security problem? Please report it privately, not in a public issue, and thanks. See [SECURITY.md](SECURITY.md) for more details.

## Contributing

If you'd like to contribute or give feedback, the guidelines are in [CONTRIBUTING.md](CONTRIBUTING.md). I'm one person maintaining this in off hours, so I'll prioritize security reports, and otherwise respond as I can.

## Support

Dusknote is free and open source, with no subscriptions, paywalls, or ads. If it has been useful to you and you're able, a [tip on Ko-fi](https://ko-fi.com/H3E123QLE1) helps me keep maintaining and improving it. Using it, sharing it with someone who might need it, or sending feedback all help too.

## License

MIT. See [LICENSE](LICENSE).

Dusknote uses [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) and [Source Serif 4](https://github.com/adobe-fonts/source-serif), both under the SIL Open Font License 1.1; the full notices are in [NOTICE](NOTICE). Source Serif's font files are included in this repository itself (they build the PDF report), and the font's license requires its notice to be included alongside them. Built with React, Vite, idb, and pdfmake.
