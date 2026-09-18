import { describe, it, expect } from "vitest";
import { loginSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid email/password pair and normalizes the email", () => {
    const result = loginSchema.safeParse({
      email: "  Admin@DoparEnergy.com  ",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@doparenergy.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "hunter2" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "admin@doparenergy.com", password: "" });
    expect(result.success).toBe(false);
  });
});
