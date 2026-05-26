# URL Override & Per-User Connectivity Design

**Date**: 2026-05-26
**Status**: Approved
**Scope**: Frontend (deep-agents-ui) + Backend (vsda-deep-agent)

---

## Summary

Add admin and user-facing UI for managing LLM connectivity settings:
- Admin can override the 6 base URLs (OpenAI + Anthropic, for each of remote/gateway/proxy modes) via HTTP API and UI, persisted in the database with env-file fallback
- Users can select their own run mode (overriding the admin-set global default)
- Users can set their own proxy URL (single URL applied to all providers when their mode is "proxy")

---

## Requirements

| # | Requirement | Actor |
|---|-------------|-------|
| R1 | Admin sets global run mode (system default) | Admin |
| R2 | Admin overrides any of 6 base URLs via UI | Admin |
| R3 | URL overrides stored in database, env as fallback | System |
| R4 | User selects personal run mode (inherits global when unset) | User |
| R5 | User sets personal proxy URL (applies to all providers) | User |
| R6 | Per-user proxy stored in database, keyed by user | System |
| R7 | Resolution priority: user DB > admin DB > env > hardcoded default | System |
| R8 | Admin tab renamed from "Modes" to "Connectivities" | UI |
| R9 | User connectivity section added to UserManagementSidebar | UI |

---

## Data Layer

### Users table additions

Two new nullable columns added via migration (same pattern as existing `selected_provider`, `selected_model`):

```sql
ALTER TABLE users ADD COLUMN user_run_mode VARCHAR;   -- NULL = inherit global
ALTER TABLE users ADD COLUMN user_proxy_url VARCHAR;  -- NULL = use system proxy
```

- `user_run_mode`: one of `"remote"`, `"gateway"`, `"proxy"`, or `NULL`
- `user_proxy_url`: full URL string or `NULL`

### New `system_settings` table

```sql
CREATE TABLE system_settings (
    key VARCHAR PRIMARY KEY,
    value VARCHAR NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR
);
```

Keys (seeded with empty values on migration):
| Key | Maps to env var |
|-----|-----------------|
| `run_mode` | `RUN_MODE` |
| `openai_base_url` | `OPENAI_BASE_URL` |
| `openai_base_url_gateway` | `OPENAI_BASE_URL_GATEWAY` |
| `openai_base_url_proxy` | `OPENAI_BASE_URL_PROXY` |
| `claude_base_url` | `CLAUDE_BASE_URL` |
| `claude_base_url_gateway` | `CLAUDE_BASE_URL_GATEWAY` |
| `claude_base_url_proxy` | `CLAUDE_BASE_URL_PROXY` |

An empty `value` means "not overridden, fall back to env".

### Resolution chain

```
resolve_run_mode(user):
  1. user.user_run_mode (if not NULL)
  2. system_settings["run_mode"].value (if non-empty)
  3. os.getenv("RUN_MODE", "gateway")

resolve_base_url(provider, mode, user):
  1. If mode == "proxy" AND user.user_proxy_url is non-empty → user.user_proxy_url
  2. system_settings[key_for(provider, mode)].value (if non-empty)
  3. os.getenv(ENV_VAR_NAME)
  4. Hardcoded default (e.g. "https://api.openai.com/v1")

Note: When user selects "proxy" mode but has no personal proxy URL set, the
system proxy URL is used (step 2/3). The user's proxy URL override ONLY applies
when they are in proxy mode — it is ignored for remote/gateway modes.
```

---

## API Design

### Admin endpoints (JWT + admin role)

#### `GET /api/admin/connectivity`

Returns all system URL settings and global run mode with source tracking.

Response:
```json
{
  "run_mode": "gateway",
  "run_mode_source": "database",
  "urls": {
    "openai_base_url": {"value": "https://api.openai.com/v1", "source": "env", "updated_at": null, "updated_by": null},
    "openai_base_url_gateway": {"value": "https://gateway...", "source": "database", "updated_at": "2026-05-20T14:30:00", "updated_by": "admin1"},
    "openai_base_url_proxy": {"value": "", "source": "env", "updated_at": null, "updated_by": null},
    "claude_base_url": {"value": "https://api.anthropic.com", "source": "env", "updated_at": null, "updated_by": null},
    "claude_base_url_gateway": {"value": "https://gateway...", "source": "database", "updated_at": "2026-05-20T14:30:00", "updated_by": "admin1"},
    "claude_base_url_proxy": {"value": "", "source": "env", "updated_at": null, "updated_by": null}
  }
}
```

Source is `"database"` when a non-empty override exists in system_settings, `"env"` otherwise.

#### `PUT /api/admin/connectivity`

Partial update — only include fields to change.

Request body:
```json
{
  "run_mode": "proxy",
  "openai_base_url_proxy": "http://10.0.0.5:8080/v1",
  "claude_base_url_proxy": "http://10.0.0.5:8080/v1"
}
```

Setting a URL to `""` clears the DB override (reverts to env fallback).

Response: same shape as GET.

### User endpoints (JWT, any authenticated user)

