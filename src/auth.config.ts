import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe subset of the Auth.js config: no providers, no Prisma. This is
 * the only part loaded by proxy.ts (which runs on the Edge runtime and
 * cannot bundle the Postgres driver). The full config, including the
 * Credentials provider's database-backed `authorize`, lives in auth.ts and
 * only runs in the Node.js runtime (Route Handlers, Server Actions, Server
 * Components).
 */
export const authConfig = {
  // Required outside Vercel's own platform (self-hosted, Docker, `next start`
  // locally, CI) — otherwise Auth.js rejects every request as an untrusted
  // host. Safe here because the host actually serving traffic is controlled
  // by our own deployment config, not arbitrary user input.
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");

      if (isLoginPage) {
        return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }

      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
