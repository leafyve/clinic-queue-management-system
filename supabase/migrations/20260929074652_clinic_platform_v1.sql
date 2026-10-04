-- Jo-Lin Family Clinic & Surgery digital care platform
-- Supabase/PostgreSQL schema, authorization, queue transactions, and audit trail.

create extension if not exists pgcrypto;

create type public.app_role as enum ('patient', 'receptionist', 'doctor', 'admin');
create type public.appointment_status as enum ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.queue_status as enum ('waiting', 'called', 'in_consultation', 'skipped', 'completed', 'cancelled', 'left');
create type public.queue_priority as enum ('normal', 'urgent', 'emergency');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'cancelled');
create type public.notification_kind as enum ('queue_joined', 'queue_approaching', 'queue_called', 'appointment_reminder');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address_lines text[] not null,
  postal_code text not null,
  phone text not null,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'patient',
  full_name text not null default '',
  email text,
  phone text,
  avatar_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  clinic_id uuid not null references public.clinics(id),
  full_name text not null,
  date_of_birth date,
  gender text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  phone text not null,
  email text,
  allergies_encrypted text,
  emergency_contact_encrypted text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id),
  role public.app_role not null check (role in ('receptionist', 'doctor', 'admin')),
  employee_code text unique,
  created_at timestamptz not null default now()
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.staff(id) on delete cascade,
  display_name text not null,
  registration_number_encrypted text,
  average_consultation_minutes numeric(5,2) not null default 12 check (average_consultation_minutes between 1 and 180),
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  queue_paused boolean not null default false,
  pause_reason text,
  queue_open boolean not null default true,
  max_remote_queue_size integer not null default 40 check (max_remote_queue_size between 1 and 500),
  approaching_threshold integer not null default 3 check (approaching_threshold between 1 and 20),
  operating_hours jsonb not null default '{"mon":["08:30","16:30"],"tue":["08:30","16:30"],"wed":["08:30","16:30"],"thu":["08:30","16:30"],"fri":["08:30","16:30"],"sat":["08:30","12:30"],"sun":[]}'::jsonb,
  whatsapp_enabled boolean not null default false,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid references public.doctors(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (char_length(reason) between 2 and 500),
  status public.appointment_status not null default 'scheduled',
  booked_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_time_valid check (ends_at > starts_at)
);

create unique index appointments_doctor_slot_unique
  on public.appointments(doctor_id, starts_at)
  where status in ('scheduled', 'checked_in');
create index appointments_patient_date_idx on public.appointments(patient_id, starts_at desc);

create table public.queue_counters (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  queue_date date not null,
  last_number integer not null default 0,
  primary key (clinic_id, queue_date)
);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  appointment_id uuid references public.appointments(id),
  queue_date date not null default ((now() at time zone 'Asia/Singapore')::date),
  sequence_number integer,
  queue_number text,
  priority public.queue_priority not null default 'normal',
  priority_reason text,
  status public.queue_status not null default 'waiting',
  source text not null default 'remote' check (source in ('remote', 'walk_in', 'appointment')),
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  consultation_started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (clinic_id, queue_date, sequence_number),
  unique (clinic_id, queue_date, queue_number)
);

create unique index queue_one_active_entry_per_patient
  on public.queue_entries(clinic_id, queue_date, patient_id)
  where status in ('waiting', 'called', 'in_consultation', 'skipped');
