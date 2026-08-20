const GATEWAY = "https://homeops-gateway.fly.dev";

interface Appliance {
  id: string;
  appliance_type: string;
  make: string | null;
  model_number: string | null;
}

interface PassportPublic {
  id: string;
  property: {
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
  };
  broker: {
    full_name: string | null;
    brokerage_name: string | null;
  };
  appliances: Appliance[];
}

async function getPassport(token: string): Promise<PassportPublic | null> {
  try {
    const res = await fetch(`${GATEWAY}/api/v1/passports/public/${token}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PassportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const passport = await getPassport(token);

  if (!passport) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
        <p style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
          Appliance Passport
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Passport not found</h1>
        <p style={{ color: "#666", fontSize: 15 }}>
          This link may have expired or the passport no longer exists.
        </p>
      </main>
    );
  }

  const { property, broker, appliances } = passport;
  const address = [property.address_line1, property.address_line2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
      {/* Header */}
      <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        Appliance Passport
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>{address}</h1>
      {broker.brokerage_name && (
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 48px" }}>
          {broker.full_name ?? "Your broker"} · {broker.brokerage_name}
        </p>
      )}

      {/* Appliances */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 13, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, fontWeight: 500 }}>
          Appliances ({appliances.length})
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {appliances.map((a) => (
            <div
              key={a.id}
              style={{
                backgroundColor: "#2a2a2a",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 500 }}>
                {a.appliance_type}
              </span>
              <span style={{ fontSize: 13, color: "#666" }}>
                {[a.make, a.model_number].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <a
        href={`/activate/${token}`}
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
        Activate this passport →
      </a>
    </main>
  );
}
