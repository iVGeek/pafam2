import { prisma } from "@/lib/prisma";
import { OrderBuilder } from "./order-builder";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const [suppliers, offers] = await Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, country: true },
    }),
    prisma.offer.findMany({
      where: { status: "ACTIVE", price: { not: null } },
      orderBy: [{ listDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        supplierId: true,
        originalCode: true,
        brand: true,
        fragranceName: true,
        concentration: true,
        sizeMl: true,
        packagingLevel: true,
        currency: true,
        price: true,
        priceBasis: true,
        unitsPerCase: true,
        availableQuantity: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Quantities are whole boxes: enter the number of cases and the units per
          case, and the total units are calculated. Pick a supplier offer to
          prefill a line, or add lines manually.
        </p>
      </div>
      <OrderBuilder
        suppliers={suppliers}
        offers={offers.map((o) => ({
          id: o.id,
          supplierId: o.supplierId,
          originalCode: o.originalCode,
          brand: o.brand,
          fragranceName: o.fragranceName,
          concentration: o.concentration,
          sizeMl: o.sizeMl,
          packagingLevel: o.packagingLevel,
          currency: o.currency ?? "USD",
          price: o.price === null ? null : Number(o.price),
          priceBasis: o.priceBasis,
          unitsPerCase: o.unitsPerCase,
          availableQuantity:
            o.availableQuantity === null ? null : Number(o.availableQuantity),
        }))}
      />
    </div>
  );
}
