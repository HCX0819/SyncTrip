// A static map centred on a pin, built from the same Google raster tiles as
// MapView. Used as the cover of a place that has a location but no photo.

const TILE = 256;
const ZOOM = 16;
// Enough tiles around the centre to fill a card up to ~1280 × 768 px.
const COLS = [-2, -1, 0, 1, 2];
const ROWS = [-1, 0, 1];

function worldPixel(lat: number, lng: number) {
  const scale = TILE * 2 ** ZOOM;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export default function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const { x, y } = worldPixel(lat, lng);
  const tileX = Math.floor(x / TILE);
  const tileY = Math.floor(y / TILE);
  const max = 2 ** ZOOM;

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#e8e4dc" }}>
      {/* Origin at the card's centre; tiles are placed relative to the pin. */}
      <div style={{ position: "absolute", left: "50%", top: "50%" }}>
        {ROWS.flatMap((dy) =>
          COLS.map((dx) => {
            const tx = (((tileX + dx) % max) + max) % max;
            const ty = tileY + dy;
            if (ty < 0 || ty >= max) return null;
            return (
              <div
                key={`${dx},${dy}`}
                style={{
                  position: "absolute",
                  left: (tileX + dx) * TILE - x,
                  top: ty * TILE - y,
                  width: TILE,
                  height: TILE,
                  backgroundImage: `url(https://mt${(tx + ty) % 4}.google.com/vt/lyrs=m&hl=en&x=${tx}&y=${ty}&z=${ZOOM})`,
                  backgroundSize: "cover",
                }}
              />
            );
          })
        )}
        <div
          style={{
            position: "absolute",
            left: -11,
            top: -21,
            fontSize: "22px",
            lineHeight: 1,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
          }}
        >
          📍
        </div>
      </div>
    </div>
  );
}
