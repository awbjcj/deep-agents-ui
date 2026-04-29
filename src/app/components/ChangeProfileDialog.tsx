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

  const saveUsername = async () => {
    if (!usernameDirty) return;
    setIsSavingUsername(true);
    try {
      const result = await apiUpdateProfile({ username: trimmedUsername });
      updateUser(result);
      toast.success("Username updated");
      setNewUsername("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update username");
    } finally {
      setIsSavingUsername(false);
    }
  };

  const savePassword = async () => {
    if (!passwordDirty) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
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
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Signed in as {user?.username}.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="username">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="username">Username</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent value="username" className="space-y-3 pt-3">
            <Label htmlFor="newUsername">New username</Label>
            <Input
              id="newUsername"
              type="text"
              placeholder={user?.username ?? ""}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="off"
            />
            {usernameError && (
              <p className="text-xs text-destructive">{usernameError}</p>
            )}
            <Button
              onClick={saveUsername}
              disabled={isSavingUsername || !usernameDirty}
              className="w-full"
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
          </TabsContent>
          <TabsContent value="password" className="space-y-3 pt-3">
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrentPw}
              onToggle={() => setShowCurrentPw((value) => !value)}
              autoComplete="current-password"
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNewPw}
              onToggle={() => setShowNewPw((value) => !value)}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPw}
              onToggle={() => setShowConfirmPw((value) => !value)}
              autoComplete="new-password"
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
            <Button
              onClick={savePassword}
              disabled={isSavingPassword || !passwordDirty}
              className="w-full"
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
          className="pr-10"
        />
        <button
          type="button"
          onClick={props.onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
