-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('CONFIRMED', 'POSSIBLE', 'UNVERIFIED');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "poolId" TEXT;

-- CreateTable
CREATE TABLE "StockPool" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "stockOwnerId" TEXT,
    "lotReference" TEXT,
    "label" TEXT NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockPool_productId_idx" ON "StockPool"("productId");

-- CreateIndex
CREATE INDEX "StockPool_stockOwnerId_idx" ON "StockPool"("stockOwnerId");

-- CreateIndex
CREATE INDEX "Offer_poolId_idx" ON "Offer"("poolId");

-- AddForeignKey
ALTER TABLE "StockPool" ADD CONSTRAINT "StockPool_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPool" ADD CONSTRAINT "StockPool_stockOwnerId_fkey" FOREIGN KEY ("stockOwnerId") REFERENCES "StockOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "StockPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
