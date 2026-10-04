import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWhatsAppTemplatePayload, sendWhatsAppTemplate, NotificationDeliveryError } from "./whatsapp";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("controlled provider boundary", () => {
  const input = { to: "+19995550001", templateName: "queue_approaching", parameters: ["STAGING TEST", "A001"] };
  function setup() {
    vi.stubEnv("APP_ENV", "STAGING"); vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "test-id"); vi.stubEnv("STAGING_WHATSAPP_RECIPIENTS", "19995550001");
  }
  it("denies local delivery and non-allowlisted staging recipients before fetch", async () => {
    setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(sendWhatsAppTemplate({ ...input, to: "+19995550002" })).rejects.toBeInstanceOf(NotificationDeliveryError);
    vi.stubEnv("APP_ENV", "LOCAL");
    await expect(sendWhatsAppTemplate(input)).rejects.toBeInstanceOf(NotificationDeliveryError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("records provider acknowledgement and supplies a bounded abort signal", async () => {
    setup(); const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "test-provider-id" }] })); vi.stubGlobal("fetch", fetcher);
    expect(await sendWhatsAppTemplate(input)).toBe("test-provider-id");
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("only definitive rejections are retryable; server errors and timeouts are uncertain", async () => {
    setup(); const fetcher = vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 400 })); vi.stubGlobal("fetch", fetcher);
    await expect(sendWhatsAppTemplate(input)).rejects.toBeInstanceOf(NotificationDeliveryError);
    fetcher.mockResolvedValue(Response.json({ error: {} }, { status: 503 }));
    try { await sendWhatsAppTemplate(input); throw new Error("Expected rejection"); } catch (error) { expect(error).not.toBeInstanceOf(NotificationDeliveryError); }
    fetcher.mockResolvedValue(Response.json({ error: {} }, { status: 408 }));
    try { await sendWhatsAppTemplate(input); throw new Error("Expected rejection"); } catch (error) { expect(error).not.toBeInstanceOf(NotificationDeliveryError); }
    fetcher.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(sendWhatsAppTemplate(input)).rejects.toThrow("timeout");
  });
});

describe("WhatsApp template payload", () => {
  it("maps queue template values in approved-template order", () => {
    expect(
      buildWhatsAppTemplatePayload({
        to: "+19995550001",
        templateName: "queue_approaching",
        languageCode: "en",
        parameters: ["John", "A052"],
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      to: "19995550001",
      type: "template",
      template: {
        name: "queue_approaching",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "John" },
              { type: "text", text: "A052" },
            ],
          },
        ],
      },
    });
  });
});
