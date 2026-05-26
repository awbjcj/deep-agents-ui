# URL Override & Per-User Connectivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to override LLM base URLs via database (with env fallback), and allow users to select their own run mode and proxy URL stored per-user.

**Architecture:** New `system_settings` key-value table stores admin URL overrides. Two columns added to `users` table for per-user connectivity. Resolution chain: user DB > admin DB > env > hardcoded default. New endpoints exposed, frontend sections added to AdminPanel and UserManagementSidebar.

**Tech Stack:** Python (FastAPI, SQLAlchemy, Pydantic) for backend; TypeScript (React, Next.js) for frontend. SQLite database. Existing component library (shadcn/ui + Aptiv brand atoms).

---

## File Structure

### Backend (C:\Users\tpoj6d\wkspaces\vsda-deep-agent)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/backends/models.py` | Modify | Add `SystemSetting` model, add `user_run_mode` + `user_proxy_url` to `User` |
| `src/backends/database.py` | Modify | Add migration for new table + columns |
| `src/backends/connectivity_store.py` | Create | Async DB layer for system_settings reads/writes |
| `src/backends/connectivity.py` | Modify | Add `resolve_user_connectivity()` with DB-first lookup |
| `src/backends/schemas.py` | Modify | Add Pydantic request/response models for connectivity endpoints |
| `src/backends/main.py` | Modify | Add 4 new endpoints (admin + user connectivity) |
| `tests/unit_tests/test_connectivity_store.py` | Create | Unit tests for connectivity_store |
| `tests/integration_tests/test_backend_api.py` | Modify | Integration tests for new endpoints |

### Frontend (C:\Users\tpoj6d\wkspaces\deep-agents-ui)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/auth.ts` | Modify | Add API client functions for connectivity endpoints |
| `src/app/components/AdminPanel.tsx` | Modify | Rename tab, add URL override form to RunModeSection |
| `src/app/components/UserManagementSidebar.tsx` | Modify | Add Connectivity section |

---

## Task 1: Backend — SystemSetting model and User columns

**Files:**
- Modify: `src/backends/models.py`
- Modify: `src/backends/database.py`

- [ ] **Step 1: Add SystemSetting model to models.py**

Add after the `TierImageSetting` class at the bottom of `src/backends/models.py`:

```python
class SystemSetting(Base):
    """Key-value store for admin-managed system configuration."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 2: Add user_run_mode and user_proxy_url to User model**

Add to the `User` class in `src/backends/models.py`, after the `image_fetching_enabled` column:

```python
    user_run_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    user_proxy_url: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 3: Add migration logic to database.py**

In `src/backends/database.py` `run_migrations()`, add after the `tier_image_settings` block:

```python
    from src.backends.models import SystemSetting

    if not insp.has_table("system_settings"):
        cast(Table, SystemSetting.__table__).create(bind=engine, checkfirst=True)
        token_db_logger.info("Migration: created table system_settings")

    # Seed connectivity keys with empty values (meaning "use .env fallback")
    with engine.begin() as conn:
        for key in (
            "run_mode",
            "openai_base_url",
            "openai_base_url_gateway",
            "openai_base_url_proxy",
            "claude_base_url",
            "claude_base_url_gateway",
            "claude_base_url_proxy",
        ):
            conn.execute(
                text(
                    "INSERT OR IGNORE INTO system_settings (key, value) VALUES (:key, '')"
                ),
                {"key": key},
            )
```

Also add `user_run_mode` and `user_proxy_url` to the `new_columns` dict for the users table migration:

```python
        "user_run_mode": "VARCHAR",
        "user_proxy_url": "VARCHAR",
```

