-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FREIGHT', 'INSURANCE', 'DUTY', 'BROKERAGE', 'HANDLING', 'TAX', 'RECOVERABLE', 'OUTBOUND', 'COMMISSION', 'FEES', 'STORAGE', 'FINANCING', 'CREDIT_LOSS', 'OTHER');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('WISHLIST', 'REQUEST', 'QUOTE', 'CONFIRMED', 'FULFILLED', 'LOST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DemandCertainty" AS ENUM ('EXACT', 'INFERRED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
    "rate" DECIMAL(18,8) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "booked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "destinationCountry" TEXT,
    "destinationCity" TEXT,
    "channels" TEXT,
    "accountOwner" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentTerms" TEXT,
    "creditLimit" DECIMAL(18,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "DemandStatus" NOT NULL DEFAULT 'WISHLIST',
    "certainty" "DemandCertainty" NOT NULL DEFAULT 'EXACT',
    "productId" TEXT,
    "barcode" TEXT,
    "internalSku" TEXT,
    "brand" TEXT,
    "fragranceName" TEXT,
    "concentration" TEXT,
    "sizeMl" INTEGER,
    "packagingRequirement" TEXT,
    "quantity" DECIMAL(18,3),
    "quantityUnit" TEXT,
    "targetPrice" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deliveryBasis" TEXT,
    "destination" TEXT,
    "neededBy" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "evidence" TEXT,
    "meetingDate" TIMESTAMP(3),
    "owner" TEXT,
    "lastReconfirmed" TIMESTAMP(3),
    "extractionConfidence" INTEGER,
    "matchConfidence" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT NOT NULL,
    "productId" TEXT,
    "customerId" TEXT,
    "offerId" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "buyCurrency" TEXT NOT NULL,
    "buyPrice" DECIMAL(18,4) NOT NULL,
    "buyPriceBasis" "PackagingLevel" NOT NULL DEFAULT 'UNIT',
    "unitsPerCase" INTEGER,
    "fxRate" DECIMAL(18,8),
    "fxRateDate" TIMESTAMP(3),
    "fxSource" TEXT,
    "sellingPriceUsd" DECIMAL(18,4),
    "landedUnitCost" DECIMAL(18,4),
    "netUnitRevenue" DECIMAL(18,4),
    "grossProfit" DECIMAL(18,2),
    "grossMarginPct" DECIMAL(9,4),
    "dealContribution" DECIMAL(18,2),
    "contributionMarginPct" DECIMAL(9,4),
    "cashRequirement" DECIMAL(18,2),
    "cashCycleDays" INTEGER,
    "capitalEfficiencyPct" DECIMAL(9,4),
    "annualisedReturnPct" DECIMAL(9,4),
    "suggestedSellPrice" DECIMAL(18,4),
    "incomplete" BOOLEAN NOT NULL DEFAULT false,
    "missingInputs" JSONB,
    "notes" TEXT,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealCost" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "driver" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validUntil" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "deliveryBasis" TEXT,
    "destination" TEXT,
    "notes" TEXT,
    "owner" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "dealId" TEXT,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxRate_baseCurrency_rateDate_idx" ON "FxRate"("baseCurrency", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_baseCurrency_quoteCurrency_rateDate_source_key" ON "FxRate"("baseCurrency", "quoteCurrency", "rateDate", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Demand_customerId_idx" ON "Demand"("customerId");

-- CreateIndex
CREATE INDEX "Demand_status_idx" ON "Demand"("status");

-- CreateIndex
CREATE INDEX "Demand_productId_idx" ON "Demand"("productId");

-- CreateIndex
CREATE INDEX "Demand_barcode_idx" ON "Demand"("barcode");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_supplierId_idx" ON "Deal"("supplierId");

-- CreateIndex
CREATE INDEX "Deal_productId_idx" ON "Deal"("productId");

-- CreateIndex
CREATE INDEX "DealCost_dealId_idx" ON "DealCost"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_customerId_idx" ON "Quote"("customerId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealCost" ADD CONSTRAINT "DealCost_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
