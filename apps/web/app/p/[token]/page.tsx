import StartDiagnostic from "../../../components/StartDiagnostic";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "https://homeops-gateway.fly.dev";

interface IntakePublic {
  intake_id: string;
  category: string;
  appliance_type: string | null;
  title: string;
  description: string | null;
  created_at: string;
  token_expires_at: string;
  opened_at: string | null;
}

type IntakeResult =
  | { kind: "ok"; intake: IntakePublic }
  | { kind: "expired" }
  | { kind: "missing" };

async function getIntake(token: string): Promise<IntakeResult> {
  try {
    const res = await fetch(
      `${GATEWAY}/api/v1/intake/public/${encodeURIComponent(token)}`,
      { cache: "no-store" } // tokens are single-purpose — never cache
    );
    if (res.status === 410) return { kind: "expired" };
    if (!res.ok) return { kind: "missing" };
    return { kind: "ok", intake: (await res.json()) as IntakePublic };
  } catch {
    return { kind: "missing" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy passport view (pre-A2 links still resolve to the broker passport)
// ─────────────────────────────────────────────────────────────────────────────

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

function PassportView({ passport, token }: { passport: PassportPublic; token: string }) {
  const { property, broker, appliances } = passport;
  const address = [property.address_line1, property.address_line2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
      <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        Appliance Passport
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>{address}</h1>
      {broker.brokerage_name && (
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 48px" }}>
          {broker.full_name ?? "Your broker"} · {broker.brokerage_name}
        </p>
      )}

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

// ─────────────────────────────────────────────────────────────────────────────
// A2 Take Command landing — the /p/<token> page behind every tenant SMS
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${formatDate(iso)} · ${h % 12 || 12}:${m} ${ampm}`;
}

function TakeCommandView({ intake, token }: { intake: IntakePublic; token: string }) {
  const applianceLabel = intake.appliance_type
    ? intake.appliance_type.replace(/_/g, " ")
    : "appliance";
  const status = intake.opened_at ? "Diagnostic started" : "Queued";

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
      <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        HomeOps · Appliance Diagnostic
      </p>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5, margin: "0 0 8px" }}>
        Take Command.
      </h1>
      <p style={{ fontSize: 16, color: "#999", margin: "0 0 40px", lineHeight: 1.6 }}>
        Your {applianceLabel} issue is queued. Open your diagnostic in seconds — no download.
      </p>

      <section style={{ backgroundColor: "#2a2a2a", borderLeft: "2px solid #ffffff", padding: "24px", marginBottom: 32 }}>
        <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>
          Issue
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", lineHeight: 1.3 }}>{intake.title}</h2>
        {intake.description && (
          <p style={{ fontSize: 14, color: "#999", margin: "0 0 20px", lineHeight: 1.6 }}>{intake.description}</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
          <div>
            <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>
              Appliance
            </p>
            <p style={{ fontSize: 15, margin: 0, textTransform: "capitalize" }}>{applianceLabel}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>
              Status
            </p>
            <p style={{ fontSize: 15, margin: 0 }}>{status}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>
              Received
            </p>
            <p style={{ fontSize: 15, margin: 0 }}>{formatDateTime(intake.created_at)}</p>
          </div>
        </div>
      </section>

      <StartDiagnostic token={token} gateway={GATEWAY} alreadyStarted={!!intake.opened_at} />

      <p style={{ fontSize: 12, color: "#444", marginTop: 24, lineHeight: 1.6 }}>
        This link expires {formatDateTime(intake.token_expires_at)}. Each new issue sends a fresh link.
      </p>
    </main>
  );
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. A1 intake token (the tenant SMS funnel)
  const intakeResult = await getIntake(token);
  if (intakeResult.kind === "ok") {
    return <TakeCommandView intake={intakeResult.intake} token={token} />;
  }
  if (intakeResult.kind === "expired") {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
        <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
          HomeOps · Appliance Diagnostic
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>This link has expired</h1>
        <p style={{ color: "#666", fontSize: 15, lineHeight: 1.6 }}>
          Diagnostic links are single-purpose and expire after 72 hours. If the issue is still open, your property manager&apos;s
          next update will send a fresh link — or text your management office directly.
        </p>
      </main>
    );
  }

  // 2. Legacy passport token (pre-A2 links)
  const passport = await getPassport(token);
  if (passport) {
    return <PassportView passport={passport} token={token} />;
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px" }}>
      <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        HomeOps · Appliance Diagnostic
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Link not found</h1>
      <p style={{ color: "#666", fontSize: 15 }}>
        This link isn&apos;t valid. If you think this is a mistake, contact your property manager.
      </p>
    </main>
  );
}