- [ ] **Step 4: Verify migration runs**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -c "from src.backends.database import run_migrations; run_migrations(); print('OK')"`

Expected: `OK` with no errors. Tables created in the database.

- [ ] **Step 5: Commit**

```bash
git add src/backends/models.py src/backends/database.py
git commit -m "feat: add SystemSetting model and user connectivity columns"
```

---

## Task 2: Backend — Connectivity Store

**Files:**
- Create: `src/backends/connectivity_store.py`
- Create: `tests/unit_tests/test_connectivity_store.py`

- [ ] **Step 1: Write the test file**

Create `tests/unit_tests/test_connectivity_store.py`:

```python
"""Tests for the connectivity settings store."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from src.backends.connectivity_store import (
    get_system_setting,
    set_system_setting,
    get_all_connectivity_settings,
    CONNECTIVITY_KEYS,
)


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_get_system_setting_returns_value(mock_db):
    """get_system_setting returns the value when the key exists and is non-empty."""
    row = MagicMock()
    row.value = "https://gateway.example/v1"
    result = MagicMock()
    result.scalar_one_or_none.return_value = row
    mock_db.execute.return_value = result

    value = await get_system_setting(mock_db, "openai_base_url_gateway")
    assert value == "https://gateway.example/v1"


@pytest.mark.asyncio
async def test_get_system_setting_returns_none_for_empty(mock_db):
    """get_system_setting returns None when the value is empty string."""
    row = MagicMock()
    row.value = ""
    result = MagicMock()
    result.scalar_one_or_none.return_value = row
    mock_db.execute.return_value = result

    value = await get_system_setting(mock_db, "openai_base_url_gateway")
    assert value is None


@pytest.mark.asyncio
async def test_get_system_setting_returns_none_for_missing_key(mock_db):
    """get_system_setting returns None when key does not exist."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = result

    value = await get_system_setting(mock_db, "nonexistent")
    assert value is None


