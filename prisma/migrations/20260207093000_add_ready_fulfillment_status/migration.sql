-- Add READY fulfillment status to OrderWorks enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FulfillmentStatus') THEN
    ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'ready';
  END IF;
END$$;