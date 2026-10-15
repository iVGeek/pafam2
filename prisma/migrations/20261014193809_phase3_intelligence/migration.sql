-- CreateEnum
CREATE TYPE "MarketPriceKind" AS ENUM ('PUBLIC_RETAIL', 'WHOLESALE_SALE', 'OTHER');

-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('PLAUD', 'REMARKABLE', 'MANUAL');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('RECEIVED', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExtractionKind" AS ENUM ('PRODUCT_MENTION', 'QUANTITY', 'TARGET_PRICE', 'DEADLINE', 'CHANNEL_RESTRICTION', 'OBJECTION', 'COMPETITOR_QUOTE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "MarketPriceKind" NOT NULL DEFAULT 'PUBLIC_RETAIL',
    "price" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "observedDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "territory" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL DEFAULT 'MANUAL',
    "status" "NoteStatus" NOT NULL DEFAULT 'RECEIVED',
    "customerId" TEXT,
    "meetingDate" TIMESTAMP(3),
    "staffMember" TEXT,
    "filename" TEXT,
    "sourceLocation" TEXT,
    "rawText" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteExtraction" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" "ExtractionKind" NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "productText" TEXT,
    "barcode" TEXT,
    "productId" TEXT,
    "quantity" DECIMAL(18,3),
    "quantityUnit" TEXT,
    "targetPrice" DECIMAL(18,4),
    "currency" TEXT,
    "neededBy" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "detail" TEXT,
    "excerpt" TEXT NOT NULL,
    "pageRef" TEXT,
    "confidence" INTEGER,
    "appliedDemandId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "noteId" TEXT,
    "customerId" TEXT,
    "demandId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dueDate" TIMESTAMP(3),
    "owner" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPrice_productId_observedDate_idx" ON "MarketPrice"("productId", "observedDate");

-- CreateIndex
CREATE INDEX "Note_customerId_idx" ON "Note"("customerId");

-- CreateIndex
CREATE INDEX "Note_source_idx" ON "Note"("source");

-- CreateIndex
CREATE INDEX "Note_status_idx" ON "Note"("status");

-- CreateIndex
CREATE INDEX "NoteExtraction_noteId_idx" ON "NoteExtraction"("noteId");

-- CreateIndex
CREATE INDEX "NoteExtraction_status_idx" ON "NoteExtraction"("status");

-- CreateIndex
CREATE INDEX "NoteExtraction_kind_idx" ON "NoteExtraction"("kind");

-- CreateIndex
CREATE INDEX "FollowUpTask_status_idx" ON "FollowUpTask"("status");

-- CreateIndex
CREATE INDEX "FollowUpTask_dueDate_idx" ON "FollowUpTask"("dueDate");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteExtraction" ADD CONSTRAINT "NoteExtraction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteExtraction" ADD CONSTRAINT "NoteExtraction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteExtraction" ADD CONSTRAINT "NoteExtraction_appliedDemandId_fkey" FOREIGN KEY ("appliedDemandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