@pytest.mark.asyncio
async def test_connectivity_keys_contains_all_expected():
    """CONNECTIVITY_KEYS has the 7 expected keys."""
    assert len(CONNECTIVITY_KEYS) == 7
    assert "run_mode" in CONNECTIVITY_KEYS
    assert "openai_base_url" in CONNECTIVITY_KEYS
    assert "claude_base_url_proxy" in CONNECTIVITY_KEYS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -m pytest tests/unit_tests/test_connectivity_store.py -v`

Expected: ImportError — module does not exist yet.

- [ ] **Step 3: Implement connectivity_store.py**

Create `src/backends/connectivity_store.py`:

```python
"""Async database layer for system connectivity settings.

Provides read/write access to the system_settings table for URL overrides
and global run mode. Empty values mean "not overridden, fall back to env".
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import NamedTuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.backends.models import SystemSetting

CONNECTIVITY_KEYS: tuple[str, ...] = (
    "run_mode",
    "openai_base_url",
    "openai_base_url_gateway",
    "openai_base_url_proxy",
    "claude_base_url",
    "claude_base_url_gateway",
    "claude_base_url_proxy",
)


class SettingRow(NamedTuple):
    """A system setting value with metadata."""

    value: str
    updated_at: datetime | None
    updated_by: str | None


async def get_system_setting(db: AsyncSession, key: str) -> str | None:
    """Get a single system setting value. Returns None if empty or missing."""
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    row = result.scalar_one_or_none()
    if row is None or not row.value:
        return None
    return row.value


async def set_system_setting(
    db: AsyncSession, key: str, value: str, updated_by: str
) -> None:
    """Set a system setting value. Empty string clears the override."""
    now = datetime.now(timezone.utc)
    await db.execute(
        update(SystemSetting)
        .where(SystemSetting.key == key)
        .values(value=value, updated_at=now, updated_by=updated_by)
    )
    await db.commit()


async def get_all_connectivity_settings(
    db: AsyncSession,
) -> dict[str, SettingRow]:
    """Get all connectivity-related settings as a dict keyed by setting name."""
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key.in_(CONNECTIVITY_KEYS))
    )
    rows = result.scalars().all()
    return {
        row.key: SettingRow(
            value=row.value,
            updated_at=row.updated_at,
            updated_by=row.updated_by,
        )
        for row in rows
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -m pytest tests/unit_tests/test_connectivity_store.py -v`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/connectivity_store.py tests/unit_tests/test_connectivity_store.py
git commit -m "feat: add connectivity_store for system_settings DB access"
```

---

## Task 3: Backend — Connectivity Resolution with DB lookup

**Files:**
- Modify: `src/backends/connectivity.py`
- Modify: `tests/unit_tests/test_models.py`

- [ ] **Step 1: Add resolve functions to connectivity.py**

Replace the contents of `src/backends/connectivity.py` with:

```python
"""Shared LLM connectivity constants and mode resolution for VSDA backends."""

import os
from typing import Any

from pydantic import SecretStr

VALID_CONNECTIVITY_MODES: tuple[str, ...] = ("remote", "gateway", "proxy")

# Maps (provider, mode) to the environment variable name
_ENV_URL_MAP: dict[tuple[str, str], str] = {
    ("openai", "remote"): "OPENAI_BASE_URL",
    ("openai", "gateway"): "OPENAI_BASE_URL_GATEWAY",
    ("openai", "proxy"): "OPENAI_BASE_URL_PROXY",
    ("anthropic", "remote"): "CLAUDE_BASE_URL",
    ("anthropic", "gateway"): "CLAUDE_BASE_URL_GATEWAY",
    ("anthropic", "proxy"): "CLAUDE_BASE_URL_PROXY",
}

# Maps (provider, mode) to the system_settings key
_DB_KEY_MAP: dict[tuple[str, str], str] = {
    ("openai", "remote"): "openai_base_url",
    ("openai", "gateway"): "openai_base_url_gateway",
    ("openai", "proxy"): "openai_base_url_proxy",
    ("anthropic", "remote"): "claude_base_url",
    ("anthropic", "gateway"): "claude_base_url_gateway",
    ("anthropic", "proxy"): "claude_base_url_proxy",
}

_HARDCODED_DEFAULTS: dict[tuple[str, str], str] = {
    ("openai", "remote"): "https://api.openai.com/v1",
    ("anthropic", "remote"): "https://api.anthropic.com",
}


def get_connectivity_mode() -> str:
    """Return the process-wide LLM connectivity mode, clamping invalid values to gateway.

    Reads from the process environment, which is populated from the .env file
    at startup via settings.load_dotenv(). Admin endpoint changes written by
    sync_to_env persist to .env and take effect on the next process restart.
    """
    mode = os.getenv("RUN_MODE", "gateway").strip().lower()
    return mode if mode in VALID_CONNECTIVITY_MODES else "gateway"


def resolve_run_mode(
    user_run_mode: str | None = None,
    system_run_mode: str | None = None,
) -> str:
    """Resolve effective run mode: user > system DB > env > gateway."""
    if user_run_mode and user_run_mode in VALID_CONNECTIVITY_MODES:
        return user_run_mode
    if system_run_mode and system_run_mode in VALID_CONNECTIVITY_MODES:
        return system_run_mode
    return get_connectivity_mode()


def resolve_base_url(
    provider: str,
    mode: str,
    *,
    user_proxy_url: str | None = None,
    system_url_override: str | None = None,
) -> str | None:
    """Resolve the base URL for a provider/mode combination.

    Priority: user proxy URL (proxy mode only) > system DB override > env > hardcoded.
    """
    if mode == "proxy" and user_proxy_url:
        return user_proxy_url
    if system_url_override:
        return system_url_override
    env_key = _ENV_URL_MAP.get((provider, mode))
    env_val = os.getenv(env_key, "") if env_key else ""
    if env_val:
        return env_val
    return _HARDCODED_DEFAULTS.get((provider, mode))


def build_connectivity_kwargs(
    provider: str,
    mode: str,
    *,
    user_proxy_url: str | None = None,
    system_url_override: str | None = None,
) -> dict[str, Any]:
    """Build init_chat_model kwargs for the given provider and resolved mode."""
    base_url = resolve_base_url(
        provider, mode,
        user_proxy_url=user_proxy_url,
        system_url_override=system_url_override,
    )
    kwargs: dict[str, Any] = {"base_url": base_url}
    if mode == "proxy":
        kwargs["api_key"] = SecretStr("NONE")
    else:
        if provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
        else:
            api_key = os.getenv("CLAUDE_API_KEY")
        if api_key:
            kwargs["api_key"] = SecretStr(api_key)
    return kwargs
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -m pytest tests/unit_tests/test_models.py -v --timeout=30`

Expected: All existing tests PASS (the `get_connectivity_mode()` function signature is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/backends/connectivity.py
git commit -m "feat: add resolve_run_mode and resolve_base_url with DB-first lookup"
```

---

## Task 4: Backend — Pydantic Schemas for Connectivity Endpoints

**Files:**
- Modify: `src/backends/schemas.py`

- [ ] **Step 1: Add connectivity schemas to schemas.py**

Add at the bottom of `src/backends/schemas.py`:

```python
# --- Connectivity ---


class UrlSettingOut(BaseModel):
    """Single URL setting with source metadata."""

    value: str
    source: str  # "database" or "env"
    updated_at: str | None = None
    updated_by: str | None = None


class AdminConnectivityResponse(BaseModel):
    """Response for GET /api/admin/connectivity."""

    run_mode: str
    run_mode_source: str  # "database" or "env"
    urls: dict[str, UrlSettingOut]


class AdminConnectivityUpdateRequest(BaseModel):
    """Request for PUT /api/admin/connectivity. All fields optional (partial update)."""

    run_mode: str | None = None
    openai_base_url: str | None = None
    openai_base_url_gateway: str | None = None
    openai_base_url_proxy: str | None = None
    claude_base_url: str | None = None
    claude_base_url_gateway: str | None = None
    claude_base_url_proxy: str | None = None

    @field_validator("run_mode")
    @classmethod
    def validate_run_mode(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().lower()
            if v not in ("remote", "gateway", "proxy"):
                raise ValueError("run_mode must be remote|gateway|proxy")
        return v


class UserConnectivityResponse(BaseModel):
    """Response for GET /api/user/connectivity."""

    run_mode: str
    run_mode_source: str  # "user", "admin", or "env"
    default_run_mode: str
    proxy_url: str
    proxy_url_source: str  # "user", "admin", or "env"
    available_modes: list[str]


class UserConnectivityUpdateRequest(BaseModel):
    """Request for PUT /api/user/connectivity. All fields optional."""

    run_mode: str | None = None
    proxy_url: str | None = None

    @field_validator("run_mode")
    @classmethod
    def validate_run_mode(cls, v: str | None) -> str | None:
        if v is not None and v != "":
            v = v.strip().lower()
            if v not in ("remote", "gateway", "proxy"):
                raise ValueError("run_mode must be remote|gateway|proxy or empty to reset")
        return v
```

- [ ] **Step 2: Verify schemas module imports cleanly**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -c "from src.backends.schemas import AdminConnectivityResponse, UserConnectivityResponse; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/backends/schemas.py
git commit -m "feat: add Pydantic schemas for connectivity endpoints"
```

---

## Task 5: Backend — Admin and User Connectivity Endpoints

**Files:**
- Modify: `src/backends/main.py`

- [ ] **Step 1: Add imports to main.py**

Add to the imports section at the top of `src/backends/main.py`:

```python
from src.backends.connectivity_store import (
    get_all_connectivity_settings,
    get_system_setting,
    set_system_setting,
    CONNECTIVITY_KEYS,
    SettingRow,
)
from src.backends.connectivity import resolve_run_mode, _ENV_URL_MAP, _DB_KEY_MAP
from src.backends.schemas import (
    AdminConnectivityResponse,
    AdminConnectivityUpdateRequest,
    UrlSettingOut,
    UserConnectivityResponse,
    UserConnectivityUpdateRequest,
)
```

- [ ] **Step 2: Add GET /api/admin/connectivity endpoint**

Add after the existing `update_run_mode` endpoint in `main.py`:

```python
@app.get("/api/admin/connectivity")
async def get_admin_connectivity(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_async_db),
) -> AdminConnectivityResponse:
    """Return all system connectivity settings with source tracking."""
    settings = await get_all_connectivity_settings(db)

    # Determine run_mode source
    rm_setting = settings.get("run_mode")
    if rm_setting and rm_setting.value:
        run_mode = rm_setting.value
        run_mode_source = "database"
    else:
        run_mode = get_connectivity_mode()
        run_mode_source = "env"

    # Build URL settings
    url_keys = [k for k in CONNECTIVITY_KEYS if k != "run_mode"]
    urls: dict[str, UrlSettingOut] = {}
    for key in url_keys:
        setting = settings.get(key)
        if setting and setting.value:
            urls[key] = UrlSettingOut(
                value=setting.value,
                source="database",
                updated_at=setting.updated_at.isoformat() if setting.updated_at else None,
                updated_by=setting.updated_by,
            )
        else:
            # Fall back to env
            env_key = key.upper()
            env_val = os.getenv(env_key, "")
            urls[key] = UrlSettingOut(value=env_val, source="env")

    return AdminConnectivityResponse(
        run_mode=run_mode,
        run_mode_source=run_mode_source,
        urls=urls,
    )
```

- [ ] **Step 3: Add PUT /api/admin/connectivity endpoint**

```python
@app.put("/api/admin/connectivity")
async def update_admin_connectivity(
    req: AdminConnectivityUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_async_db),
) -> AdminConnectivityResponse:
    """Update system connectivity settings (partial update)."""
    updates = req.model_dump(exclude_none=True)
    for key, value in updates.items():
        if key in CONNECTIVITY_KEYS:
            await set_system_setting(db, key, value, admin.username)

    # Return fresh state
    return await get_admin_connectivity(_=admin, db=db)
```

- [ ] **Step 4: Add GET /api/user/connectivity endpoint**

```python
@app.get("/api/user/connectivity")
async def get_user_connectivity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> UserConnectivityResponse:
    """Return the user's effective connectivity settings."""
    settings = await get_all_connectivity_settings(db)

    # Resolve system default run mode
    sys_rm = settings.get("run_mode")
    system_run_mode = sys_rm.value if (sys_rm and sys_rm.value) else None
    default_run_mode = system_run_mode or get_connectivity_mode()

    # Resolve effective run mode
    if current_user.user_run_mode and current_user.user_run_mode in VALID_CONNECTIVITY_MODES:
        effective_mode = current_user.user_run_mode
        mode_source = "user"
    elif system_run_mode:
        effective_mode = system_run_mode
        mode_source = "admin"
    else:
        effective_mode = get_connectivity_mode()
        mode_source = "env"

    # Resolve proxy URL
    if current_user.user_proxy_url:
        proxy_url = current_user.user_proxy_url
        proxy_source = "user"
    else:
        sys_proxy = settings.get("openai_base_url_proxy")
        if sys_proxy and sys_proxy.value:
            proxy_url = sys_proxy.value
            proxy_source = "admin"
        else:
            proxy_url = os.getenv("OPENAI_BASE_URL_PROXY", "")
            proxy_source = "env"

    return UserConnectivityResponse(
        run_mode=effective_mode,
        run_mode_source=mode_source,
        default_run_mode=default_run_mode,
        proxy_url=proxy_url,
        proxy_url_source=proxy_source,
        available_modes=list(VALID_CONNECTIVITY_MODES),
    )
