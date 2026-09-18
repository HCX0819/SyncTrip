"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Category, SavedPlace } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  place: SavedPlace;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "stay", label: "🏨 Stay" },
  { value: "eat", label: "🍜 Eat" },
  { value: "do", label: "🎯 Do" },
  { value: "other", label: "⋯ Other" },
];

export default function EditPlaceModal({ place, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(place.photo_url);
  const [geocoding, setGeocoding] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<
    { id: string; place_name: string; text: string; geometry: { coordinates: [number, number] } }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: place.title,
    category: place.category,
    source_url: place.source_url || "",
    note: place.note || "",
    address: place.address || "",
    latitude: place.latitude,
    longitude: place.longitude,
    photo_url: place.photo_url || "",
  });

  const supabase = createClient();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleAddressInput(value: string) {
    setForm((prev) => ({ ...prev, address: value, latitude: null, longitude: null }));
    if (value.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setGeocoding(true);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const hasValidCustomToken =
        token && token.startsWith("pk.") && !token.includes("placeholder");

      if (hasValidCustomToken) {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${token}&types=place,poi,address&limit=5`
        );
        const data = await res.json();
        setAddressSuggestions(data.features ?? []);
      } else {
        // Free OpenStreetMap geocoding fallback
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5`
        );
        const data = await res.json();
        const formatted = (data || []).map(
          (item: { place_id: number; display_name: string; name?: string; lat: string; lon: string }) => ({
            id: String(item.place_id),
            place_name: item.display_name,
            text: item.name || item.display_name.split(",")[0],
            geometry: {
              coordinates: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
            },
          })
        );
        setAddressSuggestions(formatted);
      }
    } catch {
      setAddressSuggestions([]);
    } finally {
      setGeocoding(false);
    }
  }

  function selectSuggestion(f: { place_name: string; geometry: { coordinates: [number, number] } }) {
    setForm((prev) => ({
      ...prev,
      address: f.place_name,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
    }));
    setAddressSuggestions([]);
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);

    const ext = file.name.split(".").pop();
    const path = `places/${place.trip_id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from("photos")
      .upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("photos").getPublicUrl(path);
      setForm((prev) => ({ ...prev, photo_url: urlData.publicUrl }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error: updateErr } = await supabase
        .from("saved_places")
        .update({
          title: form.title,
          category: form.category,
          source_url: form.source_url || null,
          note: form.note || null,
          photo_url: form.photo_url || null,
          address: form.address || null,
          latitude: form.latitude,
          longitude: form.longitude,
        })
        .eq("id", place.id);

      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      onSaved();
    });
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to remove "${place.title}" from this trip?`)) return;

    setIsDeleting(true);
    const { error: delErr } = await supabase
      .from("saved_places")
      .delete()
      .eq("id", place.id);

    setIsDeleting(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }

    onSaved();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "22px",
              fontWeight: 400,
            }}
          >
            Edit place
          </h2>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleDelete}
            disabled={isPending || isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "18px" }}
        >
          {/* Title */}
          <div>
            <label
              htmlFor="edit-place-title"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              NAME *
            </label>
            <input
              id="edit-place-title"
              className="input"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
            />
          </div>

          {/* Category */}
          <div>
            <label
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.08em" }}
            >
              CATEGORY
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  id={`edit-cat-${cat.value}`}
                  onClick={() => setForm((prev) => ({ ...prev, category: cat.value }))}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "99px",
                    border: "1px solid",
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.18s",
                    background: form.category === cat.value ? "var(--accent-dim)" : "transparent",
                    borderColor: form.category === cat.value ? "var(--accent)" : "var(--border)",
                    color: form.category === cat.value ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div>
            <label
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.08em" }}
            >
              PHOTO
            </label>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              {photoPreview && (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "var(--radius-sm)",
                    backgroundImage: `url(${photoPreview})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  type="button"
                  id="edit-upload-photo-btn"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? "Change photo" : "Upload photo"}
                </button>
                <input
                  id="edit-photo-url"
                  className="input"
                  name="photo_url"
                  placeholder="or paste image URL"
                  value={form.photo_url}
                  onChange={(e) => {
                    handleChange(e);
                    setPhotoPreview(e.target.value || null);
                  }}
                />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoFile}
            />
          </div>

          {/* Address */}
          <div style={{ position: "relative" }}>
            <label
              htmlFor="edit-place-address"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              LOCATION {geocoding && <span style={{ color: "var(--accent)" }}>searching…</span>}
              {form.latitude && <span style={{ color: "var(--accent)", marginLeft: "8px" }}>📍 Pinned</span>}
            </label>
            <input
              id="edit-place-address"
              className="input"
              placeholder="Search address or location"
              value={form.address}
              onChange={(e) => handleAddressInput(e.target.value)}
              autoComplete="off"
            />
            {addressSuggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  marginTop: "4px",
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                {addressSuggestions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => selectSuggestion(f)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "12px 16px",
                      background: "none",
                      border: "none",
                      color: "var(--text)",
                      textAlign: "left",
                      fontSize: "13px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "var(--surface)")}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "none")}
                  >
                    <span style={{ color: "var(--text)" }}>{f.text}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>
                      {f.place_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source URL */}
          <div>
            <label
              htmlFor="edit-source-url"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              SOURCE LINK
            </label>
            <input
              id="edit-source-url"
              className="input"
              name="source_url"
              type="url"
              placeholder="Instagram, TikTok, Google Maps URL…"
              value={form.source_url}
              onChange={handleChange}
            />
          </div>

          {/* Note */}
          <div>
            <label
              htmlFor="edit-place-note"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              NOTE
            </label>
            <textarea
              id="edit-place-note"
              className="input"
              name="note"
              placeholder="Notes or recommendations"
              value={form.note}
              onChange={handleChange}
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--red)", fontSize: "13px" }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: "12px", paddingTop: "4px" }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="update-place-btn"
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
