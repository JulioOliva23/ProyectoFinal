-- SUP-05: argon2 hash of the public tracking code (work order number +
-- tracking code lookup). Nullable: orders created before this migration have
-- no code until reception regenerates one.
-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "tracking_code_hash" VARCHAR(255);
