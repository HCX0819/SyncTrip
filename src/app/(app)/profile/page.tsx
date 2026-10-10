"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearTripSnapshots } from "@/lib/tripSnapshot";

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? null);
        setUserId(user.id);
        // email is not selectable on profiles; it comes from the auth session.
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .eq("id", user.id)
          .single();
        setDisplayName(profile?.display_name ?? "");
        setSavedName(profile?.display_name ?? "");
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const name = displayName.trim();
    if (!name) {
      setNameError("Name can't be empty.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
    setSavingName(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    setDisplayName(name);
    setSavedName(name);
  }

  async function handleSignOut() {
    clearTripSnapshots();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }
    clearTripSnapshots();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initial = (savedName || email || "")[0]?.toUpperCase();

  return (
    <div
      className="tab-content"
      style={{
        minHeight: "100dvh",
        padding: "60px 24px var(--tab-height)",
        maxWidth: "500px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "28px",
          fontWeight: 400,
          marginBottom: "24px",
        }}
      >
        Account
      </h1>

      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "var(--surface-2)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              color: "var(--accent)",
            }}
          >
            {initial ?? "👤"}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "16px", fontWeight: 500 }}>
              {loading ? "Loading…" : savedName || email || "Signed in User"}
            </p>
            {!loading && email && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{email}</p>
            )}
          </div>
        </div>

        {/* Display name */}
        <form onSubmit={handleSaveName} style={{ marginBottom: "20px" }}>
          <label
            htmlFor="display-name-input"
            style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
          >
            DISPLAY NAME
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="display-name-input"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              disabled={loading}
              placeholder="How your trip-mates see you"
            />
            <button
              id="save-display-name-btn"
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading || savingName || displayName.trim() === savedName}
              style={{ flexShrink: 0 }}
            >
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
          {nameError && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px" }}>{nameError}</p>}
        </form>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <button
            id="sign-out-btn"
            className="btn btn-danger btn-full"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>Delete account</p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
          You&apos;ll leave all your trips. Trips you own pass to the earliest member to join, or are
          deleted if you&apos;re the only member. This can&apos;t be undone.
        </p>
        {!showDelete ? (
          <button
            id="delete-account-btn"
            className="btn btn-danger btn-full"
            onClick={() => setShowDelete(true)}
          >
            Delete account
          </button>
        ) : (
          <div>
            <label
              htmlFor="delete-account-confirm"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              TYPE &ldquo;DELETE&rdquo; TO CONFIRM
            </label>
            <input
              id="delete-account-confirm"
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowDelete(false);
                  setDeleteConfirm("");
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-account-btn"
                className="btn btn-danger"
                style={{ flex: 2 }}
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirm !== "DELETE"}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        )}
        {deleteError && <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px" }}>{deleteError}</p>}
      </div>

      <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/privacy" style={{ color: "var(--text-muted)" }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: "var(--text-muted)" }}>
            Terms
          </Link>
        </div>
        SyncTrip v1.0 • Luxury Noir · Collaborative Travel
      </div>
    </div>
  );
}
