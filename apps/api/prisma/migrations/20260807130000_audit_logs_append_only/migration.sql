-- FIX OPS-3.1: audit_logs had no protection below the application
-- layer. The app itself never issues an UPDATE or DELETE against this
-- table (audit-logs.repository.ts is read-only — see its own file),
-- but nothing stopped one at the database level: anyone with direct
-- DB access (a compromised admin session with a raw SQL console, a
-- mis-scoped migration, a mistaken manual query) could alter or erase
-- rows, destroying the forensic/legal value an audit trail exists for
-- in the first place.
--
-- Implemented as a BEFORE UPDATE/DELETE trigger that always raises,
-- rather than REVOKE UPDATE/DELETE on a role: REVOKE would need to
-- name the exact application DB role by value, which differs per
-- environment (POSTGRES_USER is environment-supplied — see
-- docker-compose.yml / .env.example) and isn't reliably knowable at
-- migration time. A trigger applies unconditionally to every role
-- (including the migration/superuser role itself), so it also has to
-- be dropped explicitly for any legitimate one-off maintenance (see
-- the rollback note below) rather than relying on a specific role
-- name still matching in every deployment.
--
-- This intentionally does NOT block INSERT (new rows must still be
-- written) or SELECT (audit-logs.repository.ts must still read them).
--
-- Rollback / legitimate maintenance (e.g. a court-ordered redaction or
-- a retention-policy purge, if one is ever introduced): an operator
-- with direct DB access must explicitly run
--   DROP TRIGGER audit_logs_prevent_update_delete ON "audit_logs";
-- perform the maintenance, and recreate the trigger (the CREATE TRIGGER
-- statement below) afterward — there is deliberately no toggle or flag
-- to do this from application code.

CREATE OR REPLACE FUNCTION audit_logs_reject_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_prevent_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_reject_update_delete();
