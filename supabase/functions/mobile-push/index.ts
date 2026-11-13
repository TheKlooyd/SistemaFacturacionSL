import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import webpush from "npm:web-push@3.6.7";
import {
  summarizeBreakdown,
  summarizePayments,
} from "../../../frontend/src/paymentMath.js";

const allowedEndpoint = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-zA-Z0-9-]+\.)*push\.apple\.com|(?:[a-zA-Z0-9-]+\.)+notify\.windows\.com)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
};
async function sameSecret(a: string, b: string) {
  const hash = async (text: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    );
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let different = 0;
  for (let index = 0; index < x.length; index++)
    different |= x[index] ^ y[index];
  return different === 0;
}
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("MOBILE_PUSH_DISPATCH_SECRET") || "";
  if (
    request.method !== "POST" ||
    secret.length < 32 ||
    !(await sameSecret(request.headers.get("x-mobile-push-key") || "", secret))
  )
    return new Response(null, { status: 401 });
  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY"),
    privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY"),
    subject = Deno.env.get("WEB_PUSH_SUBJECT");
  if (!publicKey || !privateKey || !subject)
    return new Response("Push configuration pending", { status: 503 });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: jobs, error } = await admin.rpc("klooyd_mobile_push_claim");
  if (error) return new Response("Queue unavailable", { status: 503 });
  let accepted = 0,
    failed = 0;
  // Small concurrent batches keep leases bounded and avoid an unbounded fanout.
  for (let offset = 0; offset < jobs.length; offset += 3) {
    await Promise.all(
      jobs.slice(offset, offset + 3).map(async (job: any) => {
        let status = "retry",
          expired = false;
        try {
          if (!allowedEndpoint(job.subscription?.endpoint)) {
            status = "failed";
            throw new Error("Invalid endpoint");
          }
          let title = "Klooyd",
            body =
              "Tienes novedades en tu negocio. Abre Klooyd para consultarlas.";
          if (job.showDetails) {
            title = job.title;
            body = job.body;
            if (job.kind === "close") {
              const payments = job.details.payments || [];
              const summary = summarizePayments(payments),
                breakdown = summarizeBreakdown(payments);
              const format = (value: number) =>
                new Intl.NumberFormat("es-CO").format(value);
              body = `${job.businessName} · ${job.details.date}. Ventas: $${format(summary.sales)}. ${breakdown.map((b: any) => `${b.method}: $${format(b.sales)}`).join(" · ")}. Propinas: $${format(summary.tip)}.`;
            }
          }
          await webpush.sendNotification(
            job.subscription,
            JSON.stringify({
              id: job.notificationId,
              title,
              body,
              href: `${job.href}?business=${encodeURIComponent(job.businessId)}`,
            }),
            { TTL: 3600, timeout: 8000, urgency: "normal" },
          );
          status = "accepted";
          accepted++;
        } catch (error) {
          const code = (error as { statusCode?: number }).statusCode;
          expired = code === 404 || code === 410;
          if (expired) status = "failed";
          failed++;
        }
        const finished = await admin.rpc("klooyd_mobile_push_finish", {
          p_id: job.id,
          p_lease: job.leaseId,
          p_status: status,
          p_expired: expired,
        });
        if (finished.error) failed++;
      }),
    );
  }
  // "accepted" means accepted by the push service, never confirmed received/read.
  return Response.json(
    { claimed: jobs.length, accepted, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
});
