import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe request proxy (Next.js 16's renamed middleware convention) — see
// auth.config.ts for why this is a separate, lighter NextAuth() instance
// from the one in auth.ts.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on every route except the Auth.js API routes and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
