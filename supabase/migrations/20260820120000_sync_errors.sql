-- Server-side log of offline-sale sync failures. syncPendingSales() (src/lib/offlineSync.ts)
-- already keeps a "failed" record per-device in IndexedDB, but that's invisible to anyone not
-- looking at that exact browser. This table gives failures a server-side home so an n8n
-- workflow can poll it and alert (Telegram) instead of failures silently sitting in a queue.

CREATE TABLE public.sync_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_message TEXT NOT NULL,
  sale_payload JSONB,
  device_info TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_errors_notified ON public.sync_errors(notified);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

-- Same "allow all" policy used everywhere else in this app (no auth layer yet).
CREATE POLICY "Allow all operations on sync_errors" ON public.sync_errors FOR ALL USING (true) WITH CHECK (true);