```

- [ ] **Step 5: Add PUT /api/user/connectivity endpoint**

```python
@app.put("/api/user/connectivity")
async def update_user_connectivity(
    req: UserConnectivityUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> UserConnectivityResponse:
    """Update the user's personal connectivity settings."""
    stmt = select(User).where(User.id == current_user.id)
    result = await db.execute(stmt)
    user = result.scalar_one()

    if req.run_mode is not None:
        user.user_run_mode = req.run_mode if req.run_mode else None
    if req.proxy_url is not None:
        user.user_proxy_url = req.proxy_url if req.proxy_url else None

    await db.commit()

    return await get_user_connectivity(current_user=user, db=db)
```

- [ ] **Step 6: Verify the server starts**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -c "from src.backends.main import app; print('OK')"`

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add src/backends/main.py
git commit -m "feat: add admin and user connectivity API endpoints"
```

---

## Task 6: Frontend — API Client Functions

**Files:**
- Modify: `src/lib/auth.ts` (in deep-agents-ui)

- [ ] **Step 1: Add types and API functions to auth.ts**

Add at the bottom of `src/lib/auth.ts`:

```typescript
// --- Connectivity settings ---

export interface UrlSettingInfo {
  value: string;
  source: "database" | "env";
  updated_at: string | null;
  updated_by: string | null;
}

export interface AdminConnectivityResponse {
  run_mode: RunMode;
  run_mode_source: "database" | "env";
  urls: Record<string, UrlSettingInfo>;
}

export interface AdminConnectivityUpdatePayload {
  run_mode?: RunMode;
  openai_base_url?: string;
  openai_base_url_gateway?: string;
  openai_base_url_proxy?: string;
  claude_base_url?: string;
  claude_base_url_gateway?: string;
  claude_base_url_proxy?: string;
}

export async function apiGetAdminConnectivity(): Promise<AdminConnectivityResponse> {
  const res = await apiFetch("/admin/connectivity");
  if (!res.ok) {
    throw new Error("Failed to fetch connectivity settings");
  }
  return res.json();
}

export async function apiSetAdminConnectivity(
  payload: AdminConnectivityUpdatePayload
): Promise<AdminConnectivityResponse> {
  const res = await apiFetch("/admin/connectivity", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail || "Failed to update connectivity settings"
    );
  }
  return res.json();
}

