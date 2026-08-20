export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px" }}>
      {/* Hero */}
      <section style={{ marginBottom: 80 }}>
        <h1 style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1, margin: "0 0 16px" }}>
          HomeOps
        </h1>
        <p style={{ fontSize: 20, color: "#999", margin: "0 0 40px", lineHeight: 1.5 }}>
          Before you call.<br />
          Before you pay.<br />
          Before you make it worse.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a
            href="#"
            style={{
              display: "inline-block",
              backgroundColor: "#ffffff",
              color: "#1a1a1a",
              padding: "14px 28px",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
              borderRadius: 4,
            }}
          >
            Get the app
          </a>
          <a
            href="#"
            style={{
              display: "inline-block",
              backgroundColor: "transparent",
              color: "#ffffff",
              padding: "14px 28px",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
              borderRadius: 4,
              border: "1px solid #333",
            }}
          >
            For brokers →
          </a>
        </div>
      </section>

      {/* Value props */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 2,
          marginBottom: 80,
        }}
      >
        {[
          {
            role: "Brokers",
            headline: "Close with confidence.",
            body: "Walk through a home, scan every model plate, generate an Appliance Passport. Hand your buyer something valuable on closing day.",
          },
          {
            role: "Property Managers",
            headline: "Triage before dispatch.",
            body: "Know what's in every unit before a tech shows up. Pre-diagnostic data cuts billable hours and tenant disputes.",
          },
          {
            role: "Homeowners",
            headline: "Know before you call.",
            body: "Describe the symptom. Get a plain-language diagnostic. Know if it's safe to wait, try something yourself, or call a pro.",
          },
        ].map(({ role, headline, body }) => (
          <div
            key={role}
            style={{
              backgroundColor: "#2a2a2a",
              padding: "28px 24px",
              borderTop: "2px solid #ffffff",
            }}
          >
            <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
              {role}
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.3 }}>
              {headline}
            </h2>
            <p style={{ fontSize: 14, color: "#999", margin: 0, lineHeight: 1.7 }}>
              {body}
            </p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #2a2a2a", paddingTop: 32, color: "#444", fontSize: 13 }}>
        © {new Date().getFullYear()} HomeOps
      </footer>
    </main>
  );
}