create index queue_operational_order_idx
  on public.queue_entries(clinic_id, queue_date, status, priority desc, joined_at);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  queue_entry_id uuid unique references public.queue_entries(id),
  appointment_id uuid references public.appointments(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid not null references public.doctors(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer generated always as (
    case when ended_at is null then null else greatest(1, ceil(extract(epoch from (ended_at - started_at)) / 60.0)::integer) end
  ) stored,
  chief_complaint text,
  notes_encrypted text,
  diagnosis_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultation_time_valid check (ended_at is null or ended_at >= started_at)
);
create index consultations_history_idx on public.consultations(patient_id, started_at desc);

create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  consultation_id uuid references public.consultations(id),
  record_type text not null check (record_type in ('clinical_note', 'allergy', 'diagnosis', 'document')),
  title text not null,
  content_encrypted text,
  storage_path text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  name text not null,
  strength text,
  form text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, name, strength, form)
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  consultation_id uuid not null references public.consultations(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid not null references public.doctors(id),
  issued_at timestamptz not null default now(),
  notes_encrypted text,
  created_at timestamptz not null default now()
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medication_id uuid references public.medications(id),
  medication_name text not null,
  dosage text not null,
  frequency text not null,
  duration text not null,
  instructions text,
  sort_order integer not null default 0
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  queue_entry_id uuid references public.queue_entries(id),
  appointment_id uuid references public.appointments(id),
  kind public.notification_kind not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  destination_encrypted text not null,
  template_name text not null,
  template_parameters_encrypted text,
  status public.notification_status not null default 'pending',
  provider_message_id text,
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_delivery_idx on public.notifications(status, scheduled_for) where status in ('pending', 'failed');

create table public.audit_logs (
  id bigint generated always as identity primary key,
  clinic_id uuid references public.clinics(id),
  actor_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index audit_logs_clinic_time_idx on public.audit_logs(clinic_id, created_at desc);

create table private.rate_limit_buckets (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now()
);

create or replace function private.staff_has_role(required_roles public.app_role[], target_clinic uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    join public.users u on u.id = s.user_id
    where s.user_id = (select auth.uid())
      and s.role = any(required_roles)
      and u.is_active
      and (target_clinic is null or s.clinic_id = target_clinic)
  );
$$;
revoke all on function private.staff_has_role(public.app_role[], uuid) from public, anon;
grant execute on function private.staff_has_role(public.app_role[], uuid) to authenticated;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;
revoke all on function private.current_user_role() from public, anon;
grant execute on function private.current_user_role() to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare default_clinic uuid;
begin
  insert into public.users (id, role, full_name, email, phone)
  values (new.id, 'patient', coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, new.phone)
  on conflict (id) do nothing;

  if new.phone is not null then
    select id into default_clinic from public.clinics where slug = 'jo-lin-family-clinic' limit 1;
    if default_clinic is not null then
      insert into public.patients (user_id, clinic_id, full_name, phone, email, consented_at)
      values (new.id, default_clinic, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Patient'), new.phone, new.email, now())
      on conflict (user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.assign_queue_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare next_value integer;
begin
  insert into public.queue_counters (clinic_id, queue_date, last_number)
  values (new.clinic_id, new.queue_date, 1)
  on conflict (clinic_id, queue_date)
  do update set last_number = public.queue_counters.last_number + 1
  returning last_number into next_value;

  new.sequence_number = next_value;
  new.queue_number = 'A' || lpad(next_value::text, 3, '0') ||
    case when new.priority = 'emergency' then '-E' else '' end;
  return new;
end;
$$;

create trigger queue_number_before_insert before insert on public.queue_entries
for each row execute function private.assign_queue_number();

create trigger users_updated_at before update on public.users for each row execute function private.set_updated_at();
create trigger patients_updated_at before update on public.patients for each row execute function private.set_updated_at();
create trigger appointments_updated_at before update on public.appointments for each row execute function private.set_updated_at();
create trigger queue_entries_updated_at before update on public.queue_entries for each row execute function private.set_updated_at();
create trigger consultations_updated_at before update on public.consultations for each row execute function private.set_updated_at();
create trigger notifications_updated_at before update on public.notifications for each row execute function private.set_updated_at();

create or replace function public.call_next_patient(target_clinic uuid)
returns public.queue_entries
language plpgsql
security definer
set search_path = ''
as $$
declare selected public.queue_entries;
begin
  if not private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], target_clinic) then
    raise exception 'not_authorized';
  end if;

  if exists (select 1 from public.clinic_settings where clinic_id = target_clinic and queue_paused) then
    raise exception 'queue_paused';
  end if;

  update public.queue_entries
  set status = 'waiting', called_at = null
  where clinic_id = target_clinic
    and queue_date = (now() at time zone 'Asia/Singapore')::date
    and status = 'called';

  select * into selected
  from public.queue_entries
  where clinic_id = target_clinic
    and queue_date = (now() at time zone 'Asia/Singapore')::date
    and status in ('waiting','skipped')
  order by
    case priority when 'emergency' then 0 when 'urgent' then 1 else 2 end,
    case status when 'waiting' then 0 else 1 end,
    joined_at
  for update skip locked
  limit 1;

  if selected.id is null then return null; end if;

  update public.queue_entries set status = 'called', called_at = now() where id = selected.id returning * into selected;
  insert into public.audit_logs (clinic_id, actor_id, action, entity_type, entity_id)
  values (target_clinic, (select auth.uid()), 'queue.call_next', 'queue_entry', selected.id);
  return selected;
end;
$$;
revoke all on function public.call_next_patient(uuid) from public, anon;
grant execute on function public.call_next_patient(uuid) to authenticated;

create or replace function public.set_queue_pause(target_clinic uuid, should_pause boolean, reason text default null)
returns public.clinic_settings
language plpgsql
security definer
set search_path = ''
as $$
declare settings public.clinic_settings;
begin
  if not private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], target_clinic) then
    raise exception 'not_authorized';
  end if;
  update public.clinic_settings
  set queue_paused = should_pause,
      pause_reason = case when should_pause then nullif(trim(reason), '') else null end,
      updated_by = (select auth.uid()), updated_at = now()
  where clinic_id = target_clinic returning * into settings;
  insert into public.audit_logs (clinic_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_clinic, (select auth.uid()), case when should_pause then 'queue.pause' else 'queue.resume' end,
          'clinic_settings', target_clinic, jsonb_build_object('reason', settings.pause_reason));
  return settings;
