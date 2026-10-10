export default function AppLoading() {
  return (
    <div
      className="tab-content"
      style={{ minHeight: "100dvh" }}
      aria-busy="true"
      aria-label="Loading"
    >
      <header
        style={{
          padding: "56px 24px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div className="skeleton" style={{ width: 72, height: 11, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: 180, height: 26 }} />
      </header>
      <div
        style={{
          padding: "24px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="skeleton" style={{ height: 160, borderRadius: 0 }} />
            <div style={{ padding: "16px" }}>
              <div className="skeleton" style={{ width: "60%", height: 17, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: "40%", height: 13 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
