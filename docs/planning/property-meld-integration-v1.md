# Property Meld Integration — Mapping v1 (2026-08-22)

> Source: documented PMS sync mapping (Rentvine / Propertyware field names)
> shared by Benjamin 2026-08-22. **Not** an official Property Meld schema —
> Property Meld does not publish webhook schemas. Everything marked
> **[ASSUMED]** must be verified against the real sandbox when P4 lands.
> Purpose: move A1/E1 forward with a tolerant, real-shaped contract so the
> dev account drops straight in.

## 1. Sync model (as documented)

| Direction | Cadence | Entities | Notes |
|---|---|---|---|
| **Inbound** (PMS → Property Meld) | every **4 hours** | properties, units, tenants/residents, owners | automatic |
| **Outbound** (Property Meld → PMS) | **instant** on event | invoice/expenditure approval (manager approves vendor invoice) | webhook trigger |
| **Manual** | on demand | vendors | imported, then manually linked/mapped between platforms to avoid duplicate records |

HomeOps consumes the **Inbound** directory (mirrors into `pm_*` tables) and
the **Meld/ticket event** webhooks (`meld.created` / `meld.updated` — the
maintenance ticket). Outbound invoice events are the PM-side financial
record; we model the type for future E5 billing, we don't receive them.

## 2. Webhook strategy (per documentation)

- Standard HTTP POST JSON payloads; **no public schema**.
- Documented developer practice: trigger a test event → capture raw JSON
  (Webhook.site / Postman) → map keys with middleware (Make / Zapier).
- Our equivalent: tolerant normalizer (`normalizeEvent` in
  `services/gateway/src/lib/property-meld/mock.ts`) accepts BOTH:
  - **Shape A** — flat contract (`work_order_id`, `primary_contact`) [our earlier guess]
  - **Shape B** — nested meld object + `resident` / `property` / `unit`
    objects using the documented field names [likely real]
- When the sandbox lands: capture one real `meld.created` payload, diff it
  against `PropertyMeldMeldEvent`, extend the normalizer. **No other code
  changes** — the intake table + SMS flow are shape-agnostic.

## 3. Core schema objects & field mapping

### Properties → `pm_properties`
| Documented field | pm_properties column | Notes |
|---|---|---|
| `address_line_1` | `address_line_1` | |
| `address_line_2` | `address_line_2` | |
| `city` | `city` | |
| `state` | `state` | |
| `zip` | `zip` | |
| `year_built` | `year_built` (int) | |
| `maintenance_limit` | `maintenance_limit` (numeric) | restricts Meld authorization limits |
| `property_maintenance_notes` | `property_maintenance_notes` | |
| `property_groups` | `property_groups` (jsonb array) | |

### Units → `pm_units`
`unit_number`, `address_line_1/2`, `city`, `state`, `zip`,
`unit_maintenance_notes` — plus `pm_property_id` FK.

### Residents (tenants & cosigners) → `pm_residents`
`first_name`, `last_name`, `email` (primary login identifier), `phone`,
`status` (`active` | `past` | `future` — active/future may request
maintenance; past may not). Rows carry `pm_property_id` + `pm_unit_id`.

### Owners → `pm_owners`
`first_name`, `last_name`, `email`, `phone`, `associated_properties`
(array of PM property ids).

### Financials (invoices & expenditures) → typed only (no table yet)
`invoice_id`, `vendor_id` (linked vendor), `meld_id` (original ticket ref),
`amount`, `description` (work summary), `attachment_url` (PDF/photos).
Table lands with E5 billing.

## 4. Gateway surface (implemented)

| Endpoint | Purpose | Mode |
|---|---|---|
| `POST /api/v1/webhooks/property-meld` | Meld/ticket webhook (A1 funnel) | mock-safe |
| `POST /api/v1/webhooks/property-meld/sync` | Inbound 4h directory sync → `pm_*` | mock-safe |
| `POST /api/v1/webhooks/property-meld/dev/simulate/property-meld` | Fixture ticket | mock only |
| `POST /api/v1/webhooks/property-meld/dev/simulate/sync` | Fixture directory sync | mock only |
| `POST /api/v1/webhooks/twilio/status` | Twilio delivery callbacks | signature-validated |

Sync upserts are idempotent by provider key (`pm_property_id`, `pm_unit_id`,
`pm_resident_id`, `pm_owner_id`); raw payload preserved in `raw` jsonb so
schema drift never loses data. `pm_sync_state` records last sync time +
counts per direction (4h cadence tracking).

## 5. Open questions for the real sandbox (verify on P4)

1. **Webhook key names** — is the ticket called `meld`? Are ids `id` or
   `meld_id`? Capture a real payload and diff.
2. **Event vocabulary** — `meld.created` vs `work_order.created` vs
   something else; what events can we subscribe to?
3. **Signature scheme** — HMAC? Header name? Secret provisioning?
4. **Directory sync trigger** — is the 4h inbound push delivered as a
   webhook to us, or do we poll an API? (Documentation says syncs happen;
   transport [ASSUMED webhook → verify].)
5. **Resident `status` semantics** — exact enum + whether past tenants
   can request maintenance (affects A1 eligibility).
6. **Category taxonomy** — what values does `meld.category` actually use?
   (Our appliance filter matches a small whitelist.)

## 6. Files

- `services/gateway/src/lib/property-meld/types.ts` — contract types
- `services/gateway/src/lib/property-meld/mock.ts` — fixtures + tolerant normalizer
- `services/gateway/src/lib/property-meld/sync.ts` — directory sync normalizer
- `services/gateway/src/routes/webhooks.ts` — webhook + sync routes
- `supabase/migrations/20260822000003_property_meld_directory.sql` — pm_* mirror tables