end;
$$;
revoke all on function public.set_queue_pause(uuid, boolean, text) from public, anon;
grant execute on function public.set_queue_pause(uuid, boolean, text) to authenticated;

create or replace function public.consume_rate_limit(key_hash text, max_requests integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare allowed boolean;
begin
  if max_requests < 1 or window_seconds < 1 then return false; end if;
  insert into private.rate_limit_buckets as bucket (key_hash, window_started_at, request_count)
  values (key_hash, now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case when bucket.window_started_at <= now() - make_interval(secs => window_seconds) then now() else bucket.window_started_at end,
        request_count = case when bucket.window_started_at <= now() - make_interval(secs => window_seconds) then 1 else bucket.request_count + 1 end,
        updated_at = now()
  returning request_count <= max_requests into allowed;
  return allowed;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

alter table public.clinics enable row level security;
alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.staff enable row level security;
alter table public.doctors enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.queue_counters enable row level security;
alter table public.queue_entries enable row level security;
alter table public.consultations enable row level security;
alter table public.medical_records enable row level security;
alter table public.medications enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.clinics, public.clinic_settings to anon, authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update on public.patients to authenticated;
grant select on public.staff, public.doctors to authenticated;
grant select on public.appointments, public.queue_entries to authenticated;
grant select on public.consultations, public.medical_records, public.prescriptions, public.prescription_items to authenticated;
grant select on public.medications, public.notifications, public.audit_logs to authenticated;

create policy "Public clinic details" on public.clinics for select to anon, authenticated using (true);
create policy "Public operational settings" on public.clinic_settings for select to anon, authenticated using (true);

create policy "Users read self or staff" on public.users for select to authenticated
using ((select auth.uid()) = id or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[]));
create policy "Users update self" on public.users for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id and role = private.current_user_role());

create policy "Patients read own or clinic staff" on public.patients for select to authenticated
using (user_id = (select auth.uid()) or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Patients create own" on public.patients for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Patients update own or clinic staff" on public.patients for update to authenticated
using (user_id = (select auth.uid()) or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id))
with check (user_id = (select auth.uid()) or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));

create policy "Authenticated view staff directory" on public.staff for select to authenticated using (true);
create policy "Authenticated view doctor directory" on public.doctors for select to authenticated using (true);

create policy "Patients read own appointments or staff" on public.appointments for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Patients book own appointments" on public.appointments for insert to authenticated
with check (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
            or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Appointments update by owner or staff" on public.appointments for update to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id))
with check (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));

create policy "Patients read own queue or staff" on public.queue_entries for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Patients join own queue or staff" on public.queue_entries for insert to authenticated
with check (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
            or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Staff update queue" on public.queue_entries for update to authenticated
using (private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id))
with check (private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));

create policy "Clinical history access" on public.consultations for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));
create policy "Doctors create consultations" on public.consultations for insert to authenticated
with check (private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));
create policy "Doctors update consultations" on public.consultations for update to authenticated
using (private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id))
with check (private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));

create policy "Medical records owner or clinical staff" on public.medical_records for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));
create policy "Doctors create medical records" on public.medical_records for insert to authenticated
with check (private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));

create policy "Medication directory for signed in users" on public.medications for select to authenticated using (true);

create policy "Prescriptions owner or clinical staff" on public.prescriptions for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));
create policy "Doctors create prescriptions" on public.prescriptions for insert to authenticated
with check (private.staff_has_role(array['doctor','admin']::public.app_role[], clinic_id));
create policy "Prescription items follow prescription access" on public.prescription_items for select to authenticated
using (exists (select 1 from public.prescriptions rx where rx.id = prescription_id and
  (exists (select 1 from public.patients p where p.id = rx.patient_id and p.user_id = (select auth.uid()))
   or private.staff_has_role(array['doctor','admin']::public.app_role[], rx.clinic_id))));
create policy "Doctors create prescription items" on public.prescription_items for insert to authenticated
with check (exists (select 1 from public.prescriptions rx where rx.id = prescription_id
  and private.staff_has_role(array['doctor','admin']::public.app_role[], rx.clinic_id)));

create policy "Patients see own notification log or staff" on public.notifications for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.user_id = (select auth.uid()))
       or private.staff_has_role(array['receptionist','doctor','admin']::public.app_role[], clinic_id));
create policy "Admins read audit logs" on public.audit_logs for select to authenticated
using (private.staff_has_role(array['admin']::public.app_role[], clinic_id));

alter publication supabase_realtime add table public.queue_entries;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.clinic_settings;
alter publication supabase_realtime add table public.notifications;
