import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

async function postReviewAction(callId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/calls/${callId}/review`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to update call.");
  }
}

interface Options {
  organizationId: string;
  callId: string | null;
}

export function useCallReviewMutation({ organizationId, callId }: Options) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = React.useState("");

  const actionMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!callId) {
        throw new Error("Missing call identifier.");
      }

      await postReviewAction(callId, body);
    },
    onSuccess: async () => {
      setErrorMessage("");

      if (!callId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calls", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["call-detail", organizationId, callId] }),
        queryClient.invalidateQueries({ queryKey: ["call-detail-page", organizationId, callId] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update call.");
    },
  });

  return {
    actionMutation,
    errorMessage,
    clearErrorMessage: () => setErrorMessage(""),
  };
}
