"""Regression coverage for UI version tags and sparse GitHub Releases."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import versioning as v


def code(path: str, lines: int = 30, *, added: bool = False) -> v.FileChange:
    """Build a runtime or maintenance diff for classification checks."""
    return v.FileChange(path, lines, 0, added=added)


def commit(subject: str, *files: v.FileChange, body: str = "") -> v.Commit:
    """Build a commit without depending on repository state."""
    return v.Commit("a" * 40, subject, body, files)


class ClassificationTests(unittest.TestCase):
    """Version arithmetic and UI-specific commit classification."""

    def test_versions_reset_lower_fields(self) -> None:
        current = v.Version(2, 4, 6)
        for level, expected in (
            (v.Level.MAJOR, v.Version(3, 0, 0)),
            (v.Level.MINOR, v.Version(2, 5, 0)),
            (v.Level.PATCH, v.Version(2, 4, 7)),
            (v.Level.NONE, current),
        ):
            with self.subTest(level=level):
                self.assertEqual(current.bump(level), expected)
        self.assertEqual(v.Version.parse_tag("v2.4.6"), current)
        for invalid in ("v2.4", "2.4.6", "v2.4.6-rc.1"):
            self.assertIsNone(v.Version.parse_tag(invalid))

    def test_types_and_free_form_subjects(self) -> None:
        for subject, expected in (
            ("feat(chat): add attachments", v.Level.MINOR),
            ("Add thread search", v.Level.MINOR),
            ("perf: reduce streaming updates", v.Level.MINOR),
            ("fix(chat): retain drafts", v.Level.PATCH),
            ("docs: explain chat", v.Level.PATCH),
            ("feat!: replace authentication", v.Level.MAJOR),
        ):
            with self.subTest(subject=subject):
                result = v.classify_commit(commit(subject, code("src/app/page.tsx")))
                self.assertEqual(result.level, expected)

    def test_ui_tooling_and_tests_cannot_be_large_runtime_features(self) -> None:
        for path in (
            "package.json",
            "yarn.lock",
            "next.config.ts",
            "tsconfig.json",
            "eslint.config.mjs",
            "postcss.config.mjs",
            "tailwind.config.ts",
            ".github/workflows/release.yml",
            "scripts/versioning.py",
            "tests/chat.test.mjs",
            "src/lib/queue.test.ts",
            "src/__tests__/chat.tsx",
        ):
            with self.subTest(path=path):
                result = v.classify_commit(
                    commit("feat: new helpers", code(path, 4000, added=True))
                )
                self.assertEqual(result.level, v.Level.PATCH)
        self.assertEqual(v.path_area("src/app/page.tsx"), "runtime")

    def test_trailers_override_and_only_final_paragraph_counts(self) -> None:
        for trailer, expected in (
            ("major", v.Level.MAJOR),
            ("minor", v.Level.MINOR),
            ("patch", v.Level.PATCH),
            ("none", v.Level.NONE),
        ):
            with self.subTest(trailer=trailer):
                result = v.classify_commit(
                    commit(
                        "feat!: new protocol",
                        code("src/lib/client.ts"),
                        body=f"Details.\n\nVersion-Bump: {trailer}",
                    )
                )
                self.assertEqual(result.level, expected)
        self.assertIsNone(v.trailer_level("Version-Bump: major\n\nAn example above."))
        breaking = v.classify_commit(
            commit(
                "refactor: client",
                code("src/lib/client.ts"),
                body="BREAKING CHANGE: replace the transport",
            )
        )
        self.assertEqual(breaking.level, v.Level.MAJOR)

    def test_large_feature_and_architecture_need_code_evidence(self) -> None:
        files = tuple(
            code(f"src/app/components/panel{i}.tsx", 250, added=True) for i in range(12)
        )
        self.assertEqual(
            v.classify_commit(commit("feat: new workspace", *files)).level,
            v.Level.MAJOR,
        )
        self.assertEqual(
            v.classify_commit(commit("chore: refresh generated files", *files)).level,
            v.Level.PATCH,
        )
        self.assertEqual(
            v.classify_commit(
                commit("refactor: architecture", code("src/app/page.tsx", 199))
            ).level,
            v.Level.MINOR,
        )
        self.assertEqual(
            v.classify_commit(
                commit("refactor: architecture", code("src/app/page.tsx", 200))
            ).level,
            v.Level.MAJOR,
        )

    def test_multiple_fixes_escalate_a_release(self) -> None:
        changes = tuple(
            v.Change(item, v.classify_commit(item))
            for item in (
                commit("fix: draft", code("src/lib/draft.ts")),
                commit("fix: queue", code("src/lib/queue.ts")),
            )
        )
        level, reason = v.summarize_release(changes, v.Version(1, 0, 0))
        self.assertEqual(level, v.Level.MINOR)
        self.assertIn("2 bug fixes", reason)


class Repo:
    """Small dated Git repository used by integration tests."""

    def __init__(self, path: Path, *, init: bool = True) -> None:
        self.path = path
        self.clock = 1_700_010_000
        if init:
            self.git("init", "-q", "-b", "main")
            self.git("config", "user.name", "Release Test")
            self.git("config", "user.email", "test@example.com")
            self.git("config", "commit.gpgsign", "false")
            self.git("config", "tag.gpgsign", "false")

    def git(self, *args: str) -> str:
        """Run Git with deterministic dates and isolated signing settings."""
        self.clock += 60
        result = subprocess.run(
            ["git", *args],
            cwd=self.path,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={
                **os.environ,
                "GIT_AUTHOR_DATE": f"{self.clock} +0000",
                "GIT_COMMITTER_DATE": f"{self.clock} +0000",
            },
        )
        return result.stdout.strip()

    def commit(
        self, subject: str, path: str, content: str = "export default 1;\n"
    ) -> str:
        """Commit a file and return its commit ID."""
        target = self.path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.git("add", path)
        self.git("commit", "-q", "-m", subject)
        return self.git("rev-parse", "HEAD")


@unittest.skipUnless(shutil.which("git"), "Git is required")
class HistoryTests(unittest.TestCase):
    """Real Git coverage for backfill, recovery, and publication selection."""

    @classmethod
    def setUpClass(cls) -> None:
        """Create docs, a feature, a merged pair of fixes, and a hotfix."""
        cls.template = tempfile.TemporaryDirectory()
        repo = Repo(Path(cls.template.name))
        repo.commit("Initial commit", "README.md", "# Demo\n")
        repo.commit("feat: first product", "src/app/page.tsx")
        repo.git("checkout", "-q", "-b", "topic")
        repo.commit("fix: first bug", "src/lib/a.ts")
        repo.commit("fix: second bug", "src/lib/b.ts")
        repo.git("checkout", "-q", "main")
        repo.git(
            "merge",
            "-q",
            "--no-ff",
            "topic",
            "-m",
            "Merge pull request #1 from org/topic",
        )
        repo.commit("fix: hotfix", "src/lib/c.ts")

    @classmethod
    def tearDownClass(cls) -> None:
        """Remove the shared temporary repository."""
        cls.template.cleanup()

    def setUp(self) -> None:
        """Copy the template to isolate tag and remote mutations."""
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        target = self.root / "repo"
        shutil.copytree(self.template.name, target)
        self.repo = Repo(target, init=False)

    def tag_history(self) -> v.History:
        """Tag the fixture history and reload its tag state."""
        history = v.History.load(self.repo.path, "main")
        v.create_tags(history, v.plan_releases(history))
        return v.History.load(self.repo.path, "main")

    def test_backfill_covers_every_commit_once(self) -> None:
        history = v.History.load(self.repo.path, "main")
        plans = v.plan_releases(history)
        self.assertEqual(
            [p.tag for p in plans], ["v0.0.1", "v1.0.0", "v1.1.0", "v1.1.1"]
        )
        self.assertEqual([len(p.changes) for p in plans], [1, 1, 2, 1])
        commits = [c.commit.sha for p in plans for c in p.changes]
        self.assertEqual(len(commits), len(set(commits)))
        self.assertEqual(
            set(commits),
            set(self.repo.git("rev-list", "--no-merges", "main").splitlines()),
        )

    def test_tags_are_annotated_dated_and_idempotent(self) -> None:
        history = self.tag_history()
        self.assertEqual(self.repo.git("cat-file", "-t", "v1.1.0"), "tag")
        self.assertIn("fix: second bug", history.tag_message("v1.1.0"))
        tagged_at = self.repo.git(
            "for-each-ref", "--format=%(taggerdate:unix)", "refs/tags/v1.1.0"
        )
        self.assertEqual(
            tagged_at, self.repo.git("show", "-s", "--format=%ct", "v1.1.0^{commit}")
        )
        self.assertEqual(v.plan_releases(history), [])
        self.assertEqual(history.released_in(), "v1.1.1")

    def test_interrupted_backfill_resumes_the_same_plan(self) -> None:
        history = v.History.load(self.repo.path, "main")
        plans = v.plan_releases(history)
        v.create_tags(history, plans[:2])
        resumed = v.plan_releases(v.History.load(self.repo.path, "main"))
        self.assertEqual([p.tag for p in resumed], [p.tag for p in plans[2:]])
        self.assertTrue(all(p.backfill_target == history.tip for p in resumed))

    def test_future_direct_commits_are_one_version(self) -> None:
        self.tag_history()
        self.repo.commit("fix: one", "src/lib/d.ts")
        self.repo.commit("feat: two", "src/lib/e.ts")
        plans = v.plan_releases(v.History.load(self.repo.path, "main"))
        self.assertEqual([(p.tag, len(p.changes)) for p in plans], [("v1.2.0", 2)])

    def test_coalesced_merges_keep_their_own_versions(self) -> None:
        self.tag_history()
        for name, subject in (("pr2", "fix: two"), ("pr3", "feat: three")):
            self.repo.git("checkout", "-q", "-b", name)
            self.repo.commit(subject, f"src/lib/{name}.ts")
            self.repo.git("checkout", "-q", "main")
            self.repo.git("merge", "-q", "--no-ff", name, "-m", f"Merge {name}")
        plans = v.plan_releases(v.History.load(self.repo.path, "main"))
        self.assertEqual([p.tag for p in plans], ["v1.1.2", "v1.2.0"])

    def test_conflicting_local_tag_is_refused(self) -> None:
        self.repo.git("tag", "v0.0.1", "main~1")
        with self.assertRaisesRegex(v.VersioningError, "already exists"):
            v.plan_releases(v.History.load(self.repo.path, "main~2"), "backfill")

    def test_remote_batches_recover_and_refuse_conflicts(self) -> None:
        remote = self.root / "remote.git"
        self.repo.git("init", "-q", "--bare", str(remote))
        self.repo.git("remote", "add", "origin", str(remote))
        history = self.tag_history()
        tags = history.version_tags_on_chain()
        pushed = v.push_tags(
            self.repo.path, "origin", tags, history.all_tags, batch_size=2
        )
        self.assertEqual(pushed, tags)
        self.assertEqual(
            v.remote_tag_targets(self.repo.path, "origin"), history.all_tags
        )
        self.assertEqual(
            v.push_tags(self.repo.path, "origin", tags, history.all_tags), []
        )
        self.repo.git("push", "-q", "--force", "origin", "main~1:refs/tags/v1.1.1")
        with self.assertRaisesRegex(v.VersioningError, "v1.1.1"):
            v.push_tags(self.repo.path, "origin", tags, history.all_tags)

    def test_sparse_history_rolls_omitted_versions_into_next_release(self) -> None:
        self.tag_history()
        self.repo.commit("feat: second product", "src/lib/second.ts")
        history = self.tag_history()
        requests, skipped = v.release_requests(
            history,
            history.all_tags,
            {},
            "https://github.com/org/repo",
            historical_before=v.Version(1, 2, 0),
        )
        self.assertEqual(skipped, [])
        self.assertEqual([r.tag for r in requests], ["v1.0.0", "v1.2.0"])
        self.assertEqual([r.latest for r in requests], [False, True])
        self.assertIn("v1.1.0", requests[-1].body)
        self.assertIn("fix: hotfix", requests[-1].body)
        self.assertIn("compare/v1.0.0...v1.2.0", requests[-1].body)
        existing = {r.tag: v.ExistingRelease(i, r.body) for i, r in enumerate(requests)}
        again, _ = v.release_requests(
            history,
            history.all_tags,
            existing,
            historical_before=v.Version(1, 2, 0),
        )
        self.assertEqual(again, [])

    def test_unpushed_tags_never_create_github_releases(self) -> None:
        history = self.tag_history()
        requests, skipped = v.release_requests(history, {}, {})
        self.assertEqual(requests, [])
        self.assertEqual(skipped, ["v1.0.0", "v1.1.0"])

    def test_sync_refreshes_notes_and_removes_only_excluded_releases(self) -> None:
        history = self.tag_history()
        existing = {
            "v1.0.0": v.ExistingRelease(1, "stale notes"),
            "v1.1.0": v.ExistingRelease(2, "old minor release"),
            "v1.1.1": v.ExistingRelease(3, "old patch release"),
        }
        requests, _ = v.release_requests(
            history,
            history.all_tags,
            existing,
            sync=True,
            historical_before=v.Version(2, 0, 0),
        )
        self.assertEqual(
            [(r.tag, r.kind) for r in requests],
            [
                ("v1.1.0", "delete"),
                ("v1.1.1", "delete"),
                ("v1.0.0", "update"),
            ],
        )
        self.assertEqual(
            history.all_tags, v.History.load(self.repo.path, "main").all_tags
        )

    def test_cli_writes_outputs_and_reemits_existing_tip(self) -> None:
        outputs = self.root / "outputs.txt"
        args = [
            "--repo",
            str(self.repo.path),
            "tag",
            "--tip",
            "main",
            "--github-output",
            str(outputs),
        ]
        self.assertEqual(v.main(args), 0)
        self.assertIn("latest_tag=v1.1.1", outputs.read_text(encoding="utf-8"))
        outputs.unlink()
        self.assertEqual(v.main(args), 0)
        self.assertIn("created=0", outputs.read_text(encoding="utf-8"))

    def test_committed_policy_is_loaded_and_used_by_cli(self) -> None:
        path = self.repo.path / ".github" / "release-policy.json"
        path.parent.mkdir()
        policy = {
            "level": "minor",
            "historical_before": "v1.1.0",
            "historical_level": "major",
        }
        path.write_text(json.dumps(policy), encoding="utf-8")
        self.assertEqual(
            v.load_release_policy(self.repo.path),
            v.ReleasePolicy("minor", v.Version(1, 1, 0), "major"),
        )
        history = self.tag_history()
        with (
            patch.object(v, "github_releases", return_value={}),
            patch.object(v, "remote_tag_targets", return_value=history.all_tags),
            patch.object(v, "release_requests", wraps=v.release_requests) as requests,
        ):
            self.assertEqual(
                v.main(
                    [
                        "--repo",
                        str(self.repo.path),
                        "publish",
                        "--tip",
                        "main",
                        "--github-repo",
                        "org/repo",
                        "--dry-run",
                    ]
                ),
                0,
            )
            self.assertEqual(
                requests.call_args.kwargs["historical_before"], v.Version(1, 1, 0)
            )

    def test_invalid_policy_fails_closed(self) -> None:
        path = self.repo.path / ".github" / "release-policy.json"
        path.parent.mkdir()
        for invalid in (
            "{",
            "[]",
            '{"level":"unknown"}',
            '{"historical_before":42}',
            '{"typo":true}',
        ):
            with self.subTest(policy=invalid):
                path.write_text(invalid, encoding="utf-8")
                with self.assertRaises(v.VersioningError):
                    v.load_release_policy(self.repo.path)


class PublicationTests(unittest.TestCase):
    """Rate limits and failures must preserve resumable publication."""

    def test_pacing_and_rate_limit_backoff(self) -> None:
        now = [0.0]
        calls = []

        def sleep(seconds: float) -> None:
            now[0] += seconds

        def create(request: v.ReleaseRequest) -> None:
            calls.append((request.tag, now[0]))
            if request.tag == "v2" and sum(tag == "v2" for tag, _ in calls) == 1:
                raise v.RateLimited("secondary rate limit")

        done = v.publish_releases(
            [v.ReleaseRequest(tag) for tag in ("v1", "v2", "v3")],
            create,
            interval=5,
            sleep=sleep,
            clock=lambda: now[0],
            backoff=(60,),
            log=lambda _: None,
        )
        self.assertEqual(done, ["v1", "v2", "v3"])
        self.assertEqual(calls, [("v1", 0), ("v2", 5), ("v2", 65), ("v3", 70)])

    def test_persistent_failure_stops_before_the_next_release(self) -> None:
        calls = []

        def create(request: v.ReleaseRequest) -> None:
            calls.append(request.tag)
            raise v.RateLimited("secondary rate limit")

        with self.assertRaises(v.RateLimited):
            v.publish_releases(
                [v.ReleaseRequest("v1"), v.ReleaseRequest("v2")],
                create,
                interval=0,
                sleep=lambda _: None,
                backoff=(1, 2),
                log=lambda _: None,
            )
        self.assertEqual(calls, ["v1", "v1", "v1"])


if __name__ == "__main__":
    unittest.main()
