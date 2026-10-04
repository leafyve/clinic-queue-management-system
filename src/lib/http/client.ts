"use client";

// A lost response may follow a committed write. Never replay it automatically.
export async function clinicFetch(path: string, options?: RequestInit) {
  try {
    const response = await fetch(path, options);
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error();
    return response;
  } catch {
    return new Response(JSON.stringify({ error: "Connection interrupted. Your last action may have completed. Keep your input and check the current status before trying again." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}