export interface UserConnectivityResponse {
  run_mode: RunMode;
  run_mode_source: "user" | "admin" | "env";
  default_run_mode: RunMode;
  proxy_url: string;
  proxy_url_source: "user" | "admin" | "env";
  available_modes: RunMode[];
}

export interface UserConnectivityUpdatePayload {
  run_mode?: RunMode | null;
  proxy_url?: string | null;
}

export async function apiGetUserConnectivity(): Promise<UserConnectivityResponse> {
  const res = await apiFetch("/user/connectivity");
  if (!res.ok) {
    throw new Error("Failed to fetch user connectivity");
  }
  return res.json();
}

export async function apiSetUserConnectivity(
  payload: UserConnectivityUpdatePayload
): Promise<UserConnectivityResponse> {
  const res = await apiFetch("/user/connectivity", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail || "Failed to update user connectivity"
    );
  }
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/tpoj6d/wkspaces/deep-agents-ui && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add connectivity API client functions"
```

---

## Task 7: Frontend — Admin Connectivities Tab

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`

- [ ] **Step 1: Rename tab and add icon import**

In `AdminPanel.tsx`, update the `TABS` array — change the "runmode" entry label from `"Modes"` to `"Connectivities"` and icon from `RadioTower` to `Globe`:

```typescript
import { Globe } from "lucide-react";  // add to imports (replace RadioTower usage for this tab)
```

