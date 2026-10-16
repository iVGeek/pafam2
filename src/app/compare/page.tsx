import { CompareForm } from "./compare-form";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Compare price lists
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Upload any two Excel files — two supplier offers, a previous versus a
          current price list, or your own list — and see what was added, removed
          or repriced, with the percentage change. Prices in different
          currencies are compared on their USD value using the latest dated
          rate.
        </p>
      </div>
      <CompareForm />
    </div>
  );
}
