import "server-only";

// Finite event names and codes only: never serialize provider errors, requests,
// user identifiers, destinations, OTPs or clinical form contents.
export function operationalEvent(event: "api_failure" | "auth_failure" | "notification_retry" | "notification_uncertain" | "notification_worker" | "health_failure", code?: string, count = 1) {
  const safeCode = code && /^[A-Z0-9]{5}$/.test(code) ? code : "internal";
  console.error(JSON.stringify({ event, code: safeCode, count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 1 }));
}
