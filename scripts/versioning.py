"""Automated semantic versioning for the deep-agents-ui repository.

Every release on ``main`` is labelled with an annotated ``vMAJOR.MINOR.PATCH``
tag. The bump level of a release is derived from the commits it introduces:

* **MAJOR** - a new large feature or an architecture-level change.
* **MINOR** - an improvement to an existing feature, or multiple bug fixes.
* **PATCH** - a small fix or maintenance change (docs, tests, tooling).

Commits are classified deterministically, in priority order, from an explicit
``Version-Bump: major|minor|patch|none`` trailer, a Conventional Commit breaking
marker (``type!:`` / ``BREAKING CHANGE:``), the Conventional Commit type or the
leading verb of a free-form subject, and the changed paths and diff size. A
release is then re-checked as a whole, so a large feature delivered across many
commits of one pull request is still recognised.

Labelling modes share the same rules:

* ``backfill`` - label every first-parent change on the branch (a merge commit
  releases everything it merged; a direct commit releases itself). Used once to
  version the existing history; an interrupted backfill resumes as a backfill.
* ``release`` - label each first-parent merge and each run of direct commits
  since the previous version tag; normally exactly one release, the pushed
  commit. Used by CI on each push to ``main``.
* ``single`` - one release at the tip covering everything (version previews).

``auto`` picks ``backfill`` when no version tag exists yet (or a recorded
backfill is unfinished) and ``release`` otherwise. Every version gets a tag;
``publish`` then creates a GitHub Release (via the ``gh`` CLI) only for a.b
versions (``X.Y.0``), whose notes, rendered from the tag annotations, also
cover the patch versions since the previous release. Apart from ``publish`` the
script is stdlib-only so CI can run it without installing the project. The
repository's release policy keeps historical minor versions tag-only, while
retaining major milestones and publishing new major/minor versions. See
``docs/versioning.md``.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import IntEnum
from pathlib import Path, PurePosixPath

TAG_PREFIX = "v"
TAG_PATTERN = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")

# Release rule: this many bug fixes in one release count as a MINOR bump.
MULTI_FIX_THRESHOLD = 2
# Ambiguous "update/change" commits below this runtime churn are small tweaks.
SMALL_CHANGE_LINES = 20
# Refactors with at least this runtime churn improve existing features (MINOR).
SUBSTANTIAL_REFACTOR_LINES = 100
# A change creating a new package with at least this much code adds a subsystem.
NEW_PACKAGE_MIN_FILES = 4
NEW_PACKAGE_MIN_NET_LINES = 800
# A single feature commit adding at least this much new runtime code is "large".
LARGE_FEATURE_NET_LINES = 3000
LARGE_FEATURE_NEW_FILES = 12
# Moving or removing packages while touching this many runtime files across
# this many top-level areas is an architecture-level restructuring.
ARCH_MIN_FILES = 60
ARCH_MIN_AREAS = 4
# An "architecture" keyword only counts when backed by this much runtime churn.
ARCH_KEYWORD_MIN_LINES = 200
CODE_SUFFIXES = frozenset(
    {".py", ".pyi", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".sh", ".ps1", ".sql"}
)

PUSH_BATCH_SIZE = 100
# GitHub allows 500 content-creating requests per hour, so publishing more than
# a handful of releases is paced to one request every 7.5 seconds.
RELEASE_BULK_THRESHOLD = 20
RELEASE_BULK_INTERVAL = 7.5
RATE_LIMIT_BACKOFF = (60, 120, 300, 600, 900)

_TRAILER_RE = re.compile(
    r"^\s*Version-Bump:\s*(major|minor|patch|none)\s*$", re.IGNORECASE | re.MULTILINE
)
_BACKFILL_RE = re.compile(r"^Backfill-Target: ([0-9a-f]{40})$", re.MULTILINE)
_BREAKING_RE = re.compile(r"^BREAKING[ -]CHANGE:", re.MULTILINE)
_HEADER_RE = re.compile(
    r"^(?P<type>[A-Za-z][\w-]*)(?:\((?P<scope>[^)]*)\))?(?P<bang>!)?:\s*(?P<desc>.*)$"
)
_ARCH_RE = re.compile(
    r"\b(architecture|architectural|re-?architect\w*)\b", re.IGNORECASE
)
_FIX_BULLET_RE = re.compile(
    r"^\s*(?:[-*]|\d+[.)])\s+(?:\w+(?:\([^)]*\))?:\s*)?"
    r"(?:fix|fixes|fixed|resolve[sd]?|correct(?:s|ed)?|repair(?:s|ed)?)\b",
    re.IGNORECASE | re.MULTILINE,
)
_FIX_REF_RE = re.compile(
    r"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+(?:[\w.-]+/[\w.-]+)?#\d+",
    re.IGNORECASE,
)


class VersioningError(RuntimeError):
    """Raised when git state prevents a safe versioning decision."""


class RateLimited(VersioningError):
    """GitHub rejected a request because of a (secondary) rate limit."""


class Level(IntEnum):
    """Semantic-version bump level, ordered so ``max`` picks the strongest."""

    NONE = 0
    PATCH = 1
    MINOR = 2
    MAJOR = 3

    @property
    def label(self) -> str:
        """Return the lowercase label used in annotations and CLI output."""
        return self.name.lower()


@dataclass(frozen=True, order=True)
class Version:
    """A ``MAJOR.MINOR.PATCH`` version."""

    major: int = 0
    minor: int = 0
    patch: int = 0

    @classmethod
    def parse_tag(cls, tag: str) -> Version | None:
        """Parse ``vX.Y.Z``; return ``None`` for any other tag name."""
        match = TAG_PATTERN.match(tag)
        if match is None:
            return None
        return cls(*(int(part) for part in match.groups()))

    def bump(self, level: Level) -> Version:
        """Return the next version; lower fields reset on MAJOR/MINOR bumps."""
        if level is Level.MAJOR:
            return Version(self.major + 1, 0, 0)
        if level is Level.MINOR:
            return Version(self.major, self.minor + 1, 0)
        if level is Level.PATCH:
            return Version(self.major, self.minor, self.patch + 1)
        return self

    @property
    def tag(self) -> str:
        """Return the annotated Git tag name for this version."""
        return f"{TAG_PREFIX}{self}"

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"


@dataclass(frozen=True)
class FileChange:
    """One file touched by a commit (renames appear as delete + add)."""

    path: str
    insertions: int = 0
    deletions: int = 0
    added: bool = False
    deleted: bool = False


@dataclass(frozen=True)
class Commit:
    """Metadata of one non-merge commit needed for classification."""

    sha: str
    subject: str
    body: str = ""
    files: tuple[FileChange, ...] = ()
    committed_at: str = ""
    new_graphs: tuple[str, ...] = ()

    @property
    def short(self) -> str:
        """Return the commit abbreviation used in release notes."""
        return self.sha[:8]


@dataclass(frozen=True)
class Classification:
    """Bump level of one commit and the evidence behind it."""

    kind: str
    level: Level
    reason: str
    fixes: int = 0

    @property
    def is_bugfix(self) -> bool:
        """Whether this change contributes to the release's bug-fix count."""
        return self.fixes > 0


@dataclass(frozen=True)
class Change:
    """A classified commit inside a release."""

    commit: Commit
    classification: Classification


@dataclass(frozen=True)
class ReleasePlan:
    """A version to create at ``tip`` and the changes it releases."""

    tip: str
    previous: Version | None
    version: Version
    level: Level
    reason: str
    changes: tuple[Change, ...]
    committed_at: str = ""
    backfill_target: str | None = None

    @property
    def tag(self) -> str:
        """Return the version tag to create at the release tip."""
        return self.version.tag


# --------------------------------------------------------------------------- #
# Commit classification
# --------------------------------------------------------------------------- #

_CONVENTIONAL_KINDS: dict[str, str] = {
    "feat": "feature",
    "feature": "feature",
    "fix": "fix",
    "bugfix": "fix",
    "hotfix": "fix",
    "perf": "improvement",
    "improvement": "improvement",
    "improve": "improvement",
    "enhance": "improvement",
    "enhancement": "improvement",
    "refactor": "refactor",
    "simplify": "refactor",
    "docs": "docs",
    "doc": "docs",
    "test": "test",
    "tests": "test",
    "chore": "chore",
    "build": "chore",
    "ci": "chore",
    "deps": "chore",
    "style": "chore",
    "revert": "chore",
    "release": "chore",
}
# Conventional types that describe non-product work; trusted even when they
# touch runtime files, and never escalated beyond PATCH.
_MAINTENANCE_KINDS = frozenset({"docs", "test", "chore"})
# Kinds that change product code and may therefore be architectural or large.
_CODE_KINDS = frozenset({"feature", "improvement", "refactor"})

