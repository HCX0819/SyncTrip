export default function TripLoading() {
  return (
    <div
      className="tab-content"
      style={{ minHeight: "100dvh" }}
      aria-busy="true"
      aria-label="Loading trip"
    >
      {/* Header */}
      <header
        style={{
          padding: "56px 20px 0",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div className="skeleton" style={{ width: 90, height: 11, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "55%", maxWidth: 260, height: 26, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 140, height: 13, marginBottom: 18 }} />
        {/* Tabs */}
        <div style={{ display: "flex", gap: "20px", paddingBottom: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: 64, height: 14 }} />
          ))}
        </div>
      </header>

      {/* Card grid */}
      <div
        style={{
          padding: "20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "12px",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="skeleton" style={{ height: 120, borderRadius: 0 }} />
            <div style={{ padding: "12px" }}>
              <div className="skeleton" style={{ width: "75%", height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "45%", height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
