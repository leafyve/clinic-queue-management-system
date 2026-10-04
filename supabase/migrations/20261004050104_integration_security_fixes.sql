-- Defects reproduced by the local integration acceptance suite.
-- Keep the initial migration unchanged; restore least privilege and atomic commands.
revoke update on public.users from authenticated;
grant update (full_name, avatar_path) on public.users to authenticated;
drop policy "Users read self or staff" on public.users;
create policy "Users read self or same clinic staff" on public.users for select to authenticated
using (id=(select auth.uid())
  or exists(select 1 from public.patients p where p.user_id=users.id and private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[],p.clinic_id))
  or exists(select 1 from public.staff s where s.user_id=users.id and private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[],s.clinic_id)));
revoke insert, update, select on public.patients from authenticated;
grant select (id,user_id,clinic_id,full_name,date_of_birth,gender,phone,email,consented_at,created_at,updated_at)
  on public.patients to authenticated;
grant update (full_name,date_of_birth,gender,phone,email) on public.patients to authenticated;

drop policy "Authenticated view staff directory" on public.staff;
create policy "Staff see clinic directory" on public.staff for select to authenticated
using (private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
drop policy "Authenticated view doctor directory" on public.doctors;
create policy "Staff see doctors" on public.doctors for select to authenticated
using (exists (select 1 from public.staff s where s.id=staff_id));

create or replace function private.staff_has_role(required_roles public.app_role[], target_clinic uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s join public.users u on u.id=s.user_id
    where s.user_id=(select auth.uid()) and s.role=any(required_roles) and u.role=s.role and u.is_active
      and (target_clinic is null or s.clinic_id=target_clinic));
$$;
create function private.user_is_active() returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.users where id=(select auth.uid()) and is_active);
$$;
revoke all on function private.user_is_active() from public, anon;
grant execute on function private.user_is_active() to authenticated;
do $$ declare t text; begin
  foreach t in array array['users','patients','staff','doctors','appointments','queue_entries','consultations','medical_records','prescriptions','prescription_items','notifications','audit_logs','medications'] loop
    execute format('create policy "Active account required" on public.%I as restrictive for all to authenticated using (private.user_is_active()) with check (private.user_is_active())',t);
  end loop;
end $$;

create or replace function public.consume_rate_limit(key_hash text, max_requests integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
  if max_requests<1 or window_seconds<1 then return false; end if;
  insert into private.rate_limit_buckets as bucket (key_hash,window_started_at,request_count)
  values ($1,now(),1)
  on conflict on constraint rate_limit_buckets_pkey do update
    set window_started_at=case when bucket.window_started_at<=now()-make_interval(secs=>$3) then now() else bucket.window_started_at end,
        request_count=case when bucket.window_started_at<=now()-make_interval(secs=>$3) then 1 else bucket.request_count+1 end,
        updated_at=now()
  returning request_count<=$2 into allowed;
  return allowed;
end $$;

create or replace function private.assign_queue_number() returns trigger language plpgsql security definer set search_path='' as $$
declare next_value integer;
begin
  insert into public.queue_counters (clinic_id,queue_date,last_number) values (new.clinic_id,new.queue_date,1)
  on conflict (clinic_id,queue_date) do update set last_number=public.queue_counters.last_number+1
  returning last_number into next_value;
  new.sequence_number=next_value;
  new.queue_number='A'||lpad(next_value::text,greatest(3,length(next_value::text)),'0')||case when new.priority='emergency' then '-E' else '' end;
  return new;
end $$;

create function private.invalidate_queue() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Public operational metadata is the privacy-safe Realtime invalidation signal.
  update public.clinic_settings set updated_at=clock_timestamp() where clinic_id=coalesce(new.clinic_id,old.clinic_id);
  return coalesce(new,old);
end $$;
create trigger queue_snapshot_changed after insert or update or delete on public.queue_entries
for each row execute function private.invalidate_queue();

create function public.join_remote_queue() returns public.queue_entries language plpgsql security definer set search_path='' as $$
declare p public.patients; settings public.clinic_settings; result public.queue_entries; day date;
begin
  if not private.user_is_active() or private.current_user_role()<>'patient' then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into p from public.patients where user_id=(select auth.uid());
  if p.id is null then raise exception 'not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('queue:'||p.clinic_id::text,0));
  select * into settings from public.clinic_settings where clinic_id=p.clinic_id;
  day=(now() at time zone 'Asia/Singapore')::date;
  if not settings.queue_open then raise exception 'queue_closed' using errcode='P0001'; end if;
  if exists(select 1 from public.queue_entries where clinic_id=p.clinic_id and queue_date=day and patient_id=p.id and status in ('waiting','called','in_consultation','skipped')) then
    raise exception 'already_queued' using errcode='23505';
  end if;
  if (select count(*) from public.queue_entries where clinic_id=p.clinic_id and queue_date=day and status in ('waiting','called','in_consultation','skipped'))>=settings.max_remote_queue_size then
    raise exception 'queue_full' using errcode='P0001';
  end if;
  insert into public.queue_entries(clinic_id,patient_id,source,created_by) values(p.clinic_id,p.id,'remote',(select auth.uid())) returning * into result;
  update public.patients set consented_at=now() where id=p.id;
  insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id) values(p.clinic_id,(select auth.uid()),'queue.join_remote','queue_entry',result.id);
  return result;
