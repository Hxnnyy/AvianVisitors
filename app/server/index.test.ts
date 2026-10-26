import { describe, it, expect } from "vitest";
import worker from "./index";
describe("private API", () => {
  it("denies unauthenticated requests before touching storage", async () => {
    const response = await worker.fetch(
      new Request("https://birds.test/api/captures"),
      {} as never,
      {} as never,
    );
    expect(response.status).toBe(401);
  });
});