#### `GET /api/user/connectivity`

Response:
```json
{
  "run_mode": "proxy",
  "run_mode_source": "user",
  "default_run_mode": "gateway",
  "proxy_url": "http://127.0.0.1:8080/v1",
  "proxy_url_source": "user",
  "available_modes": ["remote", "gateway", "proxy"]
}
```

`run_mode_source` is `"user"` | `"admin"` | `"env"` depending on where the effective value comes from.

#### `PUT /api/user/connectivity`

Request body (partial update):
```json
{
  "run_mode": "proxy",
  "proxy_url": "http://127.0.0.1:8080/v1"
}
```

Setting `run_mode` to `null` resets to inheriting global default. Setting `proxy_url` to `null` or `""` clears the user override.

Response: same shape as GET.

### Backwards compatibility

The existing `GET/PUT /api/admin/run-mode` endpoint stays functional. Internally, `PUT` writes to both `system_settings` table and `.env` file (via existing `sync_to_env`). The new `/api/admin/connectivity` endpoint writes only to the database (no `.env` sync).

---

## Frontend UI

### Admin: Connectivities Tab

Located in `AdminPanel.tsx`. Changes:
- Rename tab from "Modes" to "Connectivities" (update `TABS` array, tab id stays `"runmode"` to avoid routing changes)
- Rename `RunModeSection` component to `ConnectivitySection`
- Add URL override form below the existing run mode radio group

Layout (top to bottom):
1. `SectionHeader` "Connectivity" — existing run mode radio group + save button (unchanged behavior)
2. Divider
3. `SectionHeader` "URL Overrides" — 6 input fields grouped by provider (OpenAI, Anthropic), each showing source indicator
4. Save URL overrides button

Component patterns:
- Reuse `aptiv-glass-soft` card styling
- `aptiv-eyebrow` for provider group labels (OPENAI, ANTHROPIC)
- `aptiv-rule` orange accent line under section headers
- `font-mono text-[11px]` for URL input fields
- Source badge: `text-[9px] text-muted-foreground` (or `text-primary` when DB-overridden)
- Lucide icons: `Globe` for remote, `Shield` for gateway, `Link` for proxy

### User: Connectivity Section

Located in `UserManagementSidebar.tsx`. New section added below the existing profile/password sections.

Layout:
1. Section header with `Link` icon + "Connectivity" title
2. Run mode radio group (3 options: remote, gateway, proxy) — same visual style as admin
3. Subtext showing system default value
4. "My Proxy URL" input field (monospace, highlighted when set)
5. Helper text: "Used when run mode is proxy. Empty = use system default."
6. Save button
7. "Reset to defaults" link

Behavior:
- On mount: `GET /api/user/connectivity` to populate current values
- On save: `PUT /api/user/connectivity` with changed fields
- Reset: `PUT /api/user/connectivity` with `{run_mode: null, proxy_url: null}`

---

## Backend Integration

### New file: `src/backends/connectivity_store.py`

Async DB access layer for the `system_settings` table:
- `get_system_setting(key: str) -> str | None`
- `set_system_setting(key: str, value: str, updated_by: str) -> None`
- `get_all_connectivity_settings() -> dict[str, SystemSettingRow]`
- `resolve_user_connectivity(user_id: str, provider: str) -> ConnectivityKwargs`

### Changes to existing files

| File | Change |
|------|--------|
| `src/backends/database.py` | Add `SystemSetting` model import; create table in `run_migrations()` |
| `src/backends/models.py` | Add `SystemSetting` SQLAlchemy model; add `user_run_mode`, `user_proxy_url` to `User` |
| `src/backends/main.py` | Add `GET/PUT /api/admin/connectivity` and `GET/PUT /api/user/connectivity` endpoints |
| `src/backends/connectivity.py` | Add `resolve_user_connectivity()` that uses DB-first lookup |
| `src/deep_agent/models.py` | Update `_resolve_connectivity()` to accept optional user context |

### Frontend new API functions

Added to `src/lib/auth.ts`:
- `apiGetAdminConnectivity(): Promise<AdminConnectivityResponse>`
- `apiSetAdminConnectivity(payload): Promise<AdminConnectivityResponse>`
- `apiGetUserConnectivity(): Promise<UserConnectivityResponse>`
- `apiSetUserConnectivity(payload): Promise<UserConnectivityResponse>`

---

## Design Guidelines Compliance

- No emoji in production UI (Aptiv B2B brand)
- Lucide icons exclusively
- Teal primary (#2F6868) for action buttons
- Aptiv Orange (#F84018) for accent rules only
- System font stack; monospace for URL fields
- Existing component patterns: `aptiv-glass-soft`, `SectionHeader`, `ActionPill`
- `border-radius: 0.375rem` for inputs, `0.5rem` for cards
- Subtle transitions, no bounce/spring animations

---

## Out of Scope

- API key management (stays in env only)
- Per-user gateway/remote URL overrides (only proxy URL is per-user)
- URL validation beyond basic format checks
- Audit log for setting changes (updated_by + updated_at provides basic tracking)
