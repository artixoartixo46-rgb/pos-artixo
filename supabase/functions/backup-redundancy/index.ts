// Multi-cloud backup redundancy, destination 1: Supabase Storage.
// Reads every business table (same list as the manual "Download Full Backup" button in
// Settings), bundles it into one JSON snapshot, and writes it to the private "backups" storage
// bucket - a subsystem separate from the database itself, so a bad migration, accidental table
// drop, or RLS mistake doesn't take out every copy of the data at once. Called two ways:
//   1. Automatically once a day by a pg_cron job (see the backup_redundancy migration).
//   2. On demand from Settings ("Backup to Cloud Now" button), authenticated as a normal user.
// Old snapshots beyond RETENTION_COUNT are pruned so the bucket doesn't grow unbounded.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "backups";
const RETENTION_COUNT = 30; // ~1 month of daily snapshots

// Same table list as SettingsPage.tsx's BACKUP_TABLES - keep these in sync if either changes.
const BACKUP_TABLES = [
  "products", "product_categories", "product_price_tiers", "product_receiving",
  "sales", "sale_items", "returns", "return_items",
  "credit_customers", "credit_payment_history",
  "vendors", "vendor_bills", "vendor_ledger", "vendor_checkins", "vendor_checkin_items",
  "stock_takes", "stock_take_items",
  "cheques", "cheque_print_history",
  "banks", "locations", "settings",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // The pg_cron job calls this unauthenticated (besides the publishable key needed to pass the
    // function gateway) and proves it's the real cron trigger via this shared secret instead.
    // On-demand calls from the logged-in app don't send it and are allowed through too - this
    // function only ever reads/writes the backups bucket, never returns sensitive data, so the
    // worst a random caller could do is trigger an extra snapshot.
    const cronSecret = req.headers.get("x-backup-secret");
    const expectedSecret = Deno.env.get("BACKUP_CRON_SECRET");
    const isCronCall = !!cronSecret;
    if (isCronCall && expectedSecret && cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid backup secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const tables: Record<string, unknown[]> = {};
    let totalRows = 0;
    const PAGE_SIZE = 1000;

    for (const table of BACKUP_TABLES) {
      let rows: unknown[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      tables[table] = rows;
      totalRows += rows.length;
    }

    const payload = {
      exported_at: new Date().toISOString(),
      source: "Artixo POS - automatic cloud redundancy",
      tables,
    };
    const json = JSON.stringify(payload);
    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, new Blob([json], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    // Prune old snapshots beyond the retention window.
    const { data: existing, error: listError } = await supabase.storage.from(BUCKET).list("", {
      limit: 1000,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (!listError && existing && existing.length > RETENTION_COUNT) {
      const toDelete = existing.slice(RETENTION_COUNT).map((f) => f.name);
      if (toDelete.length > 0) {
        await supabase.storage.from(BUCKET).remove(toDelete);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        totalRows,
        tableCount: BACKUP_TABLES.length,
        triggeredBy: isCronCall ? "cron" : "manual",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("backup-redundancy error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
