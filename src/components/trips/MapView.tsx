"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { Category, ItineraryItem, SavedPlace, Trip, VoteValue } from "@/lib/types";
import { useOnlineStatus } from "@/components/layout/OfflineBanner";
import { addPlaceToDay, bySortOrder, planMoveToDay, saveDayOrder, tripTotalDays } from "@/lib/itinerary";
import { useItineraryItems } from "@/lib/useItineraryItems";
import { setVote } from "@/lib/votes";
import AddPlaceModal from "./AddPlaceModal";
import PlaceCommentsSheet from "./PlaceCommentsSheet";
import DayStrip, { type DayFilter } from "./map/DayStrip";
import PlaceActionCard from "./map/PlaceActionCard";
import { CATEGORY_STYLE, MAP_STYLES, ROUTE_COLOR, loadMapTheme, saveMapTheme, type MapTheme } from "./map/mapStyles";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  trip: Trip;
  places: SavedPlace[];
  currentUserId: string;
  /** Bumped by the trip page's background sync; reloads the itinerary. */
  syncTick?: number;
  /** Refreshes places (votes, comment counts) after a change here. */
  onUpdate: () => void;
}

type LngLatTuple = [number, number];

/** One pin on the map. In day mode pins are per itinerary stop, otherwise per place. */
interface MarkerSpec {
  key: string;
  placeId: string;
  lngLat: LngLatTuple;
  category: Category;
  /** Stop number within the selected day. */
  label?: number;
  /** Saved but not on any day. */
  faded?: boolean;
}

interface MarkerEntry {
  marker: Marker;
  el: HTMLDivElement;
  badge: HTMLDivElement;
}

const ROUTE_SOURCE = "day-route";
const KYOTO: LngLatTuple = [135.7681, 35.0116];
// Room for the overlays at the top and the place card at the bottom.
const FIT_PADDING = { top: 110, bottom: 200, left: 50, right: 70 };

const hasCoords = (p: SavedPlace) => p.latitude != null && p.longitude != null;
const lngLatOf = (p: SavedPlace): LngLatTuple => [p.longitude as number, p.latitude as number];

function routeGeoJSON(coords: LngLatTuple[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      coords.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
        : [],
  };
}

// Puts the day route on the map: adds the line (with a light casing for
// contrast) or updates its data. A theme switch replaces the style and drops
// these layers, so this also runs on every style load.
// Call only once the style has loaded (isStyleLoaded() stays false while tiles load).
function syncRoute(map: MapLibreMap, data: GeoJSON.FeatureCollection) {
  const source = map.getSource<GeoJSONSource>(ROUTE_SOURCE);
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(ROUTE_SOURCE, { type: "geojson", data });
  const layout = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: `${ROUTE_SOURCE}-casing`,
    type: "line",
    source: ROUTE_SOURCE,
    layout,
    paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: ROUTE_SOURCE,
    type: "line",
    source: ROUTE_SOURCE,
    layout,
    paint: { "line-color": ROUTE_COLOR, "line-width": 4 },
  });
}

function createMarkerElement(): { el: HTMLDivElement; badge: HTMLDivElement } {
  // Outer element is owned by MapLibre: it positions the marker by writing
  // `translate(...)` into `style.transform`. Never touch its transform
  // ourselves or the marker jumps to the map origin.
  const el = document.createElement("div");
  el.className = "map-pin";
  const badge = document.createElement("div");
  badge.className = "map-pin__badge";
  el.appendChild(badge);
  return { el, badge };
}

function paintMarker({ el, badge }: MarkerEntry, spec: MarkerSpec, selected: boolean) {
  const style = CATEGORY_STYLE[spec.category] ?? CATEGORY_STYLE.other;
  el.dataset.placeId = spec.placeId;
  el.classList.toggle("is-selected", selected);
  el.classList.toggle("is-faded", !!spec.faded);
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", spec.label ? `Stop ${spec.label}` : style.label);
  badge.style.background = style.color;
  badge.textContent = spec.label ? String(spec.label) : style.icon;
  badge.classList.toggle("is-numbered", !!spec.label);
}

