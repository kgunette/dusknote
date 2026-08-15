# How your data stays yours


If you're new to making an app like this, it can feel confusing to understand how it works: the code is public, anyone can copy it, updates arrive from the maintainer, and yet the whole promise is that your health data is private and yours. The trick is that three separate things wear the name "Dusknote," and your personal information only ever lives in one of them. Let's use a cooking metaphor, to make it a bit more concrete: a recipe, your own kitchen, and the recipe author.

## 1. The Dusknote repo on GitHub (the recipe)

This is just code, which is essentially instructions for building the app. It is the only thing that is public and the only thing anyone can copy. When you fork the repo, you are making a copy of a recipe for your own use. The recipe contains no one's data, no one's name, and no one's Google credentials. Everything personal lives in your data, never in the code.

## 2. Your own deployment on Vercel (your kitchen)

Vercel's job is taking the recipe and baking it into a running website at your own address. Two personal things exist on your side, and neither is in the recipe:

- **Your Google client ID** sits in your Vercel project's settings, a sealed box attached to your kitchen. Vercel mixes it in when baking your copy. It never flows backward into the repo, so it is never in anyone's photocopy.
- **Your actual data never touches Vercel at all.** Your deployment's URL only shows your phone the app. Once the app is running on your phone, your entries live in your phone's own storage, and syncing happens directly between your phone and your Google Sheet. Vercel is the shelf the recipe box sits on; your food never passes through it.

Everyone else who deploys Dusknote has the same setup: the same recipe, their own sealed box, their own phone, their own sheet. The kitchens never talk to each other.

Your Google Sheet is yours to keep: a readable copy of everything you've logged that you can open, export, or print anytime, and it stays readable even if the app goes away. You change your data in the app, and the sheet mirrors it.

## 3. How updates reach you without carrying anything about anyone (the recipe author)

Updates flow from the recipe outward, one direction only. When a fix ships, the repo changes. Then, independently, every deployment catches up: you press "Sync fork" on GitHub, your photocopy of the recipe matches the original again, and Vercel rebakes your site automatically. Your deployment and every other deployment are all simply downstream of the same recipe. Nothing personal is included with an update, because updates come from the repo, and the repo carries only code. It's as if the recipe author sent you an updated version with better instructions for the recipe.

The app also checks, occasionally, whether a newer version of the recipe exists, so it can show you a note that a new version is available. That check asks GitHub one public question ("what is the newest Dusknote version?") and sends nothing about you. It is the app's only network contact besides your own Google Sheet.

## What a stranger sees

Suppose someone finds your deployment's URL and opens it. They would see an empty app. The data lives per-device, so their phone's storage starts blank; there is nothing of yours at that address to see. If they tapped "Connect Google" from there, it would connect *their* Google account and create a spreadsheet in *their* Drive. Your kitchen serves the recipe to whoever visits, and everyone who visits cooks their own meal.

## Why everyone gets their own kitchen

If a stranger could cook their own meal at your address, why doesn't everyone share one deployment? Because sharing a kitchen means depending on its owner, in ways that matter for a health app:

- **The app your phone runs arrives from the deployment.** On a shared one, whoever owns it could change what it serves, and everyone on it would run that changed code with their health data. Owning your deployment guarantees the code you run is the public recipe: the version anyone can read and check, where an altered copy could contain anything, and you would have no way to know.
- **On a shared deployment, your app lives only as long as the owner's hosting account (Vercel).** Your own kitchen can't be closed by someone else.
- **The Google connection is per-person by design**: your Client ID belongs to your own Google Cloud project. Google caps how much traffic each project can send, so one project shared by hundreds of phones would hit those caps and everyone's backups would stall. And the project's owner is answerable to Google for everyone on it, which turns a personal tool into someone's job.
- **Whoever runs a shared kitchen can see everyone who walks in**, because hosting logs record every visit. Your own deployment's logs are yours alone.
