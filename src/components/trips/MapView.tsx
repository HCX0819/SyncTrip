"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedPlace } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  places: SavedPlace[];
}

// 1. Google Maps Classic Roadmap style
const GOOGLE_CLASSIC_STYLE = {
  version: 8 as const,
  sources: {
    "google-maps": {
      type: "raster" as const,
      tiles: [
        "https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
        "https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
        "https://mt2.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
        "https://mt3.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
      ],
      tileSize: 256,
      attribution: "&copy; Google Maps",
    },
  },
  layers: [
    {
      id: "google-maps-layer",
      type: "raster" as const,
      source: "google-maps",
      minzoom: 0,
      maxzoom: 18, // Google tiles reliably available up to 18
    },
  ],
};

// 2. Dark Canvas style
const DARK_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "dark-base": {
      type: "raster" as const,
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.esri.com" target="_blank">Esri</a> &copy; OpenStreetMap',
    },
    "dark-labels": {
      type: "raster" as const,
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "dark-base-layer",
      type: "raster" as const,
      source: "dark-base",
      minzoom: 0,
      maxzoom: 16, // ArcGIS dark canvas reliable up to 16
    },
    {
      id: "dark-labels-layer",
      type: "raster" as const,
      source: "dark-labels",
      minzoom: 0,
      maxzoom: 16,
    },
  ],
};

type MapTheme = "google" | "dark";

