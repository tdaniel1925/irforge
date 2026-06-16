-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: audit_log immutability trigger blocked company/user DELETE (cascade 500).
-- Run this once in the Supabase SQL Editor. Idempotent.
--
-- Problem: the old trigger blocked ALL update/delete on audit_log. Deleting a
-- company fires an FK cascade that SET NULLs audit_log.company_id (an UPDATE),
-- which the trigger rejected → the whole DELETE failed with a 500.
--
-- Fix: block only changes to the row's CONTENT; allow the FK company_id→null
-- nulling and allow deletes. Tamper protection is preserved.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.action is distinct from old.action
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.payload is distinct from old.payload
       or new.actor_user_id is distinct from old.actor_user_id
       or new.actor_email is distinct from old.actor_email
       or new.created_at is distinct from old.created_at then
      raise exception 'audit_log is append-only — content cannot be modified';
    end if;
    return new;
  end if;
  return old; -- DELETE allowed (cascade cleanup); content already immutable above
end; $$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
