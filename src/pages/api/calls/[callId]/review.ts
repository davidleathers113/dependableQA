import type { APIRoute } from "astro";
import { insertAuditLog } from "../../../../lib/app-data";
import { requireApiSession } from "../../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { getAdminSupabase } from "../../../../lib/supabase/admin-client";

export const prerender = false;

type ReviewAction =
  | { action: "review-status"; reviewStatus: string; finalDisposition?: string; reviewNotes?: string }
  | { action: "override-disposition"; newDisposition: string; reason: string }
  | { action: "flag-status"; flagId: string; status: string };

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const callId = context.params.callId;
  if (!callId) {
    return new Response(JSON.stringify({ error: "Missing callId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const body = (await context.request.json().catch(() => null)) as ReviewAction | null;
  if (!body || typeof body.action !== "string") {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createServerSupabaseClient(context.request, context.cookies) as any;
  const admin = getAdminSupabase();

  const currentCall = await supabase
    .from("calls")
    .select("id, current_disposition, current_review_status")
    .eq("organization_id", session.organization.id)
    .eq("id", callId)
    .single();

  if (currentCall.error || !currentCall.data) {
    return new Response(JSON.stringify({ error: currentCall.error?.message ?? "Call not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const call = currentCall.data as Record<string, unknown>;
  const currentDisposition = typeof call.current_disposition === "string" ? call.current_disposition : null;
  const currentReviewStatus = typeof call.current_review_status === "string" ? call.current_review_status : "unreviewed";

  try {
    if (body.action === "review-status") {
      const reviewStatus = body.reviewStatus?.trim();
      if (!reviewStatus) {
        throw new Error("reviewStatus is required.");
      }

      const insertReview = await supabase.from("call_reviews").insert({
        organization_id: session.organization.id,
        call_id: callId,
        reviewed_by: session.user.id,
        review_status: reviewStatus,
        final_disposition: body.finalDisposition?.trim() || null,
        review_notes: body.reviewNotes?.trim() || null,
      });

      if (insertReview.error) {
        throw new Error(insertReview.error.message);
      }

      const updateCall = await supabase
        .from("calls")
        .update({
          current_review_status: reviewStatus,
          current_disposition: body.finalDisposition?.trim() || currentDisposition,
        })
        .eq("organization_id", session.organization.id)
        .eq("id", callId);

      if (updateCall.error) {
        throw new Error(updateCall.error.message);
      }

      await insertAuditLog(admin, {
        organizationId: session.organization.id,
        actorUserId: session.user.id,
        entityType: "call",
        entityId: callId,
        action: "call.review.updated",
        before: {
          current_review_status: currentReviewStatus,
          current_disposition: currentDisposition,
        },
        after: {
          current_review_status: reviewStatus,
          current_disposition: body.finalDisposition?.trim() || currentDisposition,
        },
        metadata: {
          summary: `Marked call as ${reviewStatus}.`,
          reviewNotes: body.reviewNotes?.trim() || null,
        },
      });
    }

    if (body.action === "override-disposition") {
      const newDisposition = body.newDisposition?.trim();
      const reason = body.reason?.trim();
      if (!newDisposition || !reason) {
        throw new Error("newDisposition and reason are required.");
      }

      const insertOverride = await supabase.from("disposition_overrides").insert({
        organization_id: session.organization.id,
        call_id: callId,
        previous_disposition: currentDisposition,
        new_disposition: newDisposition,
        reason,
        changed_by: session.user.id,
      });

      if (insertOverride.error) {
        throw new Error(insertOverride.error.message);
      }

      const updateCall = await supabase
        .from("calls")
        .update({
          current_disposition: newDisposition,
          current_review_status: "reviewed",
        })
        .eq("organization_id", session.organization.id)
        .eq("id", callId);

      if (updateCall.error) {
        throw new Error(updateCall.error.message);
      }

      await insertAuditLog(admin, {
        organizationId: session.organization.id,
        actorUserId: session.user.id,
        entityType: "call",
        entityId: callId,
        action: "call.disposition.overridden",
        before: {
          current_disposition: currentDisposition,
        },
        after: {
          current_disposition: newDisposition,
        },
        metadata: {
          summary: `Overrode disposition to ${newDisposition}.`,
          reason,
        },
      });
    }

    if (body.action === "flag-status") {
      const flagId = body.flagId?.trim();
      const status = body.status?.trim();
      if (!flagId || !status) {
        throw new Error("flagId and status are required.");
      }

      const currentFlag = await supabase
        .from("call_flags")
        .select("id, status, title")
        .eq("organization_id", session.organization.id)
        .eq("call_id", callId)
        .eq("id", flagId)
        .single();

      if (currentFlag.error || !currentFlag.data) {
        throw new Error(currentFlag.error?.message ?? "Flag not found.");
      }

      const updateFlag = await supabase
        .from("call_flags")
        .update({
          status,
        })
        .eq("organization_id", session.organization.id)
        .eq("id", flagId);

      if (updateFlag.error) {
        throw new Error(updateFlag.error.message);
      }

      await insertAuditLog(admin, {
        organizationId: session.organization.id,
        actorUserId: session.user.id,
        entityType: "call_flag",
        entityId: flagId,
        action: "call.flag.updated",
        before: {
          status: typeof (currentFlag.data as Record<string, unknown>).status === "string"
            ? String((currentFlag.data as Record<string, unknown>).status)
            : "",
        },
        after: {
          status,
        },
        metadata: {
          summary: `Updated flag ${String((currentFlag.data as Record<string, unknown>).title ?? "")} to ${status}.`,
          callId,
        },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unable to update call." }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