Update the TABS entry:
```typescript
  { id: "runmode", label: "Connectivities", icon: Globe },
```

- [ ] **Step 2: Add URL override imports**

Add to the imports from `@/lib/auth`:

```typescript
  AdminConnectivityResponse,
  AdminConnectivityUpdatePayload,
  UrlSettingInfo,
  apiGetAdminConnectivity,
  apiSetAdminConnectivity,
```

- [ ] **Step 3: Add URL override form to RunModeSection**

After the existing `handleSave` function and before the `return` in `RunModeSection`, add state and handlers for the URL overrides:

```typescript
  // --- URL Overrides ---
  const [connectivity, setConnectivity] = useState<AdminConnectivityResponse | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [isSavingUrls, setIsSavingUrls] = useState(false);

  useEffect(() => {
    apiGetAdminConnectivity()
      .then((data) => {
        setConnectivity(data);
        const draft: Record<string, string> = {};
        for (const [key, info] of Object.entries(data.urls)) {
          draft[key] = info.value;
        }
        setUrlDraft(draft);
      })
      .catch(() => toast.error("Failed to load URL settings"));
  }, []);

  const urlsDirty = connectivity
    ? Object.entries(urlDraft).some(
        ([key, val]) => val !== (connectivity.urls[key]?.value ?? "")
      )
    : false;

  const handleSaveUrls = async () => {
    if (!urlsDirty) return;
    setIsSavingUrls(true);
    try {
      const payload: AdminConnectivityUpdatePayload = {};
      for (const [key, val] of Object.entries(urlDraft)) {
        if (val !== (connectivity?.urls[key]?.value ?? "")) {
          (payload as Record<string, string>)[key] = val;
        }
      }
      const updated = await apiSetAdminConnectivity(payload);
      setConnectivity(updated);
      toast.success("URL overrides saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save URLs");
    } finally {
      setIsSavingUrls(false);
    }
  };
```

- [ ] **Step 4: Add URL override JSX to the return**

After the existing run mode save button (inside the same section), add:

```tsx
        {connectivity && (
          <div className="space-y-3 border-t border-border/40 pt-5">
            <SectionHeader
              title="URL Overrides"
              subtitle="Override environment URLs for each provider and mode. Empty = use .env default."
            />

            {(["openai", "anthropic"] as const).map((provider) => (
              <div key={provider} className="space-y-2">
                <p className="aptiv-eyebrow">{provider === "openai" ? "OpenAI" : "Anthropic"}</p>
                {(["remote", "gateway", "proxy"] as const).map((mode) => {
                  const key = provider === "openai"
                    ? `openai_base_url${mode === "remote" ? "" : `_${mode}`}`
                    : `claude_base_url${mode === "remote" ? "" : `_${mode}`}`;
                  const info = connectivity.urls[key];
                  return (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {mode} URL
                      </Label>
                      <Input
                        value={urlDraft[key] ?? ""}
                        onChange={(e) =>
                          setUrlDraft((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={`(not set — using .env)`}
                        className={cn(
                          "h-9 font-mono text-[11px]",
                          info?.source === "database" && info.value
                            ? "border-primary/40"
                            : ""
                        )}
                      />
                      <span className={cn(
                        "text-[9px]",
                        info?.source === "database" && info.value
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}>
                        Source: {info?.source ?? "env"}
                        {info?.source === "database" && info.updated_at && (
                          <> · Updated {formatTimestamp(info.updated_at)}</>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            <Button
              type="button"
              onClick={handleSaveUrls}
              disabled={isSavingUrls || !urlsDirty}
              className="w-full"
            >
              {isSavingUrls ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save URL overrides
                </>
              )}
            </Button>
          </div>
        )}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd C:/Users/tpoj6d/wkspaces/deep-agents-ui && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 6: Start dev server and visually verify**

Run: `cd C:/Users/tpoj6d/wkspaces/deep-agents-ui && npm run dev`

Open the admin panel, verify "Connectivities" tab shows with the URL override form below the run mode selector.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: add URL override form to admin Connectivities tab"
```

