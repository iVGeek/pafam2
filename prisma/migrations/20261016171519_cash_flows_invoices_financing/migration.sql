-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SUPPLIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('BUY_PAYMENT', 'SELL_RECEIPT', 'FINANCING_IN', 'FINANCING_OUT', 'RECOVERABLE_REFUND', 'DEPOSIT_SUPPLIER', 'DEPOSIT_CUSTOMER', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancingStatus" AS ENUM ('ACTIVE', 'REPAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'SUPPLIER',
    "orderId" TEXT,
    "quoteId" TEXT,
    "dealId" TEXT,
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(12,6),
    "total" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "cashFlowId" TEXT,
    "direction" "PaymentDirection" NOT NULL DEFAULT 'IN',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(12,6),
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlow" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "CashFlowType" NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(12,6),
    "orderId" TEXT,
    "dealId" TEXT,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancingEntry" (
    "id" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "fundedDate" TIMESTAMP(3) NOT NULL,
    "repaidDate" TIMESTAMP(3),
    "principalUsd" DECIMAL(18,2) NOT NULL,
    "rateAnnual" DECIMAL(9,6),
    "interestUsd" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "dealId" TEXT,
    "orderId" TEXT,
    "status" "FinancingStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "FinancingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_reference_key" ON "Invoice"("reference");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_quoteId_idx" ON "Invoice"("quoteId");

-- CreateIndex
CREATE INDEX "Invoice_dealId_idx" ON "Invoice"("dealId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_cashFlowId_key" ON "PaymentReceipt"("cashFlowId");

-- CreateIndex
CREATE INDEX "PaymentReceipt_invoiceId_idx" ON "PaymentReceipt"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentReceipt_paidDate_idx" ON "PaymentReceipt"("paidDate");

-- CreateIndex
CREATE INDEX "CashFlow_date_idx" ON "CashFlow"("date");

-- CreateIndex
CREATE INDEX "CashFlow_type_idx" ON "CashFlow"("type");

-- CreateIndex
CREATE INDEX "CashFlow_orderId_idx" ON "CashFlow"("orderId");

-- CreateIndex
CREATE INDEX "CashFlow_dealId_idx" ON "CashFlow"("dealId");

-- CreateIndex
CREATE INDEX "CashFlow_invoiceId_idx" ON "CashFlow"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancingEntry_fromDate_idx" ON "FinancingEntry"("fromDate");

-- CreateIndex
CREATE INDEX "FinancingEntry_fundedDate_idx" ON "FinancingEntry"("fundedDate");

-- CreateIndex
CREATE INDEX "FinancingEntry_dealId_idx" ON "FinancingEntry"("dealId");

-- CreateIndex
CREATE INDEX "FinancingEntry_orderId_idx" ON "FinancingEntry"("orderId");

-- CreateIndex
CREATE INDEX "FinancingEntry_status_idx" ON "FinancingEntry"("status");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_cashFlowId_fkey" FOREIGN KEY ("cashFlowId") REFERENCES "CashFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingEntry" ADD CONSTRAINT "FinancingEntry_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingEntry" ADD CONSTRAINT "FinancingEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
