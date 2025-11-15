-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('new', 'processing', 'done');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "shipping" JSONB,
    "metadata" JSONB,
    "userId" TEXT,
    "customerEmail" TEXT,
    "makerworks_created_at" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'new',
    "invoiceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_paymentIntentId_key" ON "jobs"("paymentIntentId");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_makerworks_created_at_idx" ON "jobs"("makerworks_created_at");