end $$;
revoke all on function public.join_remote_queue() from public,anon;
grant execute on function public.join_remote_queue() to authenticated;

create or replace function public.call_next_patient(target_clinic uuid) returns public.queue_entries language plpgsql security definer set search_path='' as $$
declare result public.queue_entries;
begin
  if not private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[],target_clinic) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('queue:'||target_clinic::text,0));
  if exists(select 1 from public.clinic_settings where clinic_id=target_clinic and queue_paused) then raise exception 'queue_paused'; end if;
  select * into result from public.queue_entries where clinic_id=target_clinic and queue_date=(now() at time zone 'Asia/Singapore')::date and status in ('called','in_consultation') order by sequence_number limit 1;
  -- An already called/in-progress patient owns the single consultation slot.
  if result.id is not null then return result; end if;
  select * into result from public.queue_entries where clinic_id=target_clinic and queue_date=(now() at time zone 'Asia/Singapore')::date and status in ('waiting','skipped')
  order by case priority when 'emergency' then 0 when 'urgent' then 1 else 2 end,
    case status when 'waiting' then 0 else 1 end, joined_at,sequence_number for update limit 1;
  if result.id is null then return null; end if;
  update public.queue_entries set status='called',called_at=now() where id=result.id returning * into result;
  insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id) values(target_clinic,(select auth.uid()),'queue.call_next','queue_entry',result.id);
  return result;
end $$;