export default function MapView({ trip, places, currentUserId, syncTick, onUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const [ready, setReady] = useState(false);

  const [theme, setTheme] = useState<MapTheme>(loadMapTheme);
  const appliedThemeRef = useRef(theme);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<SavedPlace | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const online = useOnlineStatus();

  const { items, setItems, supabase } = useItineraryItems(trip.id, syncTick);
  const totalDays = tripTotalDays(trip);
  const day: DayFilter = dayFilter === "all" ? "all" : Math.min(dayFilter, totalDays);

  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  // Itinerary stops per day (valid days only), in visit order.
  const stopsByDay = useMemo(() => {
    const byDay = new Map<number, ItineraryItem[]>();
    for (const item of items) {
      if (item.day_index < 1 || item.day_index > totalDays || !placeById.has(item.place_id)) continue;
      byDay.set(item.day_index, [...(byDay.get(item.day_index) ?? []), item]);
    }
    byDay.forEach((list) => list.sort(bySortOrder));
    return byDay;
  }, [items, totalDays, placeById]);

  const stopNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    stopsByDay.forEach((list) => list.forEach((item, idx) => numbers.set(item.id, idx + 1)));
    return numbers;
  }, [stopsByDay]);

  const itemsByPlace = useMemo(() => {
    const byPlace = new Map<string, ItineraryItem[]>();
    [...stopsByDay.keys()].sort((a, b) => a - b).forEach((d) =>
      stopsByDay.get(d)!.forEach((item) => byPlace.set(item.place_id, [...(byPlace.get(item.place_id) ?? []), item]))
    );
    return byPlace;
  }, [stopsByDay]);

  const specs = useMemo((): MarkerSpec[] => {
    if (day === "all") {
      return places.filter(hasCoords).map((p) => ({
        key: `p:${p.id}`,
        placeId: p.id,
        lngLat: lngLatOf(p),
        category: p.category,
        faded: !itemsByPlace.has(p.id),
      }));
    }
    return (stopsByDay.get(day) ?? []).flatMap((item) => {
      const p = placeById.get(item.place_id);
      if (!p || !hasCoords(p)) return [];
      return [{ key: `i:${item.id}`, placeId: p.id, lngLat: lngLatOf(p), category: p.category, label: stopNumbers.get(item.id) }];
    });
  }, [day, places, placeById, itemsByPlace, stopsByDay, stopNumbers]);

  const route = useMemo(() => routeGeoJSON(day === "all" ? [] : specs.map((s) => s.lngLat)), [day, specs]);
  const routeRef = useRef(route);
  // False from a style (re)load until its style.load event.
  const styleReadyRef = useRef(false);

  // Create the map once. Theme, pins and route are applied to it in place,
  // so the view (zoom/centre) survives every change.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const markers = markersRef.current;

    (async () => {
      try {
        const lib = await import("maplibre-gl");
        const container = containerRef.current;
        if (cancelled || !container) return;
        // The bundler breaks MapLibre's own worker lookup; serve it from public/
        // (copied there by scripts/copy-maplibre-worker.mjs).
        lib.setWorkerUrl(`/maplibre/${lib.getVersion()}/maplibre-gl-worker.mjs`);
        const map = new lib.Map({
          container,
          style: MAP_STYLES[appliedThemeRef.current],
          center: KYOTO,
          zoom: 12,
          maxZoom: 19,
          attributionControl: { compact: true },
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("style.load", () => {
          styleReadyRef.current = true;
          syncRoute(map, routeRef.current);
        });
        libRef.current = lib;
        mapRef.current = map;
        // Keep the canvas in sync when the container is resized (e.g. window maximized)
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(container);
        setReady(true);
      } catch (err) {
        console.error("Map initialization failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Theme: swap the style only (a full reload, then style.load re-adds the route).
  useEffect(() => {
    saveMapTheme(theme);
    if (!ready || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    styleReadyRef.current = false;
    mapRef.current?.setStyle(MAP_STYLES[theme], { diff: false });
  }, [ready, theme]);

  // Route line for the selected day.
  useEffect(() => {
    routeRef.current = route;
    if (ready && mapRef.current && styleReadyRef.current) syncRoute(mapRef.current, route);
  }, [ready, route]);

  // Pins: add, update and remove in place.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const markers = markersRef.current;
    const keys = new Set(specs.map((s) => s.key));
    markers.forEach((entry, key) => {
      if (keys.has(key)) return;
      entry.marker.remove();
      markers.delete(key);
    });
    for (const spec of specs) {
      let entry = markers.get(spec.key);
      if (!entry) {
        const { el, badge } = createMarkerElement();
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const placeId = el.dataset.placeId;
          if (placeId) setSelectedId(placeId);
        });
        const marker = new lib.Marker({ element: el }).setLngLat(spec.lngLat).addTo(map);
        entry = { marker, el, badge };
        markers.set(spec.key, entry);
      } else {
        entry.marker.setLngLat(spec.lngLat);
      }
      paintMarker(entry, spec, spec.placeId === selectedId);
    }
  }, [ready, specs, selectedId]);

  // Frame the pins on first load and whenever the day changes, not on every refresh.
  const framedRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    const frameKey = String(day);
    if (!ready || !map || !lib || framedRef.current === frameKey || specs.length === 0) return;
    const animate = framedRef.current !== null;
    framedRef.current = frameKey;
    if (specs.length === 1) {
      map.easeTo({ center: specs[0].lngLat, zoom: Math.max(map.getZoom(), 14), duration: animate ? 600 : 0 });
      return;
    }
    const bounds = new lib.LngLatBounds();
    specs.forEach((s) => bounds.extend(s.lngLat));
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 15, duration: animate ? 600 : 0 });
  }, [ready, day, specs]);

  const selectedPlace = selectedId ? placeById.get(selectedId) ?? null : null;
  const selectedItems = selectedPlace ? itemsByPlace.get(selectedPlace.id) ?? [] : [];

  function selectPlace(id: string | null) {
    setSelectedId(id);
    setActionError(null);
  }

  async function handleVote(value: VoteValue | undefined) {
    if (!selectedPlace) return;
    await setVote(supabase, selectedPlace.id, currentUserId, value);
    onUpdate();
  }

  // Moves the place's only slot to `target`, or adds it to `target`.
  async function handlePickDay(target: number) {
    if (!selectedPlace) return;
    setSaving(true);
    setActionError(null);
    if (selectedItems.length === 1) {
      const plan = planMoveToDay(items, selectedItems[0].id, target);
      if (plan) {
        const previous = items;
        setItems(plan.next);
        const error = await saveDayOrder(supabase, trip.id, target, plan.orderedIds);
        if (error) {
          setItems(previous);
          setActionError("Couldn't move it. Please try again.");
        }
      }
    } else {
      const added = await addPlaceToDay(supabase, trip.id, selectedPlace.id, target, items);
      if (added) setItems((prev) => [...prev, added]);
      else setActionError("Couldn't add it. Please try again.");
    }
    setSaving(false);
    onUpdate();
  }

  const placesWithCoords = places.filter(hasCoords);
  const banner =
    placesWithCoords.length === 0
      ? { text: "No places pinned on this trip yet.", add: true }
      : day !== "all" && specs.length === 0
        ? { text: `Nothing on Day ${day} yet. Tap a pin in All and choose “Add to day”.`, add: false }
        : null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        flex: 1, // grow to fill parent flex column
        minHeight: 0, // allow flex shrink
        background: "var(--noir-bg)",
        overflow: "hidden", // prevent map canvas from bleeding out
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Top overlay: theme toggle + day strip */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          right: "56px",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "auto", minWidth: 0 }}>
          <div
            role="group"
            aria-label="Map style"
            style={{
              display: "flex",
              flexShrink: 0,
              gap: "2px",
              background: "rgba(255,253,249,0.94)",
              backdropFilter: "blur(8px)",
              padding: "3px",
              borderRadius: "99px",
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--noir-border-strong)",
            }}
          >
            {(
              [
                { id: "light", label: "☀️", title: "Light map" },
                { id: "dark", label: "🌙", title: "Dark map" },
              ] as { id: MapTheme; label: string; title: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                aria-pressed={theme === opt.id}
                aria-label={opt.title}
                title={opt.title}
                style={{
                  width: 30,
                  height: 26,
                  borderRadius: "99px",
                  border: "none",
                  fontSize: "13px",
                  cursor: "pointer",
                  background: theme === opt.id ? "var(--gold)" : "transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <DayStrip
              startDate={trip.start_date}
              totalDays={totalDays}
              value={day}
              onChange={(value) => {
                setDayFilter(value);
                setActionError(null);
              }}
            />
          </div>
        </div>

        {banner && (
          <div
            style={{
              alignSelf: "center",
              pointerEvents: "auto",
              background: "rgba(255,253,249,0.94)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--noir-border-strong)",
              borderRadius: "99px",
              padding: "6px 8px 6px 16px",
              fontSize: "13px",
              color: "var(--noir-text)",
              boxShadow: "var(--shadow-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              maxWidth: "100%",
            }}
          >
            <span>📍 {banner.text}</span>
            {banner.add && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAdd(true)}
                disabled={!online}
                style={{ flexShrink: 0 }}
              >
                + Add place
              </button>
            )}
          </div>
        )}
      </div>

      {selectedPlace && (
        <PlaceActionCard
          key={selectedPlace.id}
          place={selectedPlace}
          placeItems={selectedItems}
          stopNumbers={stopNumbers}
          totalDays={totalDays}
          currentUserId={currentUserId}
          online={online}
          saving={saving}
          error={actionError}
          onVote={handleVote}
          onPickDay={handlePickDay}
          onComments={() => setCommentsFor(selectedPlace)}
          onClose={() => selectPlace(null)}
        />
      )}

      {commentsFor && (
        <PlaceCommentsSheet
          placeId={commentsFor.id}
          tripId={trip.id}
          placeTitle={commentsFor.title}
          currentUserId={currentUserId}
          onClose={() => setCommentsFor(null)}
          onChanged={onUpdate}
        />
      )}

      {showAdd && (
        <AddPlaceModal
          tripId={trip.id}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}
