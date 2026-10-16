-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('SHORTAGE', 'DAMAGE', 'QUALITY', 'LATE', 'RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "expectedDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reference" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "carrier" TEXT,
    "notes" TEXT,
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "orderedUnits" INTEGER NOT NULL DEFAULT 0,
    "receivedUnits" INTEGER NOT NULL DEFAULT 0,
    "rejectedUnits" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaim" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT,
    "receiptId" TEXT,
    "type" "ClaimType" NOT NULL DEFAULT 'OTHER',
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "units" INTEGER,
    "amountUsd" DECIMAL(14,2),
    "description" TEXT NOT NULL,
    "openedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedDate" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_reference_key" ON "GoodsReceipt"("reference");

-- CreateIndex
CREATE INDEX "GoodsReceipt_orderId_idx" ON "GoodsReceipt"("orderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_supplierId_idx" ON "GoodsReceipt"("supplierId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_receiptDate_idx" ON "GoodsReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_receiptId_idx" ON "GoodsReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_orderLineId_idx" ON "GoodsReceiptLine"("orderLineId");

-- CreateIndex
CREATE INDEX "SupplierClaim_supplierId_idx" ON "SupplierClaim"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierClaim_status_idx" ON "SupplierClaim"("status");

-- CreateIndex
CREATE INDEX "SupplierClaim_orderId_idx" ON "SupplierClaim"("orderId");

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
