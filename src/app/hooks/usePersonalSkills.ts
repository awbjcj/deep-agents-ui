"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import {
  apiCreatePersonalSkill,
  apiDeletePersonalSkill,
  apiGetPersonalSkill,
  apiGetSkills,
  apiGetSystemSkill,
  apiPreviewSkillImport,
  apiReadSystemSkillFile,
  apiReplacePersonalSkill,
  SkillsApiError,
  type PersonalSkill,
  type SkillCatalog,
  type SkillCatalogEntry,
  type SkillDiagnostic,
  type SkillFile,
  type SkillImportPreview,
  type SystemSkill,
} from "@/lib/skills";
import {
  assessSystemSkillCopy,
  copySystemSkillDraft,
  createSkillDraft,
  DEFAULT_SKILL_LIMITS,
  isSkillDraftDirty,
  validateSkillDraft,
  type SkillDraft,
} from "@/lib/skill-drafts";

/** Owns requests and unsaved packages for one account-keyed sidebar lifetime. */
export function usePersonalSkills(accountId: string) {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SkillCatalogEntry | null>(null);
  const [detail, setDetail] = useState<PersonalSkill | SystemSkill | null>(
    null
  );
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SkillDiagnostic[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [nameConflict, setNameConflict] = useState(false);
  const [latest, setLatest] = useState<PersonalSkill | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSession, setImportSession] = useState(0);
  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importDiagnostics, setImportDiagnostics] = useState<SkillDiagnostic[]>(
    []
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<PersonalSkill | null>(null);
  const [importTargetLoading, setImportTargetLoading] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const selection = useRef(0);
  const importRequest = useRef(0);
  const importTargetRequest = useRef(0);
  const catalogRequest = useRef(0);
  const limits = catalog?.limits ?? DEFAULT_SKILL_LIMITS;
  const dirty = !!draft && isSkillDraftDirty(draft);
  // Checking the live auth store closes the interval before React processes a
  // logout/profile update. The account key also prevents stale rendered data.
  const applicable = useCallback(
    (controller: AbortController, version?: number) =>
      lifetime.current === controller &&
      !controller.signal.aborted &&
      getAuthUser()?.user_id === accountId &&
      (version === undefined || selection.current === version),
    [accountId]
  );
  const reportError = useCallback((failure: unknown) => {
    setError(
      failure instanceof Error
        ? failure.message
        : "Could not complete the skill request."
    );
    setDiagnostics(
      failure instanceof SkillsApiError ? failure.diagnostics : []
    );
    setConflict(
      failure instanceof SkillsApiError &&
        failure.code === "skill_revision_conflict"
    );
    setNameConflict(
      failure instanceof SkillsApiError &&
        failure.code === "skill_name_conflict"
    );
  }, []);
  const refresh = useCallback(async () => {
    const controller = lifetime.current;
    if (!controller || !applicable(controller)) return;
    const request = ++catalogRequest.current;
    setLoading(true);
    try {
      const next = await apiGetSkills(controller.signal);
      if (applicable(controller) && request === catalogRequest.current) {
        setCatalog(next);
        setCatalogError(null);
      }
    } catch (failure) {
      if (applicable(controller) && request === catalogRequest.current)
        setCatalogError(
          failure instanceof Error ? failure.message : "Could not load skills."
        );
    } finally {
      if (applicable(controller) && request === catalogRequest.current)
        setLoading(false);
    }
  }, [applicable]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh();
    return () => {
      controller.abort();
      lifetime.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const canLeave = () =>
    !dirty || window.confirm("Discard unsaved skill changes?");
  function resetSelection() {
    selection.current += 1;
    setError(null);
    setDiagnostics([]);
    setSuccess(null);
    setConflict(false);
    setNameConflict(false);
    setLatest(null);
    setDetail(null);
    setFiles([]);
    setDraft(null);
    setDetailLoading(false);
    setBusy(false);
  }
  async function select(entry: SkillCatalogEntry) {
    if (busy || !canLeave()) return;
    resetSelection();
    setSelected(entry);
    setDetailLoading(true);
    const controller = lifetime.current;
    const version = selection.current;
    if (!controller) return;
    try {
      if (entry.origin === "personal") {
        const next = await apiGetPersonalSkill(entry.id, controller.signal);
        if (applicable(controller, version)) {
          setDetail(next);
          setFiles(next.files);
        }
      } else {
        const next = await apiGetSystemSkill(entry.id, controller.signal);
        if (!applicable(controller, version)) return;
        setDetail(next);
        const root = await apiReadSystemSkillFile(
          entry.id,
          "SKILL.md",
          controller.signal
        );
        if (applicable(controller, version)) setFiles([root]);
      }
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setDetailLoading(false);
    }
  }
  function create() {
    if (busy || !canLeave()) return;
    resetSelection();
    setSelected(null);
    setDraft(createSkillDraft(accountId, null));
  }
  function changeDraft(next: SkillDraft) {
    if (next.accountId !== accountId || busy) return;
    setDraft(next);
    setSuccess(null);
  }
  function discard() {
    if (busy || !canLeave()) return;
    resetSelection();
    setSelected(null);
  }
  async function save() {
    const controller = lifetime.current;
    const version = selection.current;
    if (
      !draft ||
      draft.accountId !== accountId ||
      busy ||
      !controller ||
      !applicable(controller, version)
    )
      return;
    const failures = validateSkillDraft(draft, limits);
    if (failures.length) {
      setDiagnostics(failures);
      return;
    }
    setBusy(true);
    setError(null);
    setDiagnostics([]);
    setSuccess(null);
    try {
      const next =
        draft.sourceId !== null && draft.baseRevision !== null
          ? await apiReplacePersonalSkill(
              draft.sourceId,
              { files: draft.files },
              draft.baseRevision
            )
          : await apiCreatePersonalSkill({ files: draft.files });
      if (!applicable(controller, version)) return;
      setDraft(null);
      setDetail(next);
      setFiles(next.files);
      setSelected({ ...next, origin: "personal", availability: "available" });
      setConflict(false);
      setNameConflict(false);
      setLatest(null);
      setSuccess("Skill saved.");
      void refresh();
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setBusy(false);
    }
  }
  async function remove() {
    if (
      !detail ||
      "resources" in detail ||
      busy ||
      !window.confirm(
        `Delete personal skill "${detail.name}"? This removes its complete package.`
      )
    )
      return;
    const controller = lifetime.current,
      version = selection.current;
    if (!controller || !applicable(controller, version)) return;
    setBusy(true);
    setError(null);
    setDiagnostics([]);
    setSuccess(null);
    try {
      await apiDeletePersonalSkill(detail.id, detail.revision);
      if (!applicable(controller, version)) return;
      resetSelection();
      setSelected(null);
      setSuccess("Skill deleted.");
      void refresh();
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setBusy(false);
    }
  }
  async function readFile(path: string) {
    const controller = lifetime.current,
      version = selection.current;
    if (
      !detail ||
      !("resources" in detail) ||
      !controller ||
      !applicable(controller, version)
    )
      return;
    setDetailLoading(true);
    try {
      const file = await apiReadSystemSkillFile(
        detail.id,
        path,
        controller.signal
      );
      if (applicable(controller, version))
        setFiles((previous) => [
          ...previous.filter((item) => item.path !== path),
          file,
        ]);
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setDetailLoading(false);
    }
  }
  async function copy(name: string) {
    const controller = lifetime.current,
      version = selection.current;
    if (
      !detail ||
      !("resources" in detail) ||
      busy ||
      !controller ||
      !applicable(controller, version)
    )
      return;
    setBusy(true);
    setError(null);
    setDiagnostics([]);
    try {
      // Retrieve every manifest entry in order; a partial package is never copied.
      const complete: SkillFile[] = [];
      for (const resource of detail.resources) {
        const file = await apiReadSystemSkillFile(
          detail.id,
          resource.path,
          controller.signal
        );
        if (!applicable(controller, version)) return;
        complete.push(file);
      }
      const failures = assessSystemSkillCopy(detail, complete, limits);
      if (failures.length)
        throw new SkillsApiError(
          422,
          "skill_copy_invalid",
          "This system package cannot be copied.",
          failures
        );
      const next = copySystemSkillDraft(accountId, complete, name, limits);
      if (applicable(controller, version)) {
        setDraft(next);
        setFiles(complete);
        setSuccess(null);
      }
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setBusy(false);
    }
  }
  function openImport() {
    if (busy || !canLeave()) return;
    importRequest.current += 1;
    importTargetRequest.current += 1;
    setImportTargetId(null);
    setImportTarget(null);
    setImportTargetLoading(false);
    setImportSession((previous) => previous + 1);
    setPreview(null);
    setImportDiagnostics([]);
    setImportError(null);
    setImportLoading(false);
    setImportOpen(true);
  }
  function closeImport(open: boolean) {
    if (!open) {
      importRequest.current += 1;
      importTargetRequest.current += 1;
      setImportTargetId(null);
      setImportTarget(null);
      setImportTargetLoading(false);
      setImportLoading(false);
      setPreview(null);
    }
    setImportOpen(open);
  }
  async function previewImport(file: File) {
    const controller = lifetime.current,
      request = ++importRequest.current;
    if (!controller || !applicable(controller)) return;
    setPreview(null);
    setImportDiagnostics([]);
    setImportError(null);
    setImportLoading(true);
    try {
      const next = await apiPreviewSkillImport(file);
      if (applicable(controller) && request === importRequest.current)
        setPreview(next);
    } catch (failure) {
      if (applicable(controller) && request === importRequest.current) {
        setImportError(
          failure instanceof Error
            ? failure.message
            : "Could not preview package."
        );
        setImportDiagnostics(
          failure instanceof SkillsApiError ? failure.diagnostics : []
        );
      }
    } finally {
      if (applicable(controller) && request === importRequest.current)
        setImportLoading(false);
    }
  }
  async function selectImportTarget(id: string | null) {
    const controller = lifetime.current,
      request = ++importTargetRequest.current;
    setImportTargetId(id);
    setImportTarget(null);
    setImportTargetLoading(false);
    setImportError(null);
    if (!id || !controller || !applicable(controller)) return;
    if (
      !catalog?.entries.some(
        (entry) => entry.origin === "personal" && entry.id === id
      )
    )
      return;
    setImportTargetLoading(true);
    try {
      const target = await apiGetPersonalSkill(id, controller.signal);
      if (applicable(controller) && request === importTargetRequest.current)
        setImportTarget(target);
    } catch (failure) {
      if (applicable(controller) && request === importTargetRequest.current)
        setImportError(
          failure instanceof Error
            ? failure.message
            : "Could not load replacement target."
        );
    } finally {
      if (applicable(controller) && request === importTargetRequest.current)
        setImportTargetLoading(false);
    }
  }
  function importDraft(next: SkillImportPreview) {
    const controller = lifetime.current;
    if (
      !controller ||
      !applicable(controller) ||
      next !== preview ||
      importLoading ||
      importTargetLoading ||
      (importTargetId !== null && importTarget?.id !== importTargetId) ||
      !canLeave()
    )
      return;
    const target = importTarget;
    resetSelection();
    setSelected(
      target
        ? { ...target, origin: "personal", availability: "available" }
        : null
    );
    setDetail(target);
    setDraft({
      ...createSkillDraft(accountId, target),
      files: next.package.files.map((file) => ({ ...file })),
    });
    closeImport(false);
  }
  async function viewLatest() {
    const id =
      draft?.sourceId ??
      (detail && !("resources" in detail) ? detail.id : null);
    const controller = lifetime.current,
      version = selection.current;
    if (!id || !controller || busy || !applicable(controller, version)) return;
    setBusy(true);
    try {
      const next = await apiGetPersonalSkill(id, controller.signal);
      if (applicable(controller, version)) setLatest(next);
    } catch (failure) {
      if (applicable(controller, version)) reportError(failure);
    } finally {
      if (applicable(controller, version)) setBusy(false);
    }
  }
  function reloadLatest() {
    if (!latest || busy || !canLeave()) return;
    setDraft(draft ? createSkillDraft(accountId, latest) : null);
    setDetail(latest);
    setFiles(latest.files);
    setConflict(false);
    setNameConflict(false);
    setLatest(null);
    setError(null);
    setDiagnostics([]);
  }
  return {
    selectionKey: selection.current,
    importSession,
    accountId,
    catalog,
    catalogError,
    loading,
    limits,
    selected,
    detail,
    files,
    detailLoading,
    draft,
    dirty,
    busy,
    error,
    diagnostics,
    success,
    conflict,
    nameConflict,
    latest,
    importOpen,
    preview,
    importLoading,
    importDiagnostics,
    importError,
    importTargetId,
    importTarget,
    importTargetLoading,
    selectImportTarget,
    refresh,
    select,
    create,
    changeDraft,
    discard,
    save,
    remove,
    readFile,
    copy,
    openImport,
    closeImport,
    previewImport,
    importDraft,
    viewLatest,
    reloadLatest,
    edit: () => {
      if (detail && !("resources" in detail))
        setDraft(createSkillDraft(accountId, detail));
    },
  };
}