---

## Task 8: Frontend — User Connectivity Section

**Files:**
- Modify: `src/app/components/UserManagementSidebar.tsx`

- [ ] **Step 1: Add imports**

Add to imports in `UserManagementSidebar.tsx`:

```typescript
import { Globe, Link } from "lucide-react";  // add Globe and Link
import {
  apiGetUserConnectivity,
  apiSetUserConnectivity,
  UserConnectivityResponse,
  RunMode,
} from "@/lib/auth";
```

- [ ] **Step 2: Add ConnectivitySection component**

Add a new component at the bottom of the file (before any helper functions, or at the end):

```typescript
function ConnectivitySection() {
  const [data, setData] = useState<UserConnectivityResponse | null>(null);
  const [pendingMode, setPendingMode] = useState<RunMode>("gateway");
  const [proxyUrl, setProxyUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    apiGetUserConnectivity()
      .then((res) => {
        setData(res);
        setPendingMode(res.run_mode);
        setProxyUrl(res.proxy_url);
      })
      .catch(() => toast.error("Failed to load connectivity settings"))
      .finally(() => setIsLoading(false));
  }, []);

  const dirty =
    data !== null &&
    (pendingMode !== data.run_mode || proxyUrl !== data.proxy_url);

  const handleSave = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const payload: { run_mode?: string | null; proxy_url?: string | null } = {};
      if (pendingMode !== data?.run_mode) {
        payload.run_mode = pendingMode;
      }
      if (proxyUrl !== data?.proxy_url) {
        payload.proxy_url = proxyUrl || null;
      }
      const updated = await apiSetUserConnectivity(payload);
      setData(updated);
      setPendingMode(updated.run_mode);
      setProxyUrl(updated.proxy_url);
      toast.success("Connectivity saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      const updated = await apiSetUserConnectivity({
        run_mode: null,
        proxy_url: null,
      });
      setData(updated);
      setPendingMode(updated.run_mode);
      setProxyUrl(updated.proxy_url);
      toast.success("Reset to system defaults");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Connectivity</h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Run mode
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {RUN_MODES.map((mode) => {
              const active = pendingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPendingMode(mode)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-center text-xs font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/40"
                  )}
                >
                  {mode}
                </button>
              );
            })}
          </div>
          {data && (
            <p className="text-[9px] text-muted-foreground">
              System default: {data.default_run_mode}
              {data.run_mode_source === "user" && " · Your choice: " + data.run_mode}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            My proxy URL
          </Label>
          <Input
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder="(not set — using system proxy)"
            className="h-9 font-mono text-[11px]"
          />
          <p className="text-[9px] text-muted-foreground">
            Used when run mode is &quot;proxy&quot;. Leave empty for system default.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !dirty}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save connectivity
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={handleReset}
          className="w-full text-center text-[10px] text-muted-foreground underline hover:text-foreground"
        >
          Reset to system defaults
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render ConnectivitySection in the sidebar**

Find the main return of `UserManagementSidebar` and add `<ConnectivitySection />` after the password change section (and before any admin-only sections). Add a divider before it:

```tsx
      <div className="border-t border-border/40 pt-4">
        <ConnectivitySection />
      </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd C:/Users/tpoj6d/wkspaces/deep-agents-ui && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 5: Visually verify in dev server**

Open the User Management Sidebar. Verify the Connectivity section appears with:
- Run mode radio group (3 options)
- System default indication
- Proxy URL input
- Save button
- Reset link

- [ ] **Step 6: Commit**

