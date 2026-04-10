import type { APIRoute } from "astro";
import { getAiAssistantAnswer } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export const POST: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await context.request.json().catch(() => null)) as { question?: string } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return json({ error: "question is required" }, 400);
  }

  try {
    const response = await getAiAssistantAnswer(
      createServerSupabaseClient(context.request, context.cookies),
      session.organization.id,
      question
    );

    return json(response);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unable to answer this question.",
      },
      500
    );
  }
};