export default function MapView({ places }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [selectedPlace, setSelectedPlace] = useState<SavedPlace | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");

  // Memoize so the map effect does not re-run (and rebuild the map) on every render
  const placesWithCoords = useMemo(
    () => places.filter((p) => p.latitude != null && p.longitude != null),
    [places]
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      try {
        const maplibregl = await import("maplibre-gl");

        // Default center: average of places or Kyoto
        let center: [number, number] = [135.7681, 35.0116];
        if (placesWithCoords.length > 0) {
          const avgLng =
            placesWithCoords.reduce((acc, p) => acc + (p.longitude as number), 0) /
            placesWithCoords.length;
          const avgLat =
            placesWithCoords.reduce((acc, p) => acc + (p.latitude as number), 0) /
            placesWithCoords.length;
          center = [avgLng, avgLat];
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: mapTheme === "google" ? GOOGLE_CLASSIC_STYLE : DARK_MAP_STYLE,
          center: center,
          zoom: placesWithCoords.length > 1 ? 12 : 13,
          maxZoom: 18, // prevent blank-tile glitch beyond tile availability
        });

        mapRef.current = map;

        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right"
        );

        // Add markers for places (styled like Google Maps POI badges)
        placesWithCoords.forEach((place) => {
          // Outer element is owned by MapLibre: it positions the marker by
          // writing `translate(...)` into `style.transform`. Never touch its
          // transform ourselves or the marker jumps to the map origin.
          const el = document.createElement("div");
          el.className = "custom-map-marker";
          el.style.width = "34px";
          el.style.height = "34px";
          el.style.cursor = "pointer";

          // Inner element carries the visuals and the hover scale animation.
          const badge = document.createElement("div");
          badge.style.width = "100%";
          badge.style.height = "100%";
          badge.style.borderRadius = "50%";
          badge.style.display = "flex";
          badge.style.alignItems = "center";
          badge.style.justifyContent = "center";
          badge.style.boxShadow = "0 3px 12px rgba(0,0,0,0.35)";
          badge.style.border = "2.5px solid #ffffff";
          badge.style.fontSize = "16px";
          badge.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
          el.appendChild(badge);

          // Google Maps category palette
          if (place.category === "stay") {
            badge.style.background = "#E91E63"; // Pink / Hotel Lodging
            badge.innerText = "🏨";
          } else if (place.category === "eat") {
            badge.style.background = "#FF7043"; // Orange / Dining
            badge.innerText = "🍜";
          } else if (place.category === "do") {
            badge.style.background = "#1E88E5"; // Blue / Activity & Sightseeing
            badge.innerText = "🎯";
          } else {
            badge.style.background = "#00897B"; // Teal / General POI
            badge.innerText = "📍";
          }

          el.addEventListener("mouseenter", () => {
            badge.style.transform = "scale(1.3)";
          });
          el.addEventListener("mouseleave", () => {
            badge.style.transform = "scale(1)";
          });

          el.addEventListener("click", () => {
            if (isMounted) {
              setSelectedPlace(place);
            }
          });

          new maplibregl.Marker({ element: el })
            .setLngLat([place.longitude as number, place.latitude as number])
            .addTo(map);
        });

        if (placesWithCoords.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          placesWithCoords.forEach((p) =>
            bounds.extend([p.longitude as number, p.latitude as number])
          );
          map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
        }

        // Keep the canvas in sync when the container is resized (e.g. window maximized)
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(mapContainerRef.current!);
      } catch (err) {
        console.error("Map initialization failed:", err);
      }
    }

    let resizeObserver: ResizeObserver | null = null;

    initMap();

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (
        mapRef.current &&
        typeof (mapRef.current as { remove?: () => void }).remove === "function"
      ) {
        (mapRef.current as { remove: () => void }).remove();
      }
    };
  }, [placesWithCoords, mapTheme]);

  const totalYaay =
    selectedPlace?.votes?.filter((v) => v.value === "yaay").length ?? 0;
  const totalNaay =
    selectedPlace?.votes?.filter((v) => v.value === "naay").length ?? 0;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        flex: 1,             // grow to fill parent flex column
        minHeight: 0,        // allow flex shrink
        background: "var(--noir-bg)",
        overflow: "hidden",  // prevent map canvas from bleeding out
      }}
    >
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Style Switcher Toggle */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 10,
          display: "flex",
          gap: "4px",
          background: "rgba(255,253,249,0.9)",
          backdropFilter: "blur(8px)",
          padding: "4px",
          borderRadius: "99px",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--noir-border-strong)",
        }}
      >
        {(
          [
            { id: "google", label: "🗺️ Google Maps" },
            { id: "dark", label: "🌙 Dark" },
          ] as { id: MapTheme; label: string }[]
        ).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setMapTheme(opt.id)}
            style={{
              padding: "5px 12px",
              borderRadius: "99px",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              background: mapTheme === opt.id ? "var(--gold)" : "transparent",
              color: mapTheme === opt.id ? "#fffdf9" : "var(--text-muted)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Empty places badge banner */}
      {placesWithCoords.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,253,249,0.94)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--noir-border-strong)",
            borderRadius: "99px",
            padding: "8px 18px",
            fontSize: "13px",
            color: "var(--noir-text)",
            boxShadow: "var(--shadow-md)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            pointerEvents: "none",
          }}
        >
          <span>📍</span>
          <span>No places pinned on this trip yet. Add places in the Moodboard tab!</span>
        </div>
      )}

      {/* Floating Place Preview Card when pin clicked */}
      {selectedPlace && (
        <div
          className="animate-fade-up"
          style={{
            position: "absolute",
            bottom: "calc(var(--tab-height) + 16px)",
            left: "16px",
            right: "16px",
            maxWidth: 420,
            margin: "0 auto",
            background: "rgba(255,253,249,0.97)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--noir-border-strong)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            boxShadow: "var(--shadow-lg)",
            color: "var(--noir-text)",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {selectedPlace.photo_url && (
              <div
                style={{
                  width: "100px",
                  background: `url(${selectedPlace.photo_url}) center/cover`,
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ padding: "14px", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <h4
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--noir-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedPlace.title}
                </h4>
                <button
                  onClick={() => setSelectedPlace(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--noir-text-muted)",
                    fontSize: "18px",
                    cursor: "pointer",
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {selectedPlace.address && (
                <p
                  style={{
                    color: "var(--noir-text-muted)",
                    fontSize: "12px",
                    marginTop: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedPlace.address}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "10px",
                }}
              >
                <span
                  className={`badge-${selectedPlace.category}`}
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "99px",
                  }}
                >
                  {selectedPlace.category.toUpperCase()}
                </span>
                <div style={{ display: "flex", gap: "10px", fontSize: "12px" }}>
                  <span style={{ color: "var(--gold)", fontWeight: 600 }}>✦ {totalYaay}</span>
                  <span style={{ color: "var(--noir-text-muted)" }}>✕ {totalNaay}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
