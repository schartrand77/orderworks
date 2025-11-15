-- AlterEnum
ALTER TYPE "JobStatus" RENAME VALUE 'new' TO 'pending';
ALTER TYPE "JobStatus" RENAME VALUE 'processing' TO 'printing';
ALTER TYPE "JobStatus" RENAME VALUE 'done' TO 'completed';
