# Security

Found a security problem in Dusknote? **Report it privately, not in a public issue.** A public report tells every deployment's attacker about the hole before any deployment has the fix.

**How:** on this repository's **Security** tab, choose **Report a vulnerability**. That opens a private thread that only you and the maintainer can see.

Security reports are the one kind of contribution that the maintainer will treat as a priority. This is a personal project maintained in off hours, but a real vulnerability gets fixed first. Fixes are announced via an update banner in every running copy.

## What's worth reporting

Dusknote is a static app with no server: each deployment is one person's instance, their data on their device and in their own Google Drive. Things that matter most in terms of security:

- Anything that could expose or exfiltrate a person's entries or their Google access token (script injection, a hole in the security policy, a leak through URLs or referrers).
- Anything that could corrupt or destroy data (a flaw in sync, import validation, or the backup path).
- Anything that lets one deployment or visitor affect another person's deployment or data.

Not usually in scope: issues requiring the attacker to already control the person's device or Google account, self-inflicted console tricks on your own instance, and vulnerabilities in Google's or Vercel's own services (report those to them).

**Request**: please never include real health data in a report. Fabricated example data demonstrates any bug just as well.
