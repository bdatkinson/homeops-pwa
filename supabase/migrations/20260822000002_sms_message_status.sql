-- ============================================================
-- HomeOps — Migration: sms_message_status (Twilio status callbacks)
-- Every Twilio Message Status callback (sent/delivered/failed/
-- undelivered) is appended here as an immutable history row, keyed
-- by Twilio MessageSid. The gateway folds the latest status into
-- work_order_intake.sms_status / passport_invites.delivery_status.
-- Endpoint: POST /api/v1/webhooks/twilio/status (gateway)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sms_message_status (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_message_sid  TEXT NOT NULL,
  status              TEXT NOT NULL,
  error_code          TEXT,
  error_message       TEXT,
  to_phone            TEXT,
  from_number         TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by message + reverse-chronological history per message
CREATE INDEX IF NOT EXISTS idx_sms_message_status_sid
  ON public.sms_message_status(twilio_message_sid, received_at DESC);

-- RLS: gateway (service role) writes; consumers get no direct access.
-- E-path dashboards can add a broker/PM read policy joined to
-- work_order_intake later if delivery status belongs in the UI.
ALTER TABLE public.sms_message_status ENABLE ROW LEVEL SECURITY;