```bash
git add src/app/components/UserManagementSidebar.tsx
git commit -m "feat: add user Connectivity section to sidebar"
```

---

## Task 9: Integration Test

**Files:**
- Modify: `tests/integration_tests/test_backend_api.py` (in vsda-deep-agent)

- [ ] **Step 1: Add integration tests for connectivity endpoints**

Add at the bottom of `tests/integration_tests/test_backend_api.py`:

```python
class TestConnectivityEndpoints:
    """Tests for admin and user connectivity endpoints."""

    def test_get_admin_connectivity_requires_admin(self, client, user_headers):
        resp = client.get("/api/admin/connectivity", headers=user_headers)
        assert resp.status_code == 403

    def test_get_admin_connectivity_returns_urls(self, client, admin_headers):
        resp = client.get("/api/admin/connectivity", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "run_mode" in data
        assert "urls" in data
        assert "openai_base_url" in data["urls"]
        assert "claude_base_url_gateway" in data["urls"]
        for url_info in data["urls"].values():
            assert "value" in url_info
            assert "source" in url_info

    def test_put_admin_connectivity_updates_url(self, client, admin_headers):
        resp = client.put(
            "/api/admin/connectivity",
            json={"openai_base_url_gateway": "https://test-gateway.example/v1"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["urls"]["openai_base_url_gateway"]["value"] == "https://test-gateway.example/v1"
        assert data["urls"]["openai_base_url_gateway"]["source"] == "database"

    def test_put_admin_connectivity_clear_override(self, client, admin_headers):
        # First set a value
        client.put(
            "/api/admin/connectivity",
            json={"openai_base_url_proxy": "http://proxy.test/v1"},
            headers=admin_headers,
        )
        # Then clear it
        resp = client.put(
            "/api/admin/connectivity",
            json={"openai_base_url_proxy": ""},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["urls"]["openai_base_url_proxy"]["source"] == "env"

    def test_get_user_connectivity(self, client, user_headers):
        resp = client.get("/api/user/connectivity", headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "run_mode" in data
        assert "proxy_url" in data
        assert "available_modes" in data
        assert set(data["available_modes"]) == {"remote", "gateway", "proxy"}

    def test_put_user_connectivity_set_mode(self, client, user_headers):
        resp = client.put(
            "/api/user/connectivity",
            json={"run_mode": "proxy"},
            headers=user_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_mode"] == "proxy"
        assert data["run_mode_source"] == "user"

    def test_put_user_connectivity_set_proxy_url(self, client, user_headers):
        resp = client.put(
            "/api/user/connectivity",
            json={"run_mode": "proxy", "proxy_url": "http://my-proxy:8080/v1"},
            headers=user_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["proxy_url"] == "http://my-proxy:8080/v1"
        assert data["proxy_url_source"] == "user"

    def test_put_user_connectivity_reset(self, client, user_headers):
        # Set personal mode
        client.put(
            "/api/user/connectivity",
            json={"run_mode": "proxy", "proxy_url": "http://x:8080"},
            headers=user_headers,
        )
        # Reset
        resp = client.put(
            "/api/user/connectivity",
            json={"run_mode": "", "proxy_url": ""},
            headers=user_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_mode_source"] != "user"
        assert data["proxy_url_source"] != "user"
```

- [ ] **Step 2: Run integration tests**

Run: `cd C:/Users/tpoj6d/wkspaces/vsda-deep-agent && python -m pytest tests/integration_tests/test_backend_api.py::TestConnectivityEndpoints -v`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration_tests/test_backend_api.py
git commit -m "test: add integration tests for connectivity endpoints"
```

---

## Summary of Changes

| Area | Files Changed | Description |
|------|--------------|-------------|
| Backend models | `models.py`, `database.py` | New `SystemSetting` table + user columns |
| Backend store | `connectivity_store.py` (new) | Async DB layer for settings |
| Backend resolution | `connectivity.py` | New resolve functions with DB-first lookup |
| Backend schemas | `schemas.py` | Pydantic models for endpoints |
| Backend API | `main.py` | 4 new endpoints |
| Frontend API | `auth.ts` | 4 new client functions |
| Frontend admin | `AdminPanel.tsx` | Renamed tab + URL override form |
| Frontend user | `UserManagementSidebar.tsx` | New Connectivity section |
| Tests | `test_connectivity_store.py`, `test_backend_api.py` | Unit + integration tests |
