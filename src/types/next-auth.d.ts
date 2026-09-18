import type { Role } from "@/generated/prisma/client";

// Auth.js v5 re-exports Session/User/JWT from @auth/core via `export type { ... }`,
// which is NOT declaration-merge-friendly. The augmentation has to target the
// module that actually *declares* the interface, not the next-auth barrel that
// merely re-exports its type.
declare module "@auth/core/types" {
  interface User {
    id: string;
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
