# Security posture

OpenSSF Scorecard runs against this repository weekly and on every push to `main`
(`.github/workflows/scorecard.yml`). It checks supply-chain hygiene — branch protection, pinned
dependencies and CI actions, whether releases are signed, whether a security policy exists, and
similar — and gives each check a 0-10 score.

Results appear two places: the repo's code-scanning alerts (uploaded as SARIF), and the public
Scorecard API/badge for this repository once one is added to the README.

The separate OpenSSF Best Practices badge is a self-assessment questionnaire a maintainer answers
by hand on bestpractices.dev — Scorecard does not fill it in, and nothing here automates it.
