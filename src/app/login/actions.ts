"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginActionState = { error: string | null };

export async function authenticate(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // Next.js redirect()/NEXT_REDIRECT signals are thrown internally by
    // signIn on success and must be allowed to propagate, not swallowed.
    throw err;
  }
}