create function public.apply_queue_action(target_clinic uuid, entry_id uuid, command text) returns public.queue_entries language plpgsql security definer set search_path='' as $$
declare result public.queue_entries;
begin
  if not private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[],target_clinic) then raise exception 'not_authorized' using errcode='42501'; end if;
  if command='start' and not private.staff_has_role(array['doctor','admin']::public.app_role[],target_clinic) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('queue:'||target_clinic::text,0));
  select * into result from public.queue_entries where id=entry_id and clinic_id=target_clinic and queue_date=(now() at time zone 'Asia/Singapore')::date for update;
  if result.id is null then raise exception 'entry_not_found' using errcode='42501'; end if;
  if command not in ('recall','skip','complete','start','emergency') then raise exception 'invalid_queue_action'; end if;
  if result.status in ('completed','cancelled','left') then
    if command='complete' and result.status='completed' then return result; end if;
    raise exception 'invalid_queue_transition';
  end if;
  if command in ('start','recall') and exists(select 1 from public.queue_entries where clinic_id=target_clinic and queue_date=result.queue_date and id<>result.id and status in ('called','in_consultation')) then raise exception 'consultation_slot_busy'; end if;
  if command in ('start','recall') and exists(select 1 from public.clinic_settings where clinic_id=target_clinic and queue_paused) then raise exception 'queue_paused'; end if;
  if command='start' and result.status='in_consultation' then return result; end if;
  if command='emergency' and result.priority='emergency' then return result; end if;
  update public.queue_entries set
    status=case command when 'recall' then 'called'::public.queue_status when 'skip' then 'skipped'::public.queue_status when 'complete' then 'completed'::public.queue_status when 'start' then 'in_consultation'::public.queue_status else status end,
    priority=case when command='emergency' then 'emergency'::public.queue_priority else priority end,
    queue_number=case when command='emergency' and right(queue_number,2)<>'-E' then queue_number||'-E' else queue_number end,
    priority_reason=case when command='emergency' then 'Marked emergency by reception' else priority_reason end,
    called_at=case when command='recall' then now() else called_at end,
    skipped_at=case when command='skip' then now() else skipped_at end,
    completed_at=case when command='complete' then now() else completed_at end,
    consultation_started_at=case when command='start' then now() else consultation_started_at end
  where id=entry_id returning * into result;
  insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id) values(target_clinic,(select auth.uid()),'queue.'||command,'queue_entry',entry_id);
  return result;
end $$;
revoke all on function public.apply_queue_action(uuid,uuid,text) from public,anon;
grant execute on function public.apply_queue_action(uuid,uuid,text) to authenticated;

create function public.complete_consultation(entry_id uuid, target_patient uuid, target_doctor uuid, complaint text, encrypted_notes text, encrypted_diagnosis text, items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare q public.queue_entries; result uuid; rx uuid; item jsonb; item_index integer=0; existing uuid;
begin
  select * into q from public.queue_entries where id=entry_id;
  if q.id is null or q.patient_id<>target_patient or not private.staff_has_role(array['doctor','admin']::public.app_role[],q.clinic_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.doctors d join public.staff s on s.id=d.staff_id where d.id=target_doctor and s.clinic_id=q.clinic_id and (s.user_id=(select auth.uid()) or private.staff_has_role(array['admin']::public.app_role[],q.clinic_id))) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('queue:'||q.clinic_id::text,0));
  select * into q from public.queue_entries where id=entry_id for update;
  select id into existing from public.consultations where queue_entry_id=entry_id;
  if existing is not null then raise exception 'consultation_already_completed'; end if;
  if q.status<>'in_consultation' or q.consultation_started_at is null then raise exception 'consultation_not_started'; end if;
  if encrypted_notes !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$' or encrypted_diagnosis !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$' then raise exception 'invalid_encrypted_content'; end if;
  insert into public.consultations(clinic_id,queue_entry_id,appointment_id,patient_id,doctor_id,started_at,ended_at,chief_complaint,notes_encrypted,diagnosis_encrypted)
  values(q.clinic_id,q.id,q.appointment_id,q.patient_id,target_doctor,q.consultation_started_at,now(),complaint,encrypted_notes,encrypted_diagnosis) returning id into result;
  if jsonb_array_length(items)>0 then
    insert into public.prescriptions(clinic_id,consultation_id,patient_id,doctor_id) values(q.clinic_id,result,q.patient_id,target_doctor) returning id into rx;
    for item in select value from jsonb_array_elements(items) loop
      if item->>'medicationId' is not null and not exists(select 1 from public.medications where id=(item->>'medicationId')::uuid and clinic_id=q.clinic_id and active) then raise exception 'invalid_medication'; end if;
      insert into public.prescription_items(prescription_id,medication_id,medication_name,dosage,frequency,duration,instructions,sort_order)
      values(rx,(item->>'medicationId')::uuid,item->>'medicationName',item->>'dosage',item->>'frequency',item->>'duration',item->>'instructions',item_index);
      item_index=item_index+1;
    end loop;
    insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id) values(q.clinic_id,(select auth.uid()),'prescription.create','prescription',rx);
  end if;
  update public.queue_entries set status='completed',completed_at=now() where id=q.id;
  if q.appointment_id is not null then update public.appointments set status='completed' where id=q.appointment_id; end if;
  insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id) values(q.clinic_id,(select auth.uid()),'consultation.complete','consultation',result);
  return result;