_VERB_KINDS: dict[str, str] = {}
for _kind, _verbs in {
    "feature": (
        "add adds added adding create creates created implement implements "
        "implemented introduce introduces introduced support supports supported "
        "enable enables enabled new initial initialize initializes initialise "
        "integrate integrates integrated expose exposes exposed allow allows "
        "provide provides provided launch launches"
    ),
    "fix": (
        "fix fixes fixed fixing bugfix hotfix resolve resolves resolved correct "
        "corrects corrected repair repairs repaired patch patched prevent "
        "prevents prevented avoid avoids restore restores restored handle "
        "handles handled guard guards workaround"
    ),
    "improvement": (
        "improve improves improved enhance enhances enhanced optimize optimizes "
        "optimized optimise optimises optimised refine refines refined extend "
        "extends extended upgrade upgrades upgraded rework reworks reworked "
        "streamline streamlines streamlined harden hardens hardened speed "
        "batch cache tune tunes tuned polish polishes polished expand expands "
        "expanded increase increases reduce reduces make makes migrate "
        "migrates migrated replace replaces replaced convert converts "
        "converted align aligns aligned enforce enforces enforced validate "
        "validates validated preserve preserves preserved redesign redesigns "
        "redesigned rewrite rewrites rewrote"
    ),
    "refactor": (
        "refactor refactors refactored restructure restructures restructured "
        "reorganize reorganizes reorganized rename renames renamed move moves "
        "moved split splits simplify simplifies simplified consolidate "
        "consolidates consolidated centralize centralizes centralized unify "
        "unifies unified cleanup clean cleans cleaned remove removes removed "
        "delete deletes deleted drop drops dropped deprecate deprecates "
        "decouple decouples decoupled extract extracts extracted"
    ),
    "tweak": (
        "update updates updated updating change changes changed modify "
        "modifies modified adjust adjusts adjusted tweak tweaks tweaked set "
        "sets bump bumps bumped revise revises revised"
    ),
    "docs": (
        "document documents documented docs doc readme describe describes "
        "described clarify clarifies clarified comment comments"
    ),
    "test": "test tests tested",
}.items():
    for _verb in _verbs.split():
        _VERB_KINDS[_verb] = _kind

_DOC_NAMES = frozenset(
    {"readme.md", "claude.md", "agents.md", "changelog.md", "license", "license.md"}
)
_TOOLING_NAMES = frozenset(
    {
        "uv.lock",
        "pyproject.toml",
        "makefile",
        ".gitignore",
        ".gitattributes",
        ".python-version",
        ".env.example",
        ".dockerignore",
        ".mcp.json",
        ".pre-commit-config.yaml",
        ".editorconfig",
        "package.json",
        "yarn.lock",
        "package-lock.json",
        "pnpm-lock.yaml",
        ".nvmrc",
        ".prettierignore",
        ".prettierrc",
        "components.json",
    }
)
_TOOLING_DIRS = (
    ".github/",
    ".vscode/",
    ".claude/",
    ".devcontainer/",
    ".codex/",
    "scripts/",
)


def path_area(path: str) -> str:
    """Return ``docs``, ``tests``, ``tooling`` or ``runtime`` for a repo path."""
    lowered = path.lower()
    name = PurePosixPath(lowered).name
    if lowered.startswith("docs/") or name in _DOC_NAMES or name.startswith("readme"):
        return "docs"
    if "/" not in lowered and (lowered.endswith(".md") or lowered.endswith(".rst")):
        return "docs"
    if (
        lowered.startswith(("tests/", "test/", "__tests__/"))
        or "/__tests__/" in lowered
        or re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name)
    ):
        return "tests"
    if (
        lowered.startswith(_TOOLING_DIRS)
        or name in _TOOLING_NAMES
        or name.startswith("dockerfile")
        or name.startswith("docker-compose")
        or (
            "/" not in lowered
            and name.startswith(
                (
                    "next.config.",
                    "eslint.config.",
                    "postcss.config.",
                    "tailwind.config.",
                    "tsconfig",
                    ".prettierrc.",
                )
            )
        )
    ):
        return "tooling"
    return "runtime"


def _is_runtime_code(change: FileChange) -> bool:
    return (
        path_area(change.path) == "runtime"
        and PurePosixPath(change.path).suffix.lower() in CODE_SUFFIXES
    )


def _top_area(path: str) -> str:
    parts = PurePosixPath(path).parts
    if len(parts) >= 3 and parts[0] == "src":
        return "/".join(parts[:2])
    return parts[0] if parts else path


def _package_dirs(files: Iterable[FileChange], *, added: bool) -> list[str]:
    """Product package dirs whose ``__init__.py`` was added/deleted.

    Product packages are top-level packages (the original layout) or packages
    up to two levels below ``src/``; vendored skill helpers are excluded.
    """
    found: list[str] = []
    for change in files:
        path = PurePosixPath(change.path)
        if path.name != "__init__.py" or path_area(change.path) != "runtime":
            continue
        if not (
            len(path.parts) == 2 or (path.parts[0] == "src" and len(path.parts) <= 4)
        ):
            continue
        if change.added if added else change.deleted:
            found.append(str(path.parent))
    return sorted(found)


def _net_code_lines(files: Iterable[FileChange]) -> int:
    return sum(
        change.insertions - change.deletions
        for change in files
        if _is_runtime_code(change)
    )


def _new_package_dirs(files: Sequence[FileChange]) -> list[str]:
    """New packages created with substantial code (moves net out to ~0 and are ignored)."""
    if _net_code_lines(files) < NEW_PACKAGE_MIN_NET_LINES:
        return []
    large: list[str] = []
    for root in _package_dirs(files, added=True):
        if any(root.startswith(parent + "/") for parent in large):
            continue
        inside = [change for change in files if change.path.startswith(root + "/")]
        new_code_files = sum(
            1 for change in inside if change.added and _is_runtime_code(change)
        )
        if (
            new_code_files >= NEW_PACKAGE_MIN_FILES
            and _net_code_lines(inside) >= NEW_PACKAGE_MIN_NET_LINES
        ):
            large.append(root)
    return large


def _infer_kind(text: str) -> str | None:
    words = re.findall(r"[A-Za-z][A-Za-z-]*", text)
    if not words:
        return None
    first = words[0].lower()
    if first in _VERB_KINDS:
        return _VERB_KINDS[first]
    if re.search(r"\bfix(e[sd])?\b|\bbugs?\b", text, re.IGNORECASE):
        return "fix"
    return None


def trailer_level(message: str) -> Level | None:
    """``Version-Bump`` value from the final trailer paragraph of a message."""
    paragraphs = [
        part for part in re.split(r"\n\s*\n", message.strip()) if part.strip()
    ]
    if not paragraphs:
        return None
    match = _TRAILER_RE.search(paragraphs[-1])
    return Level[match.group(1).upper()] if match is not None else None


def count_fixes(subject: str, body: str) -> int:
    """Bugs fixed by one commit: fix bullets and ``fixes #N`` references, at least 1."""
    bullets = len(_FIX_BULLET_RE.findall(body))
    references = len(set(_FIX_REF_RE.findall(f"{subject}\n{body}")))
    return max(1, bullets, references)


def structural_signal(files: Sequence[FileChange]) -> str | None:
    """Evidence of a package restructuring across many runtime areas, or ``None``."""
    runtime = [change for change in files if path_area(change.path) == "runtime"]
    removed = _package_dirs(files, added=False)
    areas = {_top_area(change.path) for change in runtime}
    if removed and len(runtime) >= ARCH_MIN_FILES and len(areas) >= ARCH_MIN_AREAS:
        return (
            f"restructures {len(runtime)} runtime files across {len(areas)} areas, "
            f"moving/removing {len(removed)} package(s)"
        )
    return None


def keyword_signal(text: str, runtime_churn: int) -> str | None:
    """An architecture keyword backed by enough runtime churn, or ``None``."""
    keyword = _ARCH_RE.search(text)
    if keyword is None or runtime_churn < ARCH_KEYWORD_MIN_LINES:
        return None
    return f"architecture keyword '{keyword.group(0)}' ({runtime_churn} runtime lines)"


def _runtime_churn(files: Iterable[FileChange]) -> int:
    return sum(
        change.insertions + change.deletions
        for change in files
        if path_area(change.path) == "runtime"
    )


def subsystem_signal(
    files: Sequence[FileChange], new_graphs: Sequence[str]
) -> str | None:
    """Evidence that a change adds a subsystem (new agent graph or code package), or ``None``."""
    if new_graphs:
        return f"new agent graph(s): {', '.join(new_graphs)}"
    packages = _new_package_dirs(files)
    if packages:
        return f"new package(s): {', '.join(packages)}"
    return None


def bulk_feature_signal(files: Sequence[FileChange]) -> str | None:
    """Evidence that a single feature commit adds a large body of new code, or ``None``."""
    net = _net_code_lines(files)
    new_files = sum(1 for change in files if change.added and _is_runtime_code(change))
    if net >= LARGE_FEATURE_NET_LINES and new_files >= LARGE_FEATURE_NEW_FILES:
        return f"+{net} net code lines in {new_files} new files"
    return None


