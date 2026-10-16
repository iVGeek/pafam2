import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { AREA_LABELS, ROLE_AREAS, areaForPath } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  const area = next ? areaForPath(next) : null;
  const allowed = user ? ROLE_AREAS[user.role] : [];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-semibold">Not permitted</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Your account does not have access to this part of the platform.
      </p>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Signed in as</dt>
          <dd>{user ? `${user.name} (${user.email})` : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-zinc-500">Your role</dt>
          <dd className="font-medium">{user?.role ?? "—"}</dd>
        </div>
        {area ? (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-zinc-500">Tried to open</dt>
            <dd>{AREA_LABELS[area]}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <p className="text-sm font-medium">Your role can open</p>
        <ul className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {allowed.map((a) => (
            <li key={a}>{AREA_LABELS[a]}</li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-zinc-500">
        If you need access, ask an administrator to change your role — the change
        takes effect the next time you sign in.
      </p>

      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Go to dashboard
        </Link>
        {next ? (
          <Link href={next} className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
            Try again
          </Link>
        ) : null}
      </div>
    </div>
  );
}
