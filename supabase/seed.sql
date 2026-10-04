insert into public.clinics (id, name, slug, address_lines, postal_code, phone, timezone)
values (
  '10000000-0000-4000-8000-000000000001',
  'Jo-Lin Family Clinic & Surgery',
  'jo-lin-family-clinic',
  array['533 Choa Chu Kang Street 51', '#02-06', 'Singapore 680533'],
  '680533',
  '6760 6014',
  'Asia/Singapore'
)
on conflict (id) do update set name = excluded.name;

insert into public.clinic_settings (clinic_id)
values ('10000000-0000-4000-8000-000000000001')
on conflict (clinic_id) do nothing;

insert into public.medications (clinic_id, name, strength, form)
values
  ('10000000-0000-4000-8000-000000000001', 'Paracetamol', '500 mg', 'tablet'),
  ('10000000-0000-4000-8000-000000000001', 'Cetirizine', '10 mg', 'tablet'),
  ('10000000-0000-4000-8000-000000000001', 'Amoxicillin', '500 mg', 'capsule'),
  ('10000000-0000-4000-8000-000000000001', 'Salbutamol', '100 mcg', 'inhaler')
on conflict (clinic_id, name, strength, form) do nothing;
