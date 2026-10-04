import "server-only";

export type WhatsAppTemplateInput = {
  to: string;
  templateName: string;
  languageCode?: string;
  parameters: string[];
};

// Only a definitive rejection is safe to retry. A connection failure may occur
// after the provider has accepted delivery and requires reconciliation.
export class NotificationDeliveryError extends Error {}

export function buildWhatsAppTemplatePayload(input: WhatsAppTemplateInput) {
  return {
    messaging_product: "whatsapp",
    to: input.to.replace(/[^\d]/g, ""),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? "en" },
      components: [
        {
          type: "body",
          parameters: input.parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

export async function sendWhatsAppTemplate(input: WhatsAppTemplateInput) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new NotificationDeliveryError("WhatsApp provider is not configured");
  if (!["STAGING", "PRODUCTION"].includes(process.env.APP_ENV ?? "")) throw new NotificationDeliveryError("Real notification delivery requires a cloud environment");
  if (process.env.APP_ENV === "STAGING" && !(process.env.STAGING_WHATSAPP_RECIPIENTS ?? "").split(",").includes(input.to.replace(/[^\d]/g, ""))) {
    throw new NotificationDeliveryError("Staging destination is not allowlisted");
  }

  const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildWhatsAppTemplatePayload(input)),
    // A timeout is ambiguous and MUST remain processing for reconciliation.
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) {
    if (![400, 401, 403, 404, 422, 429].includes(response.status)) throw new Error("WhatsApp outcome requires reconciliation");
    throw new NotificationDeliveryError(`WhatsApp request rejected (${response.status})`);
  }
  return body.messages?.[0]?.id ?? null;
}
