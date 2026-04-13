import { QueryProvider } from "../../components/providers/QueryProvider";
import type { CallDetail } from "../../lib/app-data";
import { CallReviewWorkspace } from "../call-review/CallReviewWorkspace";

interface Props {
  organizationId: string;
  callId: string;
  initialData: CallDetail | null;
}

function CallDetailPageInner({ organizationId, callId, initialData }: Props) {
  return (
    <CallReviewWorkspace organizationId={organizationId} callId={callId} initialData={initialData} />
  );
}

export default function CallDetailPage(props: Props) {
  return (
    <QueryProvider>
      <CallDetailPageInner {...props} />
    </QueryProvider>
  );
}
