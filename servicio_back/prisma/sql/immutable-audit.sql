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
