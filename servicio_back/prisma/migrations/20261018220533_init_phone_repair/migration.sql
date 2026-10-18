-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(80) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "customer_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_refresh_tokens" (
    "jti" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_refresh_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identification" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "device_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "imei" CHAR(15) NOT NULL,
    "device_model_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "color" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "receptionist_id" UUID NOT NULL,
    "technician_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    "reported_problem" TEXT NOT NULL,
    "preliminary_diagnosis" TEXT,
    "battery_level" SMALLINT,
    "cosmetic_check_in" JSONB NOT NULL,
    "lock_type" VARCHAR(20) NOT NULL,
    "unlock_code_cipher" TEXT,
    "promised_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_status_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "previous_status" VARCHAR(30) NOT NULL,
    "new_status" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_status_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unlock_code_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlock_code_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "version" SMALLINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "labor_subtotal" DECIMAL(12,2) NOT NULL,
    "parts_subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BOB',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decision_channel" VARCHAR(20),
    "rejection_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "item_type" VARCHAR(20) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "spare_part_id" UUID,
    "quantity" SMALLINT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "reservation_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "workshop_price" DECIMAL(12,2) NOT NULL,
    "physical_stock" INTEGER NOT NULL DEFAULT 0,
    "reserved_stock" INTEGER NOT NULL DEFAULT 0,
    "available_stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_movement_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_part_compatibilities" (
    "spare_part_id" UUID NOT NULL,
    "device_model_id" UUID NOT NULL,

    CONSTRAINT "spare_part_compatibilities_pkey" PRIMARY KEY ("spare_part_id","device_model_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "spare_part_id" UUID NOT NULL,
    "work_order_id" UUID,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_customer_id_key" ON "users"("customer_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "revoked_refresh_tokens_expires_at_idx" ON "revoked_refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_identification_key" ON "customers"("identification");

-- CreateIndex
CREATE UNIQUE INDEX "device_models_brand_model_key" ON "device_models"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "devices_imei_key" ON "devices"("imei");

-- CreateIndex
CREATE INDEX "devices_customer_id_idx" ON "devices"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_number_key" ON "work_orders"("number");

-- CreateIndex
CREATE INDEX "work_orders_device_id_created_at_idx" ON "work_orders"("device_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "work_orders_status_created_at_idx" ON "work_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "work_orders_technician_id_status_idx" ON "work_orders"("technician_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_customer_id_idx" ON "work_orders"("customer_id");

-- CreateIndex
CREATE INDEX "work_order_status_audits_work_order_id_created_at_idx" ON "work_order_status_audits"("work_order_id", "created_at");

-- CreateIndex
CREATE INDEX "unlock_code_access_logs_work_order_id_created_at_idx" ON "unlock_code_access_logs"("work_order_id", "created_at");

-- CreateIndex
CREATE INDEX "budgets_work_order_id_status_idx" ON "budgets"("work_order_id", "status");

-- CreateIndex
CREATE INDEX "budgets_status_expires_at_idx" ON "budgets"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_work_order_id_version_key" ON "budgets"("work_order_id", "version");

-- CreateIndex
CREATE INDEX "budget_items_budget_id_idx" ON "budget_items"("budget_id");

-- CreateIndex
CREATE INDEX "budget_items_spare_part_id_idx" ON "budget_items"("spare_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_sku_key" ON "spare_parts"("sku");

-- CreateIndex
CREATE INDEX "spare_parts_category_idx" ON "spare_parts"("category");

-- CreateIndex
CREATE INDEX "spare_parts_name_idx" ON "spare_parts"("name");

-- CreateIndex
CREATE INDEX "spare_parts_available_stock_min_stock_idx" ON "spare_parts"("available_stock", "min_stock");

-- CreateIndex
CREATE INDEX "spare_part_compatibilities_device_model_id_idx" ON "spare_part_compatibilities"("device_model_id");

-- CreateIndex
CREATE INDEX "stock_movements_spare_part_id_created_at_idx" ON "stock_movements"("spare_part_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_work_order_id_idx" ON "stock_movements"("work_order_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revoked_refresh_tokens" ADD CONSTRAINT "revoked_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_receptionist_id_fkey" FOREIGN KEY ("receptionist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_audits" ADD CONSTRAINT "work_order_status_audits_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_audits" ADD CONSTRAINT "work_order_status_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_code_access_logs" ADD CONSTRAINT "unlock_code_access_logs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_code_access_logs" ADD CONSTRAINT "unlock_code_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_compatibilities" ADD CONSTRAINT "spare_part_compatibilities_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_compatibilities" ADD CONSTRAINT "spare_part_compatibilities_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Appended from prisma/sql/immutable-audit.sql ───
-- RN-12 / BE-17: database-level hook that makes the audit trail and the
-- kardex insert-only. Appended verbatim to the init migration (20xx_init_phone_repair). Any UPDATE or DELETE raises and aborts the transaction.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (RN-12 / BE-17)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_order_status_audits_immutable
  BEFORE UPDATE OR DELETE ON work_order_status_audits
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER unlock_code_access_logs_immutable
  BEFORE UPDATE OR DELETE ON unlock_code_access_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- RN-11 invariant enforced by the database as a last line of defense.
ALTER TABLE spare_parts
  ADD CONSTRAINT spare_parts_stock_non_negative
  CHECK (physical_stock >= 0 AND reserved_stock >= 0 AND available_stock >= 0
         AND available_stock = physical_stock - reserved_stock);
