import { auth } from "@/auth";
import { logout } from "./actions";

// Deliberately minimal: this only proves the auth/RBAC pipeline works end
// to end. The real planner dashboard is built in Phase 7.
export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4">
      <h1 className="text-lg font-semibold">Dopar MRP</h1>
      <p className="text-sm text-gray-600">
        Signed in as <span className="font-medium">{session?.user.email}</span> (
        {session?.user.role})
      </p>
      <form action={logout}>
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
