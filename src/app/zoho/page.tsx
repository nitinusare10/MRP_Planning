import { requireSession } from "@/lib/auth/rbac";
import { getIntegrationOverview } from "@/services/zohoIntegrationService";
import { ConnectForm } from "./connect-form";
import { DisconnectButton } from "./disconnect-button";
import { SyncButtons } from "./sync-buttons";

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        connected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
      }`}
    >
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "text-green-700",
  PARTIAL_SUCCESS: "text-amber-700",
  FAILED: "text-red-700",
  RUNNING: "text-blue-700",
};

export default async function ZohoIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { connected, error } = await searchParams;
  const overview = await getIntegrationOverview();

  const canManageConnection = session.user.role === "ADMIN";
  const canTriggerSync = session.user.role === "ADMIN" || session.user.role === "PLANNER";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold">Zoho Inventory Integration</h1>
        <p className="text-sm text-gray-500">
          Connection foundation for Phase 1. No master-data or BOM screens live here — see the
          roadmap in <code>docs/architecture.md</code>.
        </p>
      </div>

      {connected ? (
        <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
          Successfully connected to Zoho.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Connection status</h2>
          <StatusBadge connected={overview.connection.connected} />
        </div>

        {!overview.configured ? (
          <p className="text-sm text-amber-700">
            Zoho OAuth is not configured yet. Set <code>ZOHO_CLIENT_ID</code>,{" "}
            <code>ZOHO_CLIENT_SECRET</code>, <code>ZOHO_REDIRECT_URI</code>, and{" "}
            <code>ZOHO_DATA_CENTER</code> in the environment before connecting — see{" "}
            <code>.env.example</code>.
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Zoho Organization ID</dt>
          <dd>{overview.connection.zohoOrganizationId ?? "—"}</dd>
          <dt className="text-gray-500">API domain</dt>
          <dd>{overview.connection.apiDomain ?? "—"}</dd>
          <dt className="text-gray-500">Status</dt>
          <dd>{overview.connection.status ?? "—"}</dd>
          <dt className="text-gray-500">Connected at</dt>
          <dd>{formatDate(overview.connection.connectedAt)}</dd>
          <dt className="text-gray-500">Last token refresh</dt>
          <dd>{formatDate(overview.connection.lastRefreshedAt)}</dd>
        </dl>

        {canManageConnection ? (
          overview.connection.connected ? (
            <DisconnectButton />
          ) : (
            <ConnectForm />
          )
        ) : (
          <p className="text-xs text-gray-400">Only Admins can connect or disconnect Zoho.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold">Synchronization</h2>
        {canTriggerSync ? (
          overview.connection.connected ? (
            <SyncButtons />
          ) : (
            <p className="text-sm text-gray-500">Connect to Zoho before running a sync.</p>
          )
        ) : (
          <p className="text-xs text-gray-400">Only Admins and Planners can trigger a sync.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold">Recent sync history</h2>
        {overview.recentSyncLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No sync has run yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <th className="py-1 pr-2">Entity</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Started</th>
                <th className="py-1 pr-2">Processed</th>
                <th className="py-1 pr-2">Created</th>
                <th className="py-1 pr-2">Updated</th>
                <th className="py-1 pr-2">Failed</th>
              </tr>
            </thead>
            <tbody>
              {overview.recentSyncLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-1 pr-2">{log.syncEntityType}</td>
                  <td className={`py-1 pr-2 font-medium ${STATUS_STYLES[log.status] ?? ""}`}>
                    {log.status}
                  </td>
                  <td className="py-1 pr-2">{formatDate(log.runStartedAt)}</td>
                  <td className="py-1 pr-2">{log.recordsProcessed ?? "—"}</td>
                  <td className="py-1 pr-2">{log.recordsCreated ?? "—"}</td>
                  <td className="py-1 pr-2">{log.recordsUpdated ?? "—"}</td>
                  <td className="py-1 pr-2">{log.recordsFailed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
