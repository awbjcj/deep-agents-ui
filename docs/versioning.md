# Automated versions and releases

Stable UI history on `main` is labelled with annotated `vMAJOR.MINOR.PATCH`
Git tags. Versions come from commit history, using the same engine and product
version rules as the VSDA backend. No manual `package.json` bumps are needed;
its version is package metadata for this private application.

| Level | Changes                                                                   |
| ----- | ------------------------------------------------------------------------- |
| MAJOR | Breaking markers, large new features, or substantial architecture changes |
| MINOR | Feature improvements, substantial refactors, or multiple bug fixes        |
| PATCH | A small fix, documentation, tests, dependencies, or tooling               |

The strongest change wins. Major and minor bumps reset the lower fields.
An explicit `Version-Bump: major`, `minor`, `patch`, or `none` trailer in the
final paragraph of a commit overrides classification. `feat!:` or a
`BREAKING CHANGE:` footer requests a major version. The first product release
becomes `1.0.0`.

Only runtime code contributes to large-feature thresholds: at least 3,000 net
new lines in 12 new code files. Moving or deleting at least 60 runtime files
across four areas is an architecture change. An architecture keyword requires
at least 200 changed runtime lines. Root package metadata, lockfiles, build
configuration, scripts, tests, and workflow files are maintenance changes.

## Release cadence

Every version gets a tag. Routine patch versions do not get GitHub Releases;
their changes appear in the next published major or minor release's notes.

The historical backfill is deliberately sparse. The committed
[release policy](../.github/release-policy.json) publishes only major milestones
before `v2.2.0`, then major and minor versions from `v2.2.0` onward. This keeps
the initial history to three GitHub Releases instead of more than 100. The
cutoff also applies on retries, so automation never recreates the omitted
historical minor releases. Those changes remain in tags and are included in
the next published release's notes, with links to the commits and full diff.

## Automation

The [Release workflow](../.github/workflows/release.yml) runs after **successful
CI on a push to `main`**. It checks out the tested commit with full history,
serializes release runs, creates tags, pushes them in atomic batches, and
publishes any missing eligible releases. Only this job has `contents: write`.
It uses the repository's `GITHUB_TOKEN`, so its tag pushes do not trigger
recursive workflow runs. PRs targeting `main` receive a read-only version
preview. A manual run on `main` can recover an interrupted run; select
`dry_run` to inspect the plan.

The first run backfills each first-parent change in stable history, including
upstream history. Each merge gets one tag covering the commits it introduced;
commits within that merge share its release. Empty commits roll forward.
Tags retain the commit date and record a backfill target so interrupted runs
resume without collapsing the remaining history. After backfill, every merge
and run of direct commits ends a version. Existing version tags are never moved,
and a conflicting local or remote tag stops publication.

Development branches remain untagged until their changes reach `main`, because
their commit IDs can change during rebases. UI and backend versions are
independent.

## Local commands

Python 3.11+ and Git are sufficient for planning, tests, and tags. Publishing
also needs an authenticated GitHub CLI (`gh`). Run from the repository root:

```bash
python -m unittest discover -s tests/versioning -v
python scripts/versioning.py current
python scripts/versioning.py plan --tip origin/main --mode backfill --verbose
python scripts/versioning.py tag --tip origin/main --push
python scripts/versioning.py publish --tip origin/main --dry-run
python scripts/versioning.py publish --tip origin/main
```

`publish` checks that every candidate tag exists on the remote at the same
commit before creating its release. Repeated runs leave existing tags and
releases intact. It paces large batches and retries rate limits. `--level major`
can further reduce publication; `--sync` explicitly refreshes release notes
and removes releases excluded by the policy, while preserving all tags.

Find the first version that shipped any stable commit:

```bash
git tag --contains <commit> --sort=version:refname
```

The first result is its shipping version. For the most recent version at or
before a commit, use `git describe --tags --match 'v*' --abbrev=0 <commit>`.
