"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Trip, TripMember } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { uploadTripPhoto } from "@/lib/uploadPhoto";

interface Props {
  trip: Trip;
  members: TripMember[];
  currentUserId: string;
  onClose: () => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "var(--text-muted)",
  marginBottom: "6px",
  letterSpacing: "0.08em",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  marginBottom: "12px",
};

const errorStyle: React.CSSProperties = { color: "var(--red)", fontSize: "13px", marginTop: "10px" };

function memberName(m: TripMember) {
  return m.profile?.display_name || "Traveller";
}

export default function TripSettingsSheet({ trip, members, currentUserId, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = members.some((m) => m.user_id === currentUserId && m.role === "owner");

  const [form, setForm] = useState({
    name: trip.name,
    destination: trip.destination,
    start_date: trip.start_date || "",
    end_date: trip.end_date || "",
    cover_url: trip.cover_url || "",
  });
  // Which action is in flight, so only that button shows a spinner label.
  const [busy, setBusy] = useState<
    "save" | "upload" | "remove" | "leave" | "delete" | "duplicate" | "template" | null
  >(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isPublicTemplate, setIsPublicTemplate] = useState(!!trip.is_public_template);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ name: `${trip.name} (copy)`, start_date: "" });
  const [copyError, setCopyError] = useState<string | null>(null);

  // Ownership passes to whoever joined first among the remaining members.
  const successor = [...members]
    .filter((m) => m.user_id !== currentUserId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id))[0];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDetailsSaved(false);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    setDetailsError(null);
    setDetailsSaved(false);
    try {
      const url = await uploadTripPhoto(supabase, trip.id, file);
      setForm((prev) => ({ ...prev, cover_url: url }));
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setDetailsError(null);
    setDetailsSaved(false);

    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setDetailsError("End date can't be before the start date.");
      return;
    }

    setBusy("save");
    const { data, error } = await supabase
      .from("trips")
      .update({
        name: form.name.trim(),
        destination: form.destination.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        cover_url: form.cover_url || null,
      })
      .eq("id", trip.id)
      .select("id");
    setBusy(null);

    // RLS turns a forbidden update into zero affected rows rather than an error.
    if (error || !data?.length) {
      setDetailsError(error?.message ?? "Only the trip owner can edit this trip.");
      return;
    }

    setDetailsSaved(true);
    router.refresh();
  }

  async function handleRemove(member: TripMember) {
    if (!confirm(`Remove ${memberName(member)} from ${trip.name}?`)) return;
    setBusy("remove");
    setMembersError(null);
    const { error } = await supabase.rpc("remove_member", {
      p_trip_id: trip.id,
      p_user_id: member.user_id,
    });
    setBusy(null);
    if (error) {
      setMembersError(error.message);
      return;
    }
    router.refresh();
  }

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault();
    setBusy("duplicate");
    setCopyError(null);
    const { data, error } = await supabase.rpc("duplicate_trip", {
      p_trip_id: trip.id,
      p_name: duplicateForm.name.trim(),
      p_start_date: duplicateForm.start_date || null,
    });
    if (error || !data) {
      setBusy(null);
      setCopyError(error?.message ?? "Couldn't duplicate this trip.");
      return;
    }
    router.push(`/trips/${data}`);
    onClose();
  }

  async function handleTemplateToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setBusy("template");
    setCopyError(null);
    const { data, error } = await supabase
      .from("trips")
      .update({ is_public_template: next })
      .eq("id", trip.id)
      .select("id");
    setBusy(null);
    if (error || !data?.length) {
      setCopyError(error?.message ?? "Only the trip owner can share this trip as a template.");
      return;
    }
    setIsPublicTemplate(next);
    router.refresh();
  }

  async function handleLeave() {
    let message = `Leave ${trip.name}? You'll need a new invite link to rejoin.`;
    if (!successor) {
      message = `You're the only member, so leaving will delete ${trip.name} and everything in it.`;
    } else if (isOwner) {
      message = `Leave ${trip.name}? Ownership will pass to ${memberName(successor)}, the earliest member to join.`;
    }
    if (!confirm(message)) return;

    setBusy("leave");
    setDangerError(null);
    const { error } = await supabase.rpc("leave_trip", { p_trip_id: trip.id });
    if (error) {
      setBusy(null);
      setDangerError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleDelete() {
    if (deleteConfirm !== trip.name) return;
    setBusy("delete");
    setDangerError(null);
    const { data, error } = await supabase.from("trips").delete().eq("id", trip.id).select("id");
    if (error || !data?.length) {
      setBusy(null);
      setDangerError(error?.message ?? "Only the trip owner can delete this trip.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Only rendered after a click (never during SSR), so document is available.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "22px",
            fontWeight: 400,
            marginBottom: "24px",
          }}
        >
          Trip settings
        </h2>

        {/* Details (owner only) */}
        {isOwner && (
          <form onSubmit={handleSave} style={{ marginBottom: "32px" }}>
            <p style={sectionTitleStyle}>DETAILS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label htmlFor="settings-trip-name" style={labelStyle}>
                  NAME *
                </label>
                <input
                  id="settings-trip-name"
                  className="input"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label htmlFor="settings-trip-destination" style={labelStyle}>
                  DESTINATION *
                </label>
                <input
                  id="settings-trip-destination"
                  className="input"
                  name="destination"
                  value={form.destination}
                  onChange={handleChange}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="settings-start-date" style={labelStyle}>
                    START
                  </label>
                  <input
                    id="settings-start-date"
                    className="input"
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleChange}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="settings-end-date" style={labelStyle}>
                    END
                  </label>
                  <input
                    id="settings-end-date"
                    className="input"
                    type="date"
                    name="end_date"
                    value={form.end_date}
                    min={form.start_date || undefined}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Cover photo */}
              <div>
                <label style={labelStyle}>COVER PHOTO</label>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  {form.cover_url && (
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "var(--radius-sm)",
                        backgroundImage: `url(${form.cover_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <button
                    type="button"
                    id="settings-upload-cover-btn"
                    className="btn btn-ghost btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy !== null}
                  >
                    {busy === "upload" ? "Uploading…" : form.cover_url ? "Change photo" : "Upload photo"}
                  </button>
                  {form.cover_url && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setDetailsSaved(false);
                        setForm((prev) => ({ ...prev, cover_url: "" }));
                      }}
                      disabled={busy !== null}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleCoverFile}
                />
              </div>
            </div>

            {detailsError && <p style={errorStyle}>{detailsError}</p>}

            <button
              id="save-trip-btn"
              type="submit"
              className="btn btn-primary btn-full"
              style={{ marginTop: "16px" }}
              disabled={busy !== null}
            >
              {busy === "save" ? "Saving…" : detailsSaved ? "Saved ✓" : "Save changes"}
            </button>
          </form>
        )}

        {/* Members */}
        <div style={{ marginBottom: "32px" }}>
          <p style={sectionTitleStyle}>MEMBERS · {members.length}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    position: "relative",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {memberName(m)[0].toUpperCase()}
                  {m.profile?.avatar_url && (
                    // Avatars come from OAuth providers outside images.remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.profile.avatar_url}
                      alt=""
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {memberName(m)}
                    {m.user_id === currentUserId && (
                      <span style={{ color: "var(--text-muted)" }}> (you)</span>
                    )}
                  </p>
                </div>
                {m.role === "owner" && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "var(--accent-dim)",
                      borderRadius: "99px",
                      padding: "3px 10px",
                      flexShrink: 0,
                    }}
                  >
                    Owner
                  </span>
                )}
                {isOwner && m.role !== "owner" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRemove(m)}
                    disabled={busy !== null}
                    style={{ flexShrink: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {membersError && <p style={errorStyle}>{membersError}</p>}
        </div>

        {/* Copy / template */}
        <div style={{ marginBottom: "32px" }}>
          <p style={sectionTitleStyle}>COPY</p>
          {isOwner && (
            <label
              htmlFor="public-template-toggle"
              style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "16px", cursor: "pointer" }}
            >
              <input
                id="public-template-toggle"
                type="checkbox"
                checked={isPublicTemplate}
                onChange={handleTemplateToggle}
                disabled={busy !== null}
                style={{ marginTop: "3px", accentColor: "var(--blue)" }}
              />
              <span>
                <span style={{ display: "block", fontSize: "14px", color: "var(--text)" }}>
                  Share as public template
                </span>
                <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Anyone on SyncTrip can see the name, destination, places and days, and copy them. Notes and
                  members stay private.
                </span>
              </span>
            </label>
          )}

          {duplicateOpen ? (
            <form onSubmit={handleDuplicate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label htmlFor="duplicate-trip-name" style={labelStyle}>
                  NEW TRIP NAME *
                </label>
                <input
                  id="duplicate-trip-name"
                  className="input"
                  value={duplicateForm.name}
                  onChange={(e) => setDuplicateForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="duplicate-start-date" style={labelStyle}>
                  START DATE
                </label>
                <input
                  id="duplicate-start-date"
                  className="input"
                  type="date"
                  value={duplicateForm.start_date}
                  onChange={(e) => setDuplicateForm((prev) => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                Copies places, the itinerary and checklists (not votes or comments) into a new trip that you own.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDuplicateOpen(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </button>
                <button
                  id="duplicate-trip-submit"
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={busy !== null || !duplicateForm.name.trim()}
                >
                  {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
                </button>
              </div>
            </form>
          ) : (
            <button
              id="duplicate-trip-btn"
              type="button"
              className="btn btn-ghost btn-full"
              onClick={() => setDuplicateOpen(true)}
              disabled={busy !== null}
            >
              Duplicate trip
            </button>
          )}
          {copyError && <p style={errorStyle}>{copyError}</p>}
        </div>

        {/* Print / export */}
        <div style={{ marginBottom: "32px" }}>
          <p style={sectionTitleStyle}>PRINT / EXPORT</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <a id="print-trip-link" href={`/trips/${trip.id}/print`} className="btn btn-ghost btn-sm">
              🖨 Print itinerary
            </a>
            {trip.start_date ? (
              <a
                id="download-ics-link"
                href={`/api/trips/${trip.id}/calendar`}
                download
                className="btn btn-ghost btn-sm"
              >
                📅 Download .ics
              </a>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" disabled>
                📅 Download .ics
              </button>
            )}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>
            {trip.start_date
              ? "Import the .ics file into Google, Apple or Outlook calendar."
              : "Set trip dates to export the itinerary to a calendar."}
          </p>
        </div>

        {/* Leave / delete */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
          <button
            id="leave-trip-btn"
            type="button"
            className="btn btn-danger btn-full"
            onClick={handleLeave}
            disabled={busy !== null}
          >
            {busy === "leave" ? "Leaving…" : "Leave trip"}
          </button>
          {isOwner && (
            <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>
              {successor
                ? `If you leave, ${memberName(successor)} becomes the owner (earliest member to join).`
                : "You're the only member, so leaving deletes the trip."}
            </p>
          )}

          {isOwner && (
            <div style={{ marginTop: "24px" }}>
              <label htmlFor="delete-trip-confirm" style={labelStyle}>
                DELETE TRIP — TYPE &ldquo;{trip.name}&rdquo; TO CONFIRM
              </label>
              <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>
                This permanently removes the trip, its places, votes and itinerary for everyone.
              </p>
              <input
                id="delete-trip-confirm"
                className="input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={trip.name}
                autoComplete="off"
              />
              <button
                id="delete-trip-btn"
                type="button"
                className="btn btn-danger btn-full"
                style={{ marginTop: "10px" }}
                onClick={handleDelete}
                disabled={busy !== null || deleteConfirm !== trip.name}
              >
                {busy === "delete" ? "Deleting…" : "Delete trip"}
              </button>
            </div>
          )}

          {dangerError && <p style={errorStyle}>{dangerError}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
