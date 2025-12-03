-- Add payment + fulfillment tracking to jobs
CREATE TYPE "FulfillmentStatus" AS ENUM ('pending', 'shipped', 'picked_up');

ALTER TABLE "jobs"
ADD COLUMN "payment_method" TEXT,
ADD COLUMN "payment_status" TEXT,
ADD COLUMN "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "fulfilled_at" TIMESTAMP(3);