def classify_commit(commit: Commit) -> Classification:
    """Classify one non-merge commit into a bump level with its evidence."""
    trailer = trailer_level(commit.body)
    if trailer is not None:
        kind = {
            Level.MAJOR: "breaking",
            Level.MINOR: "improvement",
            Level.PATCH: "chore",
            Level.NONE: "none",
        }[trailer]
        return Classification(kind, trailer, f"Version-Bump trailer ({trailer.label})")

    subject = commit.subject.strip()
    header = _HEADER_RE.match(subject)
    conventional_kind: str | None = None
    description = subject
    if header is not None:
        conventional_kind = _CONVENTIONAL_KINDS.get(header.group("type").lower())
        if header.group("bang"):
            return Classification("breaking", Level.MAJOR, "breaking change marker (!)")
        if conventional_kind is not None:
            description = header.group("desc")
    if _BREAKING_RE.search(commit.body):
        return Classification("breaking", Level.MAJOR, "BREAKING CHANGE footer")

    if not commit.files:
        return Classification("none", Level.NONE, "no file changes")

    structural = structural_signal(commit.files)
    if structural is not None:
        return Classification("architecture", Level.MAJOR, structural)
    if conventional_kind in _MAINTENANCE_KINDS:
        return Classification(
            conventional_kind, Level.PATCH, f"{conventional_kind} change"
        )
    runtime = [change for change in commit.files if path_area(change.path) == "runtime"]
    if not runtime:
        areas = {path_area(change.path) for change in commit.files}
        derived = (
            "docs" if areas == {"docs"} else "test" if areas == {"tests"} else "chore"
        )
        return Classification(derived, Level.PATCH, f"{derived}-only paths")

    kind = conventional_kind or _infer_kind(description)
    if kind is None and header is not None:
        kind = _infer_kind(header.group("desc"))
    churn = sum(change.insertions + change.deletions for change in runtime)
    if kind is None or kind == "tweak":
        if churn < SMALL_CHANGE_LINES:
            return Classification("tweak", Level.PATCH, f"small change ({churn} lines)")
        kind = "improvement"
    if kind in _MAINTENANCE_KINDS:
        return Classification(kind, Level.PATCH, f"{kind} change")
    if kind == "fix":
        fixes = count_fixes(subject, commit.body)
        reason = "bug fix" if fixes == 1 else f"{fixes} bug fixes"
        return Classification("fix", Level.PATCH, reason, fixes=fixes)

    arch = keyword_signal(description, churn)
    if arch is not None:
        return Classification("architecture", Level.MAJOR, arch)
    subsystem = subsystem_signal(commit.files, commit.new_graphs)
    if subsystem is not None:
        return Classification(
            "large-feature", Level.MAJOR, f"large feature: {subsystem}"
        )
    if kind == "feature":
        bulk = bulk_feature_signal(commit.files)
        if bulk is not None:
            return Classification(
                "large-feature", Level.MAJOR, f"large feature: {bulk}"
            )
        return Classification("feature", Level.MINOR, "feature")
    if kind == "improvement":
        return Classification("improvement", Level.MINOR, "feature improvement")
    if churn >= SUBSTANTIAL_REFACTOR_LINES:
        return Classification(
            "refactor", Level.MINOR, f"substantial refactor ({churn} lines)"
        )
    return Classification("refactor", Level.PATCH, f"small refactor ({churn} lines)")


def aggregate_files(changes: Sequence[Change]) -> tuple[FileChange, ...]:
    """Net per-path effect of a release's commits, applied in order."""
    totals: dict[str, list[int]] = {}
    born: dict[str, bool] = {}
    alive: dict[str, bool] = {}
    for change in changes:
        for item in change.commit.files:
            counts = totals.setdefault(item.path, [0, 0])
            counts[0] += item.insertions
            counts[1] += item.deletions
            if item.path not in born:
                born[item.path] = item.added
            alive[item.path] = not item.deleted
    return tuple(
        FileChange(
            path=path,
            insertions=totals[path][0],
            deletions=totals[path][1],
            added=born[path] and alive[path],
            deleted=not born[path] and not alive[path],
        )
        for path in sorted(totals)
    )


def summarize_release(
    changes: Sequence[Change],
    previous: Version | None = None,
    release_message: str = "",
) -> tuple[Level, str]:
    """Combine commit classifications into one release bump level and reason.

    ``release_message`` is the message of the release commit when it is a merge
    (the pull-request title); a ``Version-Bump`` trailer in its final paragraph
    overrides the computed level (``none`` defers the changes to the next
    release), and an architecture keyword there marks a code release MAJOR.
    The whole release is also re-checked structurally so a subsystem delivered
    across many commits is still recognised as a large feature.
    """
    override = trailer_level(release_message)
    if override is not None:
        return override, f"Version-Bump trailer on release commit ({override.label})"
    relevant = [
        change for change in changes if change.classification.level > Level.NONE
    ]
    if not relevant:
        return Level.NONE, "no releasable changes"
    strongest = max(relevant, key=lambda change: change.classification.level)
    if strongest.classification.level is Level.MAJOR:
        return Level.MAJOR, _describe(strongest)

    features = [
        change for change in relevant if change.classification.kind == "feature"
    ]
    if features and (previous is None or previous.major == 0):
        return Level.MAJOR, f"initial product release - {_describe(features[0])}"

    code_changes = [
        change for change in relevant if change.classification.kind in _CODE_KINDS
    ]
    if code_changes:
        files = aggregate_files(relevant)
        keyword = keyword_signal(
            release_message, _runtime_churn(aggregate_files(code_changes))
        )
        if keyword is not None:
            return Level.MAJOR, f"{keyword} in release title"
        if len(relevant) > 1:
            arch = structural_signal(files)
            if arch is not None:
                return Level.MAJOR, f"release {arch}"
            graphs = sorted(
                {graph for change in relevant for graph in change.commit.new_graphs}
            )
            subsystem = subsystem_signal(files, graphs)
            if subsystem is not None:
                return (
                    Level.MAJOR,
                    f"large feature across {len(relevant)} commits: {subsystem}",
                )

    if strongest.classification.level is Level.MINOR:
        return Level.MINOR, _describe(strongest)
    fixes = sum(change.classification.fixes for change in relevant)
    if fixes >= MULTI_FIX_THRESHOLD:
        return Level.MINOR, f"{fixes} bug fixes"
    return strongest.classification.level, _describe(strongest)


def _describe(change: Change) -> str:
    return f"{change.classification.reason}: {change.commit.subject.strip()} ({change.commit.short})"


# --------------------------------------------------------------------------- #
# Git access
# --------------------------------------------------------------------------- #


