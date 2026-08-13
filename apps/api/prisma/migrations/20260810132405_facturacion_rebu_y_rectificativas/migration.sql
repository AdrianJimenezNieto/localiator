/*
  Warnings:

  - The primary key for the `InvoiceCounter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `issuerAddress` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issuerName` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issuerTaxId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `series` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `series` to the `InvoiceCounter` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('FULL', 'SIMPLIFIED', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "InvoiceRegime" AS ENUM ('REBU', 'GENERAL');

-- DropIndex
DROP INDEX "Invoice_orderId_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "correctionReason" TEXT,
ADD COLUMN     "correctsInvoiceId" TEXT,
ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerTaxId" TEXT,
ADD COLUMN     "issuerAddress" TEXT NOT NULL,
ADD COLUMN     "issuerName" TEXT NOT NULL,
ADD COLUMN     "issuerTaxId" TEXT NOT NULL,
ADD COLUMN     "regime" "InvoiceRegime" NOT NULL DEFAULT 'REBU',
ADD COLUMN     "series" TEXT NOT NULL,
ADD COLUMN     "type" "InvoiceType" NOT NULL DEFAULT 'SIMPLIFIED',
ALTER COLUMN "netCents" DROP NOT NULL,
ALTER COLUMN "vatRateBps" DROP NOT NULL,
ALTER COLUMN "vatCents" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceCounter" DROP CONSTRAINT "InvoiceCounter_pkey",
ADD COLUMN     "series" TEXT NOT NULL,
ADD CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year", "series");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctsInvoiceId_fkey" FOREIGN KEY ("correctsInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
