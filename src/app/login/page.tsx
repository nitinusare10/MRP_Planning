import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-lg font-semibold">Dopar MRP</h1>
        <p className="text-sm text-gray-500">Sign in to continue.</p>
      </div>
      <LoginForm />
    </main>
  );
}