def run_git_bytes(
    repo: Path,
    *args: str,
    stdin: str | bytes | None = None,
    env: dict[str, str] | None = None,
) -> bytes:
    """Run git in ``repo`` (binary I/O, no newline translation) and return stdout."""
    data = stdin.encode("utf-8") if isinstance(stdin, str) else stdin
    result = subprocess.run(
        [
            "git",
            "-c",
            "core.quotepath=false",
            "-c",
            "i18n.logOutputEncoding=utf-8",
            *args,
        ],
        cwd=repo,
        input=data,
        capture_output=True,
        env={**os.environ, **(env or {})},
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise VersioningError(f"git {' '.join(args[:3])} failed: {detail}")
    return result.stdout


def run_git(repo: Path, *args: str, stdin: str | bytes | None = None) -> str:
    """Run git in ``repo`` and return stdout decoded as UTF-8."""
    return run_git_bytes(repo, *args, stdin=stdin).decode("utf-8", errors="replace")


def _unquote(path: str) -> str:
    if len(path) >= 2 and path.startswith('"') and path.endswith('"'):
        raw = path[1:-1].encode("utf-8").decode("unicode_escape")
        return raw.encode("latin-1", errors="replace").decode("utf-8", errors="replace")
    return path


_LOG_FORMAT = "%x1e%H%x1f%cI%x1f%s%x1f%b%x1d"
_NUMSTAT_RE = re.compile(r"^(\d+|-)\t(\d+|-)\t(.+)$")
_SUMMARY_RE = re.compile(r"^ (create|delete) mode \d+ (.+)$")


def parse_log(output: str) -> list[Commit]:
    """Parse ``git log --numstat --summary`` output produced with ``_LOG_FORMAT``."""
    commits: list[Commit] = []
    for record in output.split("\x1e"):
        if not record.strip():
            continue
        header, _, stats = record.partition("\x1d")
        sha, committed_at, subject, body = (header.split("\x1f") + ["", "", ""])[:4]
        numstat: dict[str, tuple[int, int]] = {}
        created: set[str] = set()
        removed: set[str] = set()
        for line in stats.splitlines():
            numeric = _NUMSTAT_RE.match(line)
            if numeric is not None:
                ins, dels, path = numeric.groups()
                numstat[_unquote(path)] = (
                    int(ins) if ins != "-" else 0,
                    int(dels) if dels != "-" else 0,
                )
                continue
            summary = _SUMMARY_RE.match(line)
            if summary is not None:
                target = created if summary.group(1) == "create" else removed
                target.add(_unquote(summary.group(2)))
        files = tuple(
            FileChange(
                path=path,
                insertions=numstat.get(path, (0, 0))[0],
                deletions=numstat.get(path, (0, 0))[1],
                added=path in created,
                deleted=path in removed,
            )
            for path in sorted(set(numstat) | created | removed)
        )
        commits.append(
            Commit(
                sha=sha.strip(),
                subject=subject,
                body=body,
                files=files,
                committed_at=committed_at,
            )
        )
    return commits


def read_blobs(repo: Path, specs: Sequence[str]) -> dict[str, bytes | None]:
    """Read ``<rev>:<path>`` blobs in one ``git cat-file --batch`` call."""
    if not specs:
        return {}
    output = run_git_bytes(
        repo, "cat-file", "--batch", stdin="".join(f"{s}\n" for s in specs)
    )
    blobs: dict[str, bytes | None] = {}
    offset = 0
    for spec in specs:
        end = output.index(b"\n", offset)
        header = output[offset:end].decode("utf-8", errors="replace").split()
        offset = end + 1
        if len(header) != 3 or not header[2].isdigit():
            blobs[spec] = None
            continue
        size = int(header[2])
        blobs[spec] = output[offset : offset + size]
        offset += size + 1
    return blobs


def _graph_keys(blob: bytes | None) -> set[str]:
    if not blob:
        return set()
    try:
        payload = json.loads(blob.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return set()
    graphs = payload.get("graphs") if isinstance(payload, dict) else None
    return set(graphs) if isinstance(graphs, dict) else set()


def _git_timestamp(iso: str) -> str | None:
    """Convert an ISO-8601 date to git's raw ``<epoch> <+hhmm>`` form."""
    try:
        moment = datetime.fromisoformat(iso)
    except ValueError:
        return None
    offset = moment.utcoffset()
    minutes = int(offset.total_seconds() // 60) if offset is not None else 0
    sign = "+" if minutes >= 0 else "-"
    minutes = abs(minutes)
    return f"{int(moment.timestamp())} {sign}{minutes // 60:02d}{minutes % 60:02d}"


@dataclass
class History:
    """Commit graph, commit metadata, and version tags reachable from a tip."""

    repo: Path
    tip: str
    parents: dict[str, tuple[str, ...]]
    dates: dict[str, str]
    order: dict[str, int]
    first_parent_chain: list[str]
    commits: dict[str, Commit] = field(default_factory=dict)
    merge_messages: dict[str, str] = field(default_factory=dict)
    tag_versions: dict[str, list[Version]] = field(default_factory=dict)
    all_tags: dict[str, str] = field(default_factory=dict)
    loaded_since: str | None = None
    details_loaded: bool = False

    @classmethod
    def load(cls, repo: Path, tip: str = "HEAD") -> History:
        """Load the commit graph and tags; commit details load lazily."""
        tip_sha = run_git(repo, "rev-parse", "--verify", f"{tip}^{{commit}}").strip()
        parents: dict[str, tuple[str, ...]] = {}
        dates: dict[str, str] = {}
        order: dict[str, int] = {}
        graph = run_git(
            repo,
            "log",
            "--topo-order",
            "--reverse",
            "--format=%H%x09%P%x09%cI",
            tip_sha,
        )
        for index, line in enumerate(graph.splitlines()):
            sha, parent_list, date = (line.split("\t") + ["", ""])[:3]
            parents[sha] = tuple(parent_list.split())
            dates[sha] = date
            order[sha] = index
        chain: list[str] = []
        cursor: str | None = tip_sha
        while cursor is not None:
            chain.append(cursor)
            cursor = parents[cursor][0] if parents.get(cursor) else None
        chain.reverse()
        history = cls(repo, tip_sha, parents, dates, order, chain)
        history._load_tags()
        return history

    def _load_tags(self) -> None:
        output = run_git(
            self.repo,
            "for-each-ref",
            "--format=%(refname:strip=2)%09%(objectname)%09%(*objectname)",
            "refs/tags",
        )
        for line in output.splitlines():
            name, obj, peeled = (line.split("\t") + ["", ""])[:3]
            target = peeled or obj
            self.all_tags[name] = target
            version = Version.parse_tag(name)
            if version is not None:
                self.tag_versions.setdefault(target, []).append(version)

    def load_commits(self, exclude: str | None = None) -> None:
        """Load commit details reachable from the tip but not from ``exclude``.

        Non-merge commits are classified; merge commits only contribute their
        message (the pull-request title) to the release they create.
        """
        args = [
            "log",
            "--no-renames",
            f"--format={_LOG_FORMAT}",
            "--numstat",
            "--summary",
            self.tip,
        ]
        if exclude:
            args.append(f"^{exclude}")
        commits = []
        for commit in parse_log(run_git(self.repo, *args)):
            if len(self.parents.get(commit.sha, ())) > 1:
                self.merge_messages[commit.sha] = f"{commit.subject}\n\n{commit.body}"
            else:
                commits.append(commit)
        touched = [
            c.sha for c in commits if any(f.path == "langgraph.json" for f in c.files)
        ]
        specs: list[str] = []
        for sha in touched:
            specs.append(f"{sha}:langgraph.json")
            if self.parents.get(sha):
                specs.append(f"{self.parents[sha][0]}:langgraph.json")
        blobs = read_blobs(self.repo, specs)
        for commit in commits:
            if commit.sha in touched:
                parent = (
                    self.parents[commit.sha][0]
                    if self.parents.get(commit.sha)
                    else None
                )
                before = (
                    _graph_keys(blobs.get(f"{parent}:langgraph.json"))
                    if parent
                    else set()
                )
                after = _graph_keys(blobs.get(f"{commit.sha}:langgraph.json"))
                if len(after) > len(before):
                    commit = replace(commit, new_graphs=tuple(sorted(after - before)))
            self.commits[commit.sha] = commit
        self.details_loaded = True

    def ancestors(self, sha: str, stop: set[str] | None = None) -> set[str]:
        """Commits reachable from ``sha`` (inclusive) that are not in ``stop``."""
        stop = stop or set()
        found: set[str] = set()
        pending = [sha]
        while pending:
            current = pending.pop()
            if current in found or current in stop or current not in self.parents:
                continue
            found.add(current)
            pending.extend(self.parents[current])
        return found

    def changes(self, shas: Iterable[str]) -> tuple[Change, ...]:
        """Classified non-merge commits among ``shas``, oldest first."""
        ordered = sorted(
            (sha for sha in shas if sha in self.commits), key=self.order.__getitem__
        )
        return tuple(
            Change(self.commits[sha], classify_commit(self.commits[sha]))
            for sha in ordered
        )

    def released_in(self) -> str | None:
        """Earliest version tag that already contains the tip (the release that shipped it)."""
        output = run_git(
            self.repo, "tag", "--list", f"{TAG_PREFIX}*", "--contains", self.tip
        )
        versions = [
            v for v in (Version.parse_tag(name) for name in output.split()) if v
        ]
        return min(versions).tag if versions else None

    def version_tags_on_chain(self) -> list[str]:
        """Version tag names on the first-parent chain, oldest release first."""
        by_commit: dict[str, list[Version]] = {}
        for name, target in self.all_tags.items():
            version = Version.parse_tag(name)
            if version is not None:
                by_commit.setdefault(target, []).append(version)
        return [
            version.tag
            for sha in self.first_parent_chain
            for version in sorted(by_commit.get(sha, []))
        ]

    def tag_message(self, tag: str) -> str:
        """Annotation message of ``tag`` (empty for lightweight tags)."""
        return run_git(
            self.repo, "for-each-ref", "--format=%(contents)", f"refs/tags/{tag}"
        )

    def tag_annotations(self) -> dict[str, tuple[str, str]]:
        """``tag -> (tagger date, annotation)`` for every version tag, in one git call."""
        output = run_git(
            self.repo,
            "for-each-ref",
            "--format=%(refname:strip=2)%1f%(taggerdate:iso-strict)%1f%(contents)%1e",
            f"refs/tags/{TAG_PREFIX}*",
        )
        annotations: dict[str, tuple[str, str]] = {}
        for record in output.split("\x1e"):
            if not record.strip():
                continue
            name, date, message = (record.lstrip("\n").split("\x1f") + ["", ""])[:3]
            annotations[name] = (date, message)
        return annotations

    def highest_version(self) -> Version | None:
        """Highest version tag in the repository, on any commit."""
        versions = [
            version for found in self.tag_versions.values() for version in found
        ]
        return max(versions) if versions else None

    def backfill_target(self, sha: str) -> str | None:
        """Target recorded by an interrupted backfill whose newest tag is on ``sha``."""
        versions = self.tag_versions.get(sha)
        if not versions:
            return None
        match = _BACKFILL_RE.search(self.tag_message(max(versions).tag))
        return match.group(1) if match is not None else None


MODES = ("auto", "backfill", "release", "single")


def release_boundaries(
    history: History, segment: Sequence[str], extra: Iterable[str] = ()
) -> list[str]:
    """Release end points in ``release`` mode.

    Every first-parent merge (one pull request) is its own release, every run
    of direct first-parent commits is one more, and ``extra`` commits (known
    push boundaries such as a push event's ``before`` SHA) also end a release,
    so a CI run covering several coalesced pushes still releases each of them.
    """
    extra_set = set(extra)
    boundaries: list[str] = []
    for index, sha in enumerate(segment):
        last = index == len(segment) - 1
        is_merge = len(history.parents.get(sha, ())) > 1
        next_is_merge = (
            not last and len(history.parents.get(segment[index + 1], ())) > 1
        )
        if is_merge or next_is_merge or last or sha in extra_set:
            boundaries.append(sha)
    return boundaries


def plan_releases(
    history: History, mode: str = "auto", boundaries: Iterable[str] = ()
) -> list[ReleasePlan]:
    """Plan the version tags needed to label ``history.tip``.

    Releases start after the newest version tag on the first-parent chain.

    * ``backfill`` - one release per first-parent commit; each tag records the
      backfill target so an interrupted backfill resumes as a backfill.
    * ``release`` - one release per first-parent merge, per run of direct
      commits, and per extra ``boundaries`` commit (normally exactly one
      release: the pushed commit).
    * ``single`` - one release at the tip covering everything (projections).
    * ``auto`` - ``backfill`` when the chain has no version tag or a recorded
      backfill is unfinished, otherwise ``release``.

    Commits that carry no releasable change roll forward into the next release.
    """
    if mode not in MODES:
        raise ValueError(f"unknown mode: {mode}")
    chain = history.first_parent_chain
    position = {sha: index for index, sha in enumerate(chain)}
    last_index = max(
        (index for index, sha in enumerate(chain) if sha in history.tag_versions),
        default=None,
    )
    if last_index is None:
        base: str | None = None
        current: Version | None = None
        seen: set[str] = set()
        start = 0
    else:
        base = chain[last_index]
        current = max(history.tag_versions[base])
        seen = history.ancestors(base)
        start = last_index + 1
    if start >= len(chain):
        return []
    segment = chain[start:]

    backfill_count = 0
    if mode == "backfill" or (mode == "auto" and base is None):
        backfill_count = len(segment)
    elif mode == "auto" and base is not None:
        target = history.backfill_target(base)
        if target is not None and position.get(target, -1) >= start:
            backfill_count = position[target] - start + 1
    target_sha = segment[backfill_count - 1] if backfill_count else None
    if mode == "single":
        tips = [segment[-1]]
    else:
        tips = segment[:backfill_count] + release_boundaries(
            history, segment[backfill_count:], boundaries
        )

    if not history.details_loaded:
        history.load_commits(exclude=base)
    plans: list[ReleasePlan] = []
    pending: list[Change] = []
    for tip in tips:
        unit = history.ancestors(tip, stop=seen)
        seen |= unit
        pending.extend(history.changes(unit))
        level, reason = summarize_release(
            pending, current, history.merge_messages.get(tip, "")
        )
        if level is Level.NONE:
            continue
        version = (current or Version()).bump(level)
        in_backfill = position[tip] < start + backfill_count
        plans.append(
            ReleasePlan(
                tip=tip,
                previous=current,
                version=version,
                level=level,
                reason=reason,
                changes=tuple(pending),
                committed_at=history.dates.get(tip, ""),
                backfill_target=target_sha if in_backfill else None,
            )
        )
        current = version
        pending = []
    for plan in plans:
        existing = history.all_tags.get(plan.tag)
        if existing is not None and existing != plan.tip:
            raise VersioningError(
                f"{plan.tag} already exists on {existing[:8]}; refusing to relabel "
                f"{plan.tip[:8]}. Is the tip behind a newer release?"
            )
    return plans


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

_SECTIONS = (
    ("breaking", "Breaking changes"),
    ("architecture", "Architecture changes"),
    ("large-feature", "Major features"),
    ("feature", "Features"),
    ("improvement", "Improvements"),
    ("fix", "Bug fixes"),
    ("refactor", "Refactoring"),
    ("tweak", "Small changes"),
    ("docs", "Documentation"),
    ("test", "Tests"),
    ("chore", "Maintenance"),
)


def _grouped(plan: ReleasePlan) -> list[tuple[str, list[Change]]]:
    groups: list[tuple[str, list[Change]]] = []
    for kind, title in _SECTIONS:
        items = [
            change for change in plan.changes if change.classification.kind == kind
        ]
        if items:
            groups.append((title, items))
    return groups


def render_tag_message(plan: ReleasePlan) -> str:
    """Plain-text annotated tag message listing the release's changes."""
    previous = plan.previous.tag if plan.previous else "none"
    lines = [
        f"{plan.tag} ({plan.level.label})",
        "",
        f"Bump: {plan.level.label} - {plan.reason}",
        f"Previous: {previous}",
        f"Changes: {len(plan.changes)} commit(s)",
    ]
    for title, items in _grouped(plan):
        lines.extend(["", f"{title}:"])
        lines.extend(
            f"- {item.commit.subject.strip()} ({item.commit.short})" for item in items
        )
    if plan.backfill_target:
        lines.extend(["", f"Backfill-Target: {plan.backfill_target}"])
    return "\n".join(lines) + "\n"


def render_markdown(plan: ReleasePlan, repo_url: str | None = None) -> str:
    """GitHub Release notes for one release."""
    previous = plan.previous.tag if plan.previous else "none"
    lines = [
        f"**Bump:** `{plan.level.label}` - {plan.reason}",
        "",
        f"**Previous:** `{previous}` | **Changes:** {len(plan.changes)} commit(s)",
    ]
    if repo_url and plan.previous:
        lines.extend(
            ["", f"[Full diff]({repo_url}/compare/{plan.previous.tag}...{plan.tag})"]
        )
    for title, items in _grouped(plan):
        lines.extend(["", f"### {title}", ""])
        for item in items:
            sha = item.commit.short
            reference = (
                f"[`{sha}`]({repo_url}/commit/{item.commit.sha})"
                if repo_url
                else f"`{sha}`"
            )
            lines.append(f"- {item.commit.subject.strip()} ({reference})")
    return "\n".join(lines) + "\n"


_SECTION_TITLES = frozenset(title for _, title in _SECTIONS)
_NOTE_ITEM_RE = re.compile(r"^(?P<subject>.*) \((?P<sha>[0-9a-f]{7,40})\)$")


@dataclass(frozen=True)
class TagNotes:
    """Content of a version tag annotation written by ``create_tags``."""

    level: str
    reason: str
    previous: str
    commits: int
    sections: tuple[tuple[str, tuple[str, ...]], ...]


def parse_tag_annotation(message: str) -> TagNotes | None:
    """Parse an annotation from ``render_tag_message``; ``None`` for other formats."""
    bump = previous = changes = ""
    sections: list[tuple[str, list[str]]] = []
    for line in message.splitlines():
        text = line.strip()
        if text.startswith("Bump: ") and not sections:
            bump = text.removeprefix("Bump: ")
        elif text.startswith("Previous: ") and not sections:
            previous = text.removeprefix("Previous: ")
        elif text.startswith("Changes: ") and not sections:
            changes = text.removeprefix("Changes: ")
        elif text.endswith(":") and text[:-1] in _SECTION_TITLES:
            sections.append((text[:-1], []))
        elif text.startswith("- ") and sections:
            sections[-1][1].append(text[2:])
    if not bump:
        return None
    level, _, reason = bump.partition(" - ")
    count = re.match(r"\d+", changes)
    return TagNotes(
        level=level,
        reason=reason,
        previous=previous,
        commits=int(count.group(0)) if count else 0,
        sections=tuple((title, tuple(items)) for title, items in sections),
    )


def render_tag_notes(
    tag: str,
    message: str,
    released_at: str = "",
    repo_url: str | None = None,
    included: Sequence[tuple[str, str]] = (),
) -> str:
    """GitHub Release notes rebuilt from a version tag's annotation.

    The annotation written by ``create_tags`` is the durable record of a
    release, so publishing (first runs, retries, and backfills alike) renders
    its notes from the tag rather than re-classifying history. ``included``
    holds ``(tag, annotation)`` of earlier versions without a GitHub
    Release of their own; their changes are folded into these notes, which
    then cover everything since the previous published release. Annotations
    in any other format are published verbatim.
    """
    notes = parse_tag_annotation(message)
    if notes is None:
        return (message.strip() or f"Release {tag}") + "\n"
    rolled = [
        (name, parsed)
        for name, parsed in (
            (name, parse_tag_annotation(text)) for name, text in included
        )
        if parsed is not None
    ]
    previous = rolled[0][1].previous if rolled else notes.previous
    commits = notes.commits + sum(parsed.commits for _, parsed in rolled)
    has_previous = bool(previous) and previous != "none"
    meta = [f"**Released:** {released_at[:10]}"] if released_at else []
    meta.append(f"**Previous:** `{previous}`" if has_previous else "**Previous:** none")
    meta.append(f"**Changes:** {commits} commit(s)")
    lines = [f"**Bump:** `{notes.level}` - {notes.reason}", "", " | ".join(meta)]
    if rolled:
        names = ", ".join(f"`{name}`" for name, _ in rolled)
        lines.extend(["", f"**Includes tagged versions:** {names}"])
    if repo_url and has_previous:
        lines.extend(["", f"[Full diff]({repo_url}/compare/{previous}...{tag})"])
    for _, title in _SECTIONS:
        items = [
            item
            for parsed in [*(parsed for _, parsed in rolled), notes]
            for section, entries in parsed.sections
            if section == title
            for item in entries
        ]
        if not items:
            continue
        lines.extend(["", f"### {title}", ""])
        for item in items:
            match = _NOTE_ITEM_RE.match(item)
            if match is None:
                lines.append(f"- {item}")
                continue
            sha = match.group("sha")
            reference = (
                f"[`{sha}`]({repo_url}/commit/{sha})" if repo_url else f"`{sha}`"
            )
            lines.append(f"- {match.group('subject')} ({reference})")
    return "\n".join(lines) + "\n"


def plan_to_dict(plan: ReleasePlan, verbose: bool = False) -> dict:
    """JSON-serialisable view of a release plan."""
    data: dict = {
        "tag": plan.tag,
        "version": str(plan.version),
        "previous": str(plan.previous) if plan.previous else None,
        "level": plan.level.label,
        "reason": plan.reason,
        "tip": plan.tip,
        "commits": len(plan.changes),
    }
    if verbose:
        data["changes"] = [
            {
                "sha": change.commit.sha,
                "subject": change.commit.subject,
                "kind": change.classification.kind,
                "level": change.classification.level.label,
                "reason": change.classification.reason,
            }
            for change in plan.changes
        ]
    return data


# --------------------------------------------------------------------------- #
# Tag creation and publishing
# --------------------------------------------------------------------------- #


def create_tags(history: History, plans: Sequence[ReleasePlan]) -> list[str]:
    """Create annotated tags dated at their release commit; return new tag names.

    Tags are written through one ``git fast-import`` stream so labelling a long
    history costs a single process. The tagger is the configured git committer.
    """
    pending = [plan for plan in plans if history.all_tags.get(plan.tag) != plan.tip]
    if not pending:
        return []
    ident = run_git(history.repo, "var", "GIT_COMMITTER_IDENT").strip()
    who, now = ident.rsplit(" ", 2)[0], " ".join(ident.rsplit(" ", 2)[1:])
    stream = bytearray()
    for plan in pending:
        message = render_tag_message(plan).encode("utf-8")
        when = _git_timestamp(plan.committed_at) or now
        stream += (
            f"tag {plan.tag}\nfrom {plan.tip}\ntagger {who} {when}\ndata {len(message)}\n"
        ).encode("utf-8")
        stream += message + b"\n"
    stream += b"done\n"
    run_git_bytes(
        history.repo,
        "fast-import",
        "--quiet",
        "--date-format=raw",
        "--done",
        stdin=bytes(stream),
    )
    for plan in pending:
        history.all_tags[plan.tag] = plan.tip
        history.tag_versions.setdefault(plan.tip, []).append(plan.version)
    return [plan.tag for plan in pending]


def remote_tag_targets(repo: Path, remote: str) -> dict[str, str]:
    """Tags on ``remote`` mapped to the commit they point at (annotated tags peeled)."""
    output = run_git(repo, "ls-remote", "--tags", remote)
    prefix = "refs/tags/"
    targets: dict[str, str] = {}
    peeled: dict[str, str] = {}
    for line in output.splitlines():
        sha, _, ref = line.partition("\t")
        if not ref.startswith(prefix):
            continue
        name = ref[len(prefix) :]
        if name.endswith("^{}"):
            peeled[name[:-3]] = sha
        else:
            targets[name] = sha
    return {name: peeled.get(name, sha) for name, sha in targets.items()}


def push_tags(
    repo: Path,
    remote: str,
    tags: Sequence[str],
    local_targets: dict[str, str],
    batch_size: int = PUSH_BATCH_SIZE,
) -> list[str]:
    """Push ``tags`` missing on ``remote`` in order; return the pushed names.

    Each batch is atomic and batches stop at the first failure, so the remote
    always holds an oldest-first prefix of the releases and a re-run resumes.
    A same-named remote tag on a different commit is an error, never skipped.
    """
    existing = remote_tag_targets(repo, remote)
    conflicts = [
        f"{tag} (remote {existing[tag][:8]}, local {local_targets.get(tag, '?')[:8]})"
        for tag in tags
        if tag in existing and existing[tag] != local_targets.get(tag)
    ]
    if conflicts:
        raise VersioningError(
            "remote tags point at different commits: " + ", ".join(conflicts)
        )
    missing = [tag for tag in tags if tag not in existing]
    for start in range(0, len(missing), max(1, batch_size)):
        batch = missing[start : start + max(1, batch_size)]
        run_git(
            repo,
            "push",
            "--atomic",
            "--quiet",
            remote,
            *(f"refs/tags/{tag}:refs/tags/{tag}" for tag in batch),
        )
    return missing


# --------------------------------------------------------------------------- #
# GitHub Releases
# --------------------------------------------------------------------------- #


RELEASE_LEVELS = ("major", "minor", "patch")
# Every version gets a tag; normal publication starts at a.b versions (X.Y.0).
DEFAULT_RELEASE_LEVEL = "minor"


@dataclass(frozen=True)
class ReleasePolicy:
    """Publication levels before and after the historical release cutoff."""

    level: str = DEFAULT_RELEASE_LEVEL
    historical_before: Version | None = None
    historical_level: str = "major"


def load_release_policy(repo: Path) -> ReleasePolicy:
    """Read the repository policy, using normal major/minor releases if absent."""
    path = repo / ".github" / "release-policy.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ReleasePolicy()
    except (OSError, ValueError) as error:
        raise VersioningError(f"cannot read {path}: {error}") from error
    if not isinstance(data, dict) or set(data) - {
        "level",
        "historical_before",
        "historical_level",
    }:
        raise VersioningError(f"invalid release policy in {path}")
    level = data.get("level", DEFAULT_RELEASE_LEVEL)
    historical_level = data.get("historical_level", "major")
    if level not in RELEASE_LEVELS or historical_level not in RELEASE_LEVELS:
        raise VersioningError(f"invalid publication level in {path}")
    cutoff = data.get("historical_before")
    parsed = Version.parse_tag(cutoff) if isinstance(cutoff, str) else None
    if cutoff is not None and parsed is None:
        raise VersioningError(
            f"historical_before must be a vMAJOR.MINOR.PATCH tag in {path}"
        )
    return ReleasePolicy(level, parsed, historical_level)


def is_release_version(version: Version, level: str = DEFAULT_RELEASE_LEVEL) -> bool:
    """Whether ``version`` gets a GitHub Release at the given release ``level``.

    ``minor`` publishes ``X.Y.0`` versions, ``major`` only ``X.0.0``, and
    ``patch`` every version.
    """
    if level == "patch":
        return True
    if level == "minor":
        return version.patch == 0
    if level == "major":
        return version.minor == 0 and version.patch == 0
    raise ValueError(f"unknown release level: {level}")


@dataclass(frozen=True)
class ReleaseRequest:
    """One GitHub Release change for a pushed version tag.

    ``kind`` is ``create`` (the default), ``update`` (refresh the notes of
    ``release_id``), or ``delete`` (remove ``release_id``; the tag stays).
    """

    tag: str
    body: str = ""
    latest: bool = False
    kind: str = "create"
    release_id: int | None = None


@dataclass(frozen=True)
class ExistingRelease:
    """A GitHub Release that already exists for a tag."""

    release_id: int
    body: str = ""


def _same_notes(left: str, right: str) -> bool:
    return left.replace("\r\n", "\n").strip() == right.replace("\r\n", "\n").strip()


def release_requests(
    history: History,
    remote_targets: dict[str, str],
    existing: dict[str, ExistingRelease],
    repo_url: str | None = None,
    *,
    level: str = DEFAULT_RELEASE_LEVEL,
    sync: bool = False,
    historical_before: Version | None = None,
    historical_level: str = "major",
) -> tuple[list[ReleaseRequest], list[str]]:
    """GitHub Release changes for the chain's version tags, plus skipped tags.

    Every eligible tag gets a release whose notes also cover the omitted
    versions since the previous published release. Missing releases are
    created, oldest first; with ``sync`` the notes of existing releases are
    refreshed and releases of versions below ``level`` are deleted (their tags
    stay). A tag is skipped unless the remote holds it on the same commit:
    GitHub would otherwise create a new tag at the default branch head. Only
    the highest published version is marked as the repository's latest.
    Before ``historical_before``, ``historical_level`` selects sparse historical
    milestones; skipped minor and patch versions roll into the next release.
    """

    def eligible(version: Version) -> bool:
        selected = (
            historical_level
            if historical_before is not None and version < historical_before
            else level
        )
        return is_release_version(version, selected)

    annotations = history.tag_annotations()
    published = [
        version
        for versions in history.tag_versions.values()
        for version in versions
        if eligible(version)
    ]
    newest = max(published) if published else None
    deletes: list[ReleaseRequest] = []
    updates: list[ReleaseRequest] = []
    creates: list[ReleaseRequest] = []
    skipped: list[str] = []
    rolled: list[tuple[str, str]] = []
    for tag in history.version_tags_on_chain():
        version = Version.parse_tag(tag)
        released_at, message = annotations.get(tag, ("", ""))
        if version is None or not eligible(version):
            rolled.append((tag, message))
            if sync and tag in existing:
                deletes.append(
                    ReleaseRequest(
                        tag, kind="delete", release_id=existing[tag].release_id
                    )
                )
            continue
        included, rolled = rolled, []
        body = render_tag_notes(tag, message, released_at, repo_url, included)
        latest = newest is not None and newest.tag == tag
        if tag in existing:
            if sync and not _same_notes(existing[tag].body, body):
                updates.append(
                    ReleaseRequest(
                        tag, body, latest, "update", existing[tag].release_id
                    )
                )
            continue
        if remote_targets.get(tag) != history.all_tags.get(tag):
            skipped.append(tag)
            continue
        creates.append(ReleaseRequest(tag, body, latest))
    return deletes + updates + creates, skipped


_DONE_VERBS = {"create": "published", "update": "updated", "delete": "deleted"}


def publish_releases(
    requests: Sequence[ReleaseRequest],
    execute: Callable[[ReleaseRequest], None],
    *,
    interval: float,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    backoff: Sequence[float] = RATE_LIMIT_BACKOFF,
    log: Callable[[str], None] = print,
) -> list[str]:
    """Apply release changes in order, starting one at most every ``interval`` seconds.

    Rate-limit rejections are retried after each ``backoff`` delay; once those
    are exhausted the error propagates and a re-run resumes where this stopped.
    """
    done: list[str] = []
    next_start = clock()
    for index, request in enumerate(requests, start=1):
        for attempt in range(len(backoff) + 1):
            delay = next_start - clock()
            if delay > 0:
                sleep(delay)
            next_start = clock() + interval
            try:
                execute(request)
                break
            except RateLimited:
                if attempt == len(backoff):
                    raise
                log(f"rate limited at {request.tag}; retrying in {backoff[attempt]:g}s")
                sleep(backoff[attempt])
        done.append(request.tag)
        verb = _DONE_VERBS.get(request.kind, request.kind)
        log(f"{verb} {request.tag} ({index}/{len(requests)})")
    return done


def _gh(repo: Path, *args: str, stdin: bytes | None = None) -> str:
    """Run the GitHub CLI and return stdout; rate limits raise ``RateLimited``."""
    try:
        result = subprocess.run(
            ["gh", *args], cwd=repo, input=stdin, capture_output=True, check=False
        )
    except FileNotFoundError as error:
        raise VersioningError("the GitHub CLI (gh) is required to publish") from error
    if result.returncode == 0:
        return result.stdout.decode("utf-8", errors="replace")
    detail = (result.stderr + result.stdout).decode("utf-8", errors="replace").strip()
    if re.search(r"rate limit|HTTP 429", detail, re.IGNORECASE):
        raise RateLimited(detail)
    raise VersioningError(f"gh {' '.join(args[:3])} failed: {detail}")


def github_releases(repo: Path, slug: str) -> dict[str, ExistingRelease]:
    """Existing GitHub Releases (drafts included) by tag name."""
    output = _gh(
        repo,
        "api",
        "--paginate",
        f"repos/{slug}/releases?per_page=100",
        "--jq",
        ".[] | {id, tag_name, body} | @json",
    )
    releases: dict[str, ExistingRelease] = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        releases[item["tag_name"]] = ExistingRelease(item["id"], item.get("body") or "")
    return releases


def github_apply_release(repo: Path, slug: str, request: ReleaseRequest) -> None:
    """Create, update, or delete one GitHub Release; already-done changes pass."""
    latest = "true" if request.latest else "false"
    try:
        if request.kind == "delete":
            _gh(
                repo,
                "api",
                "--method",
                "DELETE",
                f"repos/{slug}/releases/{request.release_id}",
            )
        elif request.kind == "update":
            payload = {"body": request.body, "make_latest": latest}
            _gh(
                repo,
                "api",
                "--method",
                "PATCH",
                f"repos/{slug}/releases/{request.release_id}",
                "--input",
                "-",
                stdin=json.dumps(payload).encode("utf-8"),
            )
        else:
            payload = {
                "tag_name": request.tag,
                "name": request.tag,
                "body": request.body,
                "make_latest": latest,
            }
            _gh(
                repo,
                "api",
                "--method",
                "POST",
                f"repos/{slug}/releases",
                "--input",
                "-",
                stdin=json.dumps(payload).encode("utf-8"),
            )
    except RateLimited:
        raise
    except VersioningError as error:
        done = "already_exists" if request.kind == "create" else "HTTP 404"
        if done not in str(error) or request.kind == "update":
            raise


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def _remote_slug(repo: Path, remote: str = "origin") -> tuple[str, str] | None:
    """``(host, owner/name)`` parsed from ``remote``'s URL, if it is a hosted repo."""
    try:
        url = run_git(repo, "remote", "get-url", remote).strip()
    except VersioningError:
        return None
    match = re.match(
        r"^(?:https://(?:[^@/]+@)?|git@)([^/:]+)[/:](.+?)(?:\.git)?/?$", url
    )
    return (match.group(1), match.group(2)) if match else None


def _repo_url(repo: Path, remote: str = "origin") -> str | None:
    if os.environ.get("GITHUB_SERVER_URL") and os.environ.get("GITHUB_REPOSITORY"):
        return f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}"
    slug = _remote_slug(repo, remote)
    return f"https://{slug[0]}/{slug[1]}" if slug else None


def _write_outputs(path: str | None, values: dict[str, str]) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def _print_plans(
    plans: Sequence[ReleasePlan], output_format: str, verbose: bool
) -> None:
    if output_format == "json":
        print(json.dumps([plan_to_dict(plan, verbose) for plan in plans], indent=2))
        return
    if output_format == "markdown":
        for plan in plans:
            print(f"## {plan.tag}\n\n{render_markdown(plan)}")
        return
    for plan in plans:
        print(f"{plan.tag:<12} {plan.level.label:<6} {plan.tip[:8]}  {plan.reason}")
        if verbose:
            for change in plan.changes:
                classification = change.classification
                print(
                    f"    {classification.level.label:<6} {classification.kind:<13} "
                    f"{change.commit.short}  {change.commit.subject.strip()[:90]}"
                )


def _load_unreleased(args: argparse.Namespace) -> tuple[History, str | None]:
    history = History.load(args.repo, args.tip)
    return history, history.released_in()


def _cmd_plan(args: argparse.Namespace) -> int:
    history, released = _load_unreleased(args)
    if released:
        print(f"{args.tip} is already released in {released}; nothing to do.")
        return 0
    plans = plan_releases(history, args.mode, _boundaries(args))
    if not plans:
        print("No releasable changes.")
        return 0
    _print_plans(plans, args.format, args.verbose)
    return 0


def _cmd_tag(args: argparse.Namespace) -> int:
    history, released = _load_unreleased(args)
    plans = [] if released else plan_releases(history, args.mode, _boundaries(args))
    created = create_tags(history, plans)
    _print_plans(
        [plan for plan in plans if plan.tag in set(created)], "text", verbose=False
    )
    pushed: list[str] = []
    if args.push:
        # Also pushes tags left local by an interrupted earlier run.
        pushed = push_tags(
            args.repo,
            args.remote,
            history.version_tags_on_chain(),
            history.all_tags,
            args.batch_size,
        )

    latest_tag, level, notes = "", "", ""
    if plans:
        latest = plans[-1]
        latest_tag, level = latest.tag, latest.level.label
        notes = render_markdown(latest, _repo_url(args.repo))
    elif history.tip in history.tag_versions:
        # Re-run after the tip was tagged: re-emit it so publishing can resume.
        latest_tag = max(history.tag_versions[history.tip]).tag
        released_at, message = history.tag_annotations().get(latest_tag, ("", ""))
        notes = render_tag_notes(latest_tag, message, released_at, _repo_url(args.repo))
        level = message.split("(", 1)[-1].split(")", 1)[0] if "(" in message else ""
    if latest_tag and args.notes_file:
        Path(args.notes_file).write_text(notes, encoding="utf-8")
    highest = history.highest_version()
    is_latest = bool(latest_tag) and highest is not None and highest.tag == latest_tag
    _write_outputs(
        args.github_output,
        {
            "created": str(len(created)),
            "latest_tag": latest_tag,
            "latest_version": latest_tag.removeprefix(TAG_PREFIX),
            "level": level,
            "is_latest": "true" if is_latest else "false",
        },
    )
    if released and not plans:
        print(f"{args.tip} is already released in {released}.")
    print(
        f"Created {len(created)} tag(s), pushed {len(pushed)}"
        + (f"; latest {latest_tag} ({level})" if latest_tag else "")
    )
    return 0


def _resolve(repo: Path, revision: str) -> str | None:
    """Full SHA of ``revision``, or ``None`` when it does not name a commit."""
    if not revision or set(revision) == {"0"}:
        return None
    try:
        return run_git(repo, "rev-parse", "--verify", f"{revision}^{{commit}}").strip()
    except VersioningError:
        return None


def _boundaries(args: argparse.Namespace) -> list[str]:
    """Resolved ``--boundary`` commits; unknown or all-zero SHAs are ignored."""
    resolved = (_resolve(args.repo, item) for item in args.boundary or [])
    return [sha for sha in resolved if sha]


def _cmd_publish(args: argparse.Namespace) -> int:
    history = History.load(args.repo, args.tip)
    remote_slug = _remote_slug(args.repo, args.remote)
    slug = (
        args.github_repo
        or os.environ.get("GITHUB_REPOSITORY")
        or (remote_slug[1] if remote_slug else None)
    )
    if not slug:
        raise VersioningError(
            "cannot determine the GitHub repository; pass --github-repo"
        )
    existing = github_releases(args.repo, slug)
    policy = load_release_policy(args.repo)
    requests, skipped = release_requests(
        history,
        remote_tag_targets(args.repo, args.remote),
        existing,
        _repo_url(args.repo, args.remote),
        level=args.level or policy.level,
        sync=args.sync,
        historical_before=policy.historical_before,
        historical_level=policy.historical_level,
    )
    for tag in skipped:
        print(f"skip {tag}: not on {args.remote} at the same commit", file=sys.stderr)
    interval = args.interval
    if interval is None:
        interval = (
            RELEASE_BULK_INTERVAL if len(requests) > RELEASE_BULK_THRESHOLD else 0.0
        )
    counts = {
        kind: sum(request.kind == kind for request in requests)
        for kind in ("create", "update", "delete")
    }
    summary = (
        f"{counts['create']} to publish, {counts['update']} to update, "
        f"{counts['delete']} to delete; {len(existing)} release(s) exist"
    )
    if args.dry_run:
        for request in requests:
            print(
                f"would {request.kind} {request.tag}"
                + (" (latest)" if request.latest and request.kind != "delete" else "")
            )
        print(summary + ".")
        return 0
    if requests:
        print(f"{summary}; one change every {interval:g}s at most.")
    done = publish_releases(
        requests,
        lambda request: github_apply_release(args.repo, slug, request),
        interval=interval,
    )
    print(f"Applied {len(done)} release change(s).")
    return 0


def _cmd_current(args: argparse.Namespace) -> int:
    history, released = _load_unreleased(args)
    chain_versions = [
        max(history.tag_versions[sha])
        for sha in history.first_parent_chain
        if sha in history.tag_versions
    ]
    current = chain_versions[-1] if chain_versions else None
    plans = [] if released else plan_releases(history, "single")
    latest = plans[-1] if plans else None
    payload = {
        "current": str(current) if current else None,
        "released_in": released,
        "next": str(latest.version) if latest else None,
        "level": latest.level.label if latest else "none",
        "reason": latest.reason if latest else "no unreleased changes",
        "unreleased_commits": len(latest.changes) if latest else 0,
    }
    if args.format == "json":
        print(json.dumps(payload, indent=2))
        return 0
    print(f"current: {payload['current'] or 'unreleased'}")
    if released:
        print(f"tip is released in {released}")
    elif latest:
        print(
            f"next:    {latest.version} ({latest.level.label}, {len(latest.changes)} commit(s))"
        )
        print(f"reason:  {latest.reason}")
    else:
        print("next:    no releasable changes")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Command-line interface: ``plan``, ``tag``, ``current`` and ``publish``."""
    parser = argparse.ArgumentParser(
        description="Automated a.b.c version labelling of release history.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python scripts/versioning.py current\n"
            "  python scripts/versioning.py plan --tip origin/main --mode backfill -v\n"
            "  python scripts/versioning.py tag --tip origin/main --push\n"
            "  python scripts/versioning.py publish --tip origin/main --dry-run\n"
        ),
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="repository path")
    commands = parser.add_subparsers(dest="command", required=True)

    def add_common(sub: argparse.ArgumentParser) -> None:
        sub.add_argument(
            "--tip", default="HEAD", help="commit to release (default HEAD)"
        )
        sub.add_argument(
            "--mode",
            choices=MODES,
            default="auto",
            help=(
                "auto: backfill when untagged or a backfill is unfinished, else release; "
                "backfill: one release per first-parent commit; release: one per merge "
                "or run of direct commits; single: one release at the tip"
            ),
        )
        sub.add_argument(
            "--boundary",
            action="append",
            metavar="SHA",
            help=(
                "extra release boundary in release mode, e.g. a push event's "
                "'before' SHA (repeatable; unknown or all-zero SHAs are ignored)"
            ),
        )

    plan = commands.add_parser(
        "plan", help="show the versions that would be created (dry run)"
    )
    add_common(plan)
    plan.add_argument("--format", choices=["text", "json", "markdown"], default="text")
    plan.add_argument(
        "--verbose", "-v", action="store_true", help="list classified commits"
    )
    plan.set_defaults(handler=_cmd_plan)

    tag = commands.add_parser("tag", help="create (and optionally push) version tags")
    add_common(tag)
    tag.add_argument(
        "--push", action="store_true", help="push missing version tags of the chain"
    )
    tag.add_argument(
        "--remote", default="origin", help="remote to push to (default origin)"
    )
    tag.add_argument(
        "--batch-size",
        type=int,
        default=PUSH_BATCH_SIZE,
        help=f"tags per atomic push (default {PUSH_BATCH_SIZE}; lower it for push-policy limits)",
    )
    tag.add_argument(
        "--notes-file", help="write Markdown notes of the newest release here"
    )
    tag.add_argument("--github-output", help="append step outputs (GitHub Actions)")
    tag.set_defaults(handler=_cmd_tag)

    current = commands.add_parser("current", help="show the released and next version")
    current.add_argument(
        "--tip", default="HEAD", help="commit to inspect (default HEAD)"
    )
    current.add_argument("--format", choices=["text", "json"], default="text")
    current.set_defaults(handler=_cmd_current)

    publish = commands.add_parser(
        "publish",
        help="create missing GitHub Releases for the pushed a.b (X.Y.0) tags (needs gh)",
    )
    publish.add_argument(
        "--tip", default="HEAD", help="publish tags on this commit's history"
    )
    publish.add_argument(
        "--remote", default="origin", help="remote holding the tags (default origin)"
    )
    publish.add_argument(
        "--github-repo",
        metavar="OWNER/NAME",
        help="GitHub repository (default $GITHUB_REPOSITORY or the remote URL)",
    )
    publish.add_argument(
        "--interval",
        type=float,
        help=(
            "minimum seconds between release changes (default "
            f"{RELEASE_BULK_INTERVAL:g} above {RELEASE_BULK_THRESHOLD} changes, else 0)"
        ),
    )
    publish.add_argument(
        "--level",
        choices=RELEASE_LEVELS,
        help=(
            "lowest version level that gets a GitHub Release (default from "
            ".github/release-policy.json, otherwise minor: X.Y.0; "
            "patch versions are only tagged and roll into the next release's notes)"
        ),
    )
    publish.add_argument(
        "--sync",
        action="store_true",
        help=(
            "also refresh the notes of existing releases and delete releases of "
            "versions below --level (their tags stay)"
        ),
    )
    publish.add_argument(
        "--dry-run", action="store_true", help="only list the release changes"
    )
    publish.set_defaults(handler=_cmd_publish)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point; returns a process exit code."""
    for stream in (sys.stdout, sys.stderr):
        # Commit subjects may hold characters a legacy console codepage cannot encode.
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(errors="backslashreplace")
    args = build_parser().parse_args(argv)
    try:
        return args.handler(args)
    except VersioningError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
