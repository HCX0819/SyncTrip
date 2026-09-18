"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Category } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "stay", label: "🏨 Stay" },
  { value: "eat", label: "🍜 Eat" },
  { value: "do", label: "🎯 Do" },
  { value: "other", label: "⋯ Other" },
];

export default function AddPlaceModal({ tripId, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<MapboxFeature[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    category: "do" as Category,
    source_url: "",
    note: "",
    address: "",
    latitude: null as number | null,
    longitude: null as number | null,
    photo_url: "",
  });

  const supabase = createClient();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeAbort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
      geocodeAbort.current?.abort();
    },
    []
  );

  function handleAddressInput(value: string) {
    setForm((prev) => ({ ...prev, address: value, latitude: null, longitude: null }));
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeAbort.current?.abort();
    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      setGeocoding(false);
      return;
    }
    setGeocoding(true);
    geocodeTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      geocodeAbort.current = controller;
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        const data: MapboxFeature[] = res.ok ? await res.json() : [];
        if (!controller.signal.aborted) setAddressSuggestions(data);
      } catch {
        if (!controller.signal.aborted) setAddressSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setGeocoding(false);
      }
    }, 400);
  }

  function selectSuggestion(f: MapboxFeature) {
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

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop();
    const path = `places/${tripId}/${Date.now()}.${ext}`;
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("saved_places").insert({
        trip_id: tripId,
        added_by: user.id,
        title: form.title,
        category: form.category,
        source_url: form.source_url || null,
        note: form.note || null,
        photo_url: form.photo_url || null,
        address: form.address || null,
        latitude: form.latitude,
        longitude: form.longitude,
      });

      if (error) {
        setError(error.message);
        return;
      }

      onSaved();
    });
  }

  if (!mounted) return null;

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
          Add a place
        </h2>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "18px" }}
        >
          {/* Title */}
          <div>
            <label
              htmlFor="place-title"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              NAME *
            </label>
            <input
              id="place-title"
              className="input"
              name="title"
              placeholder="e.g. Ichiran Ramen Shinjuku"
              value={form.title}
              onChange={handleChange}
              required
              autoFocus
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
                  id={`cat-${cat.value}`}
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

          {/* Photo upload */}
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
                  id="upload-photo-btn"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? "Change photo" : "Upload photo"}
                </button>
                <input
                  id="photo-url"
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
              htmlFor="place-address"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              LOCATION {geocoding && <span style={{ color: "var(--accent)" }}>searching…</span>}
              {form.latitude && <span style={{ color: "var(--accent)", marginLeft: "8px" }}>📍 Pinned</span>}
            </label>
            <input
              id="place-address"
              className="input"
              placeholder="Search for an address or place"
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
              htmlFor="source-url"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              SOURCE LINK
            </label>
            <input
              id="source-url"
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
              htmlFor="place-note"
              style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.08em" }}
            >
              NOTE
            </label>
            <textarea
              id="place-note"
              className="input"
              name="note"
              placeholder="Why do you want to go here?"
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
              id="save-place-btn"
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save place"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  geometry: { coordinates: [number, number] };
}
