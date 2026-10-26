import { describe, expect, it } from "vitest";
import { serviceRequest } from "./service-request";

describe("private service routing", () => {
  it("uses the private container binding in production and preserves the body", async () => {
    let received: Request | undefined;
    const response = await serviceRequest(
      {
        ENVIRONMENT: "production",
        INFERENCE: {
          getByName(name: string) {
            expect(name).toBe("shared");
            return {
              async fetch(request: Request) {
                received = request;
                return new Response("model");
              },
            };
          },
        },
      },
      "inference",
      "/identify/image",
      {
        method: "POST",
        body: "original",
        headers: { Authorization: "Bearer separate-service-token" },
      },
    );
    expect(await response.text()).toBe("model");
    expect(received?.url).toBe("http://inference.internal/identify/image");
    expect(await received?.text()).toBe("original");
    expect(received?.headers.get("Authorization")).toBe(
      "Bearer separate-service-token",
    );
  });
  it("rejects a remote service URL in local mode", async () => {
    await expect(serviceRequest({ ENVIRONMENT: "local", RENDERER_URL: "https://outside.example" }, "renderer", "/render")).rejects.toThrow("loopback");
  });
  it("refuses public URL routing in production", async () => {
    await expect(
      serviceRequest(
        { ENVIRONMENT: "production", INFERENCE_URL: "http://127.0.0.1:8081" },
        "inference",
        "/health",
      ),
    ).rejects.toThrow("container binding is missing");
  });
});
