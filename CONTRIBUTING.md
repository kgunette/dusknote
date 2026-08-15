# Contributing

Dusknote is a personal tool first. I built it because I lost two years of my own health records to a failed phone backup. I use Dusknote every day, and I maintain it on my own schedule. Some expectation setting:

- **Issues and pull requests are welcome.** I read them. I'm glad you're here.
- **I respond when I respond.** There is no support queue and no guaranteed response time. Your app keeps working regardless, and it's designed not to depend on me.
- **I may decline pull requests, including good ones.** Dusknote's value lives in what it refuses to become: no backend, no accounts, no analytics, no warning colors, no feature sprawl. A PR can be well-built and still not belong here. If I decline, it's about the shape of the product, and forking is a real option I mean sincerely, since the license and the docs are built for exactly that.
- **Security reports are the exception** and get priority. If you've identified a real vulnerability, see [SECURITY.md](SECURITY.md) on how to submit a security report (please don't file a public issue for a security problem).
- **Auth changes require testing on a real phone.** Sign-in is the most fragile, most device-dependent code in the app, and [docs/auth-design.md](docs/auth-design.md) explains why it works the way it does. If your PR touches sign-in, say in the description how you tested it: a real phone, the app installed to the home screen, and which flows you ran. Without that, an auth PR will be declined; with it, it gets reviewed like any other PR, which may still mean no.
- **What continuous integration checks.** Every pull request runs a type-check, a production build, and the unit tests that cover the sync and data-safety logic. A green check means the app compiles and that core logic passes; it does not test the whole app, so a real phone is still the final word for anything touching sign-in or sync.
- **Bug reports:** say what you expected, what happened instead, and what device and browser you were on. And never paste your real health data into an issue; made-up entries demonstrate a bug just as well.

This project's promise is that no one gets trapped: your data is yours, your deployment is yours, and the app can't be taken away from you. The same applies to me, and these boundaries are what let me maintain Dusknote without it trapping me either.
