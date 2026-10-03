import { resolveApiBase } from "@/lib/api-base";
import { getFoundingDeviceId } from "@/lib/founding-access";

export type ResultFeedbackRating = "helpful" | "needs_review";

export async function submitResultFeedback(input: {
  scanId: string;
  rating: ResultFeedbackRating;
  category?: string;
  confidence?: string;
  qualityGateStatus?: string;
  note?: string;
}) {
  const deviceId = await getFoundingDeviceId();
  const response = await fetch(`${resolveApiBase()}/result-feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ValueVision-Device-Id": deviceId,
    },
    body: JSON.stringify({
      scanId: String(input.scanId || "").trim(),
      rating: input.rating,
      category: String(input.category || "general").trim(),
      confidence: String(input.confidence || "unknown").trim(),
      qualityGateStatus: String(input.qualityGateStatus || "unknown").trim(),
      note: String(input.note || "").trim().slice(0, 500),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(String(payload?.error || "Feedback could not be sent."));
  }
  return payload as { ok: true; rating: ResultFeedbackRating };
}