end $$;
revoke all on function public.complete_consultation(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
-- Clinical encryption is performed by the server; patients cannot supply ciphertext to privileged commands.
-- RPC uses the authenticated doctor's session, with ownership checked in the function as well.
grant execute on function public.complete_consultation(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;

-- A non-null doctor and range constraint close the overlap/NULL slot loopholes.
create extension if not exists btree_gist;
alter table public.appointments alter column doctor_id set not null;
alter table public.appointments add constraint appointments_no_overlap exclude using gist
  (doctor_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (status in ('scheduled','checked_in'));

create unique index notifications_queue_dedup on public.notifications(queue_entry_id,kind) where queue_entry_id is not null;
create unique index notifications_appointment_dedup on public.notifications(appointment_id,kind) where appointment_id is not null;
create function public.claim_notifications(batch_size integer default 25) returns setof public.notifications
language sql security definer set search_path='' as $$
  update public.notifications n set status='processing',attempts=n.attempts+1
  where n.id in (select job.id from public.notifications job join public.clinic_settings s on s.clinic_id=job.clinic_id
    where s.whatsapp_enabled and job.status in ('pending','failed') and job.scheduled_for<=now() and job.attempts<4
    order by job.scheduled_for,job.id for update of job skip locked limit least(greatest(batch_size,1),25))
  returning n.*;
$$;
revoke all on function public.claim_notifications(integer) from public,anon,authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- A repeated reception submission must not create multiple patients/tickets.
-- Identity matching requires name, contact and DOB, not a shared phone alone.
create function public.add_walk_in_patient(full_name_input text, phone_input text, birth_input date default null)
returns public.queue_entries language plpgsql security definer set search_path='' as $$
declare clinic uuid; person uuid; ticket public.queue_entries; today date;
begin
  select s.clinic_id into clinic from public.staff s where s.user_id=(select auth.uid());
  if clinic is null or not private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[],clinic) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if length(btrim(full_name_input)) not between 2 and 150 or phone_input !~ '^[+0-9 -]{8,20}$' then
    raise exception 'invalid_patient' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('queue:'||clinic::text,0));
  today:=(now() at time zone 'Asia/Singapore')::date;
  select p.id into person from public.patients p where p.clinic_id=clinic and p.full_name=btrim(full_name_input)
    and p.phone=btrim(phone_input) and p.date_of_birth is not distinct from birth_input order by p.created_at,p.id limit 1;
  if person is not null then
    select * into ticket from public.queue_entries q where q.patient_id=person and q.clinic_id=clinic and q.queue_date=today
      and q.status in ('waiting','called','in_consultation','skipped');
    if ticket.id is not null then return ticket; end if;
  else
    insert into public.patients(clinic_id,full_name,phone,date_of_birth,consented_at)
      values(clinic,btrim(full_name_input),btrim(phone_input),birth_input,now()) returning id into person;
  end if;
  insert into public.queue_entries(clinic_id,patient_id,source,created_by)
    values(clinic,person,'walk_in',(select auth.uid())) returning * into ticket;
  insert into public.audit_logs(clinic_id,actor_id,action,entity_type,entity_id)
    values(clinic,(select auth.uid()),'queue.add_walk_in','queue_entry',ticket.id);
  return ticket;
end $$;
revoke all on function public.add_walk_in_patient(text,text,date) from public,anon;
grant execute on function public.add_walk_in_patient(text,text,date) to authenticated;
