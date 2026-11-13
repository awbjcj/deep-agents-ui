"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUpdateProfile } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

interface ChangeProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeProfileDialog({
  open,
  onOpenChange,
}: ChangeProfileDialogProps) {
  const { user, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [usernameSaveError, setUsernameSaveError] = useState("");
  const [passwordSaveError, setPasswordSaveError] = useState("");
  const lastOpenRef = useRef(open);

  useEffect(() => {
    if (lastOpenRef.current && !open) {
      setNewUsername("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPw(false);
      setShowNewPw(false);
      setShowConfirmPw(false);
      setUsernameSaveError("");
      setPasswordSaveError("");
    }
    lastOpenRef.current = open;
  }, [open]);

  const trimmedUsername = newUsername.trim();
  const usernameError =
    trimmedUsername.length === 0
      ? ""
      : trimmedUsername.length < 3
      ? "Username must be at least 3 characters"
      : !USERNAME_PATTERN.test(trimmedUsername)
      ? "Letters, digits, underscores, hyphens, and dots only"
      : "";
  const usernameDirty =
    !!trimmedUsername && trimmedUsername !== user?.username && !usernameError;
  const passwordDirty = !!currentPassword && !!newPassword && !!confirmPassword;
  const passwordError =
    newPassword && newPassword.length < 8 ? "Use at least 8 characters." : "";
  const confirmationError =
    confirmPassword && newPassword !== confirmPassword
      ? "Passwords do not match."
      : "";
  const hasEdits =
    !!newUsername || !!currentPassword || !!newPassword || !!confirmPassword;
  const changeOpen = (next: boolean) => {
    if (!next && (isSavingUsername || isSavingPassword)) return;
    if (
      !next &&
      hasEdits &&
      !window.confirm("Discard unsaved account changes?")
    )
      return;
    onOpenChange(next);
  };

  const saveUsername = async () => {
    if (!usernameDirty) return;
    setUsernameSaveError("");
    setIsSavingUsername(true);
    try {
      const result = await apiUpdateProfile({ username: trimmedUsername });
      updateUser(result);
      toast.success("Username updated");
      setNewUsername("");
    } catch (err) {
      setUsernameSaveError(
        err instanceof Error
          ? err.message
          : "Could not update your username. Try again."
      );
    } finally {
      setIsSavingUsername(false);
    }
  };

  const savePassword = async () => {
    if (!passwordDirty) return;
    setPasswordSaveError("");
    if (newPassword !== confirmPassword) {
      document.getElementById("confirm-password")?.focus();
      return;
    }
    if (newPassword.length < 8) {
      document.getElementById("new-password")?.focus();
      return;
    }
    setIsSavingPassword(true);
    try {
      const result = await apiUpdateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      updateUser(result);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordSaveError(
        err instanceof Error
          ? err.message
          : "Could not update your password. Try again."
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Signed in as {user?.username}.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="username">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="username">Username</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent
            value="username"
            className="space-y-3 pt-3"
          >
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveUsername();
              }}
            >
              <Label htmlFor="newUsername">New username</Label>
              <Input
                id="newUsername"
                type="text"
                value={newUsername}
                onChange={(e) => {
                  setNewUsername(e.target.value);
                  setUsernameSaveError("");
                }}
                autoComplete="username"
                aria-invalid={!!usernameError}
                aria-describedby={
                  usernameError ? "username-error" : "username-hint"
                }
                disabled={isSavingUsername}
                required
              />
              <p
                id="username-hint"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                At least 3 characters. Use letters, digits, underscores,
                hyphens, or dots.
              </p>
              {usernameError && (
                <p
                  id="username-error"
                  className="text-xs text-destructive"
                >
                  {usernameError}
                </p>
              )}
              {usernameSaveError && (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {usernameSaveError}
                </p>
              )}
              <Button
                type="submit"
                disabled={isSavingUsername || !usernameDirty}
                className="min-h-touch w-full"
              >
                {isSavingUsername ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save username
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
          <TabsContent
            value="password"
            className="space-y-3 pt-3"
          >
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void savePassword();
              }}
            >
              <p className="text-xs leading-relaxed text-muted-foreground">
                Use at least 8 characters for your new password.
              </p>
              <fieldset
                disabled={isSavingPassword}
                className="min-w-0 space-y-3"
              >
                <PasswordField
                  id="current-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={(value) => {
                    setCurrentPassword(value);
                    setPasswordSaveError("");
                  }}
                  show={showCurrentPw}
                  onToggle={() => setShowCurrentPw((value) => !value)}
                  autoComplete="current-password"
                />
                <PasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={(value) => {
                    setNewPassword(value);
                    setPasswordSaveError("");
                  }}
                  error={passwordError}
                  show={showNewPw}
                  onToggle={() => setShowNewPw((value) => !value)}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    setPasswordSaveError("");
                  }}
                  error={confirmationError}
                  show={showConfirmPw}
                  onToggle={() => setShowConfirmPw((value) => !value)}
                  autoComplete="new-password"
                />
                {passwordSaveError && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {passwordSaveError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isSavingPassword || !passwordDirty}
                  className="min-h-touch w-full"
                >
                  {isSavingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save password
                    </>
                  )}
                </Button>
              </fieldset>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={props.show ? "text" : "password"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete={props.autoComplete}
          required
          aria-invalid={!!props.error}
          aria-describedby={props.error ? `${props.id}-error` : undefined}
          className="pr-12"
        />
        <button
          type="button"
          onClick={props.onToggle}
          className="absolute right-0 top-1/2 flex size-touch -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={props.show ? "Hide password" : "Show password"}
          aria-pressed={props.show}
        >
          {props.show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {props.error && (
        <p
          id={`${props.id}-error`}
          className="text-xs text-destructive"
        >
          {props.error}
        </p>
      )}
    </div>
  );
}
