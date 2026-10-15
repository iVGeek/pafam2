-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'PURCHASING', 'SALES', 'ACCOUNTS', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "CodeType" AS ENUM ('EAN', 'UPC', 'GTIN');

-- CreateEnum
CREATE TYPE "PackagingLevel" AS ENUM ('UNIT', 'CASE', 'TESTER', 'GIFT_SET', 'REFILL', 'DAMAGED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'STALE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'VALIDATED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "UploadRowStatus" AS ENUM ('OK', 'EXCEPTION', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PURCHASING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "internalSku" TEXT NOT NULL,
    "gtin14" TEXT,
    "brand" TEXT,
    "fragranceName" TEXT,
    "concentration" TEXT,
    "sizeMl" INTEGER,
    "genderOrCategory" TEXT,
    "setContents" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarcodeAlias" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeType" "CodeType" NOT NULL DEFAULT 'EAN',
    "packagingLevel" "PackagingLevel" NOT NULL DEFAULT 'UNIT',
    "unitsPerCase" INTEGER,
    "sourceValue" TEXT,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarcodeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOwner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "stockOwnerId" TEXT NOT NULL,
    "lotReference" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "uniqueLotRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "offerId" TEXT,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT,
    "stockOwnerId" TEXT,
    "lotId" TEXT,
    "listDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "lastStockConfirmation" TIMESTAMP(3),
    "sourceFileId" TEXT,
    "sourceRow" INTEGER,
    "originalCode" TEXT NOT NULL,
    "originalCodeType" "CodeType" NOT NULL DEFAULT 'EAN',
    "brand" TEXT,
    "fragranceName" TEXT,
    "concentration" TEXT,
    "sizeMl" INTEGER,
    "genderOrCategory" TEXT,
    "setContents" TEXT,
    "packagingLevel" "PackagingLevel" NOT NULL DEFAULT 'UNKNOWN',
    "hasCap" BOOLEAN,
    "hasBox" BOOLEAN,
    "sealed" BOOLEAN,
    "damageStatus" TEXT,
    "batchOrLotRef" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "currency" TEXT,
    "price" DECIMAL(14,4),
    "priceBasis" "PackagingLevel",
    "unitsPerCase" INTEGER,
    "availableQuantity" DECIMAL(18,3),
    "quantityUnit" TEXT,
    "moq" INTEGER,
    "orderMultiple" INTEGER,
    "priceTierMin" INTEGER,
    "priceTierMax" INTEGER,
    "stockCountry" TEXT,
    "warehouse" TEXT,
    "countryOfOrigin" TEXT,
    "incoterm" TEXT,
    "namedPlace" TEXT,
    "readyDate" TIMESTAMP(3),
    "leadTimeDays" INTEGER,
    "paymentTerms" TEXT,
    "freightInclusions" TEXT,
    "permittedDestinations" TEXT,
    "permittedChannels" TEXT,
    "usSuitability" TEXT,
    "authenticityDocs" TEXT,
    "stockOwnerRef" TEXT,
    "uniqueLotReference" TEXT,
    "stockConfidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT,
    "sha256" TEXT NOT NULL,
    "fileSize" INTEGER,
    "supplierId" TEXT,
    "listDate" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadRow" (
    "id" TEXT NOT NULL,
    "uploadFileId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawJson" JSONB NOT NULL,
    "status" "UploadRowStatus" NOT NULL DEFAULT 'OK',
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "uploadFileId" TEXT NOT NULL,
    "uploadRowId" TEXT,
    "code" TEXT NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'ERROR',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "details" TEXT,
    "uploadFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalSku_key" ON "Product"("internalSku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin14_key" ON "Product"("gtin14");

-- CreateIndex
CREATE INDEX "Product_brand_fragranceName_idx" ON "Product"("brand", "fragranceName");

-- CreateIndex
CREATE INDEX "BarcodeAlias_code_idx" ON "BarcodeAlias"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeAlias_code_packagingLevel_key" ON "BarcodeAlias"("code", "packagingLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockOwner_name_key" ON "StockOwner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_stockOwnerId_lotReference_key" ON "Lot"("stockOwnerId", "lotReference");

-- CreateIndex
CREATE INDEX "Offer_productId_idx" ON "Offer"("productId");

-- CreateIndex
CREATE INDEX "Offer_supplierId_idx" ON "Offer"("supplierId");

-- CreateIndex
CREATE INDEX "Offer_listDate_idx" ON "Offer"("listDate");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_originalCode_idx" ON "Offer"("originalCode");

-- CreateIndex
CREATE INDEX "UploadFile_sha256_idx" ON "UploadFile"("sha256");

-- CreateIndex
CREATE INDEX "UploadFile_createdAt_idx" ON "UploadFile"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadRow_uploadFileId_rowNumber_key" ON "UploadRow"("uploadFileId", "rowNumber");

-- CreateIndex
CREATE INDEX "ValidationIssue_uploadFileId_idx" ON "ValidationIssue"("uploadFileId");

-- CreateIndex
CREATE INDEX "ValidationIssue_resolved_idx" ON "ValidationIssue"("resolved");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "BarcodeAlias" ADD CONSTRAINT "BarcodeAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_stockOwnerId_fkey" FOREIGN KEY ("stockOwnerId") REFERENCES "StockOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_stockOwnerId_fkey" FOREIGN KEY ("stockOwnerId") REFERENCES "StockOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadRow" ADD CONSTRAINT "UploadRow_uploadFileId_fkey" FOREIGN KEY ("uploadFileId") REFERENCES "UploadFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadRow" ADD CONSTRAINT "UploadRow_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_uploadFileId_fkey" FOREIGN KEY ("uploadFileId") REFERENCES "UploadFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_uploadRowId_fkey" FOREIGN KEY ("uploadRowId") REFERENCES "UploadRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_uploadFileId_fkey" FOREIGN KEY ("uploadFileId") REFERENCES "UploadFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

