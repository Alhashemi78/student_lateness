-- Apply to the existing Supabase project to let authorized owners resubmit rejected events.
begin;
drop policy if exists school_events_update on public.school_events;
create policy school_events_update on public.school_events for update to authenticated using (
 exists (select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')) and role='admin')
 or (owner_id=(select auth.uid()) and status in ('pending','rejected') and exists (
 select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email'))))
) with check (
 exists (select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')) and role='admin')
 or (owner_id=(select auth.uid()) and status='pending' and review_note='' and exists (
 select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email'))))
);
create or replace function public.validate_school_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare admin_user boolean;
begin
 select exists (select 1 from public.school_event_access where email=lower(auth.jwt()->>'email') and role='admin') into admin_user;
 if TG_OP='UPDATE' then
   if new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
     raise exception 'لا يمكن تغيير صاحب السجل أو وقت إنشائه';
   end if;
   if not admin_user and (new.status is distinct from old.status or new.review_note is distinct from old.review_note)
      and not (old.owner_id=auth.uid() and old.status='rejected' and new.status='pending' and new.review_note='') then
     raise exception 'اعتماد الفعاليات مخصص للإدارة';
   end if;
 end if;
 if not (new.slots <@ array['الطابور الصباحي','الحصة الأولى','الحصة الثانية','الحصة الثالثة','الحصة الرابعة','الحصة الخامسة','الحصة السادسة','الحصة السابعة','الفسحة الأولى','الفسحة الثانية','طوال اليوم','بعد الدوام الرسمي']::text[]) then
   raise exception 'فترة غير معتمدة';
 end if;
 if cardinality(new.slots) <> (select count(distinct s) from unnest(new.slots) s) then
   raise exception 'لا يمكن تكرار الفترة';
 end if;
 if (new.slots && array['طوال اليوم','بعد الدوام الرسمي']) and cardinality(new.slots)<>1 then
   raise exception 'اختر طوال اليوم أو بعد الدوام بمفرده';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(new.place)),0));
 if new.status<>'rejected' and exists (
   select 1 from public.school_events e where e.id<>new.id and e.status<>'rejected'
   and lower(btrim(e.place))=lower(btrim(new.place))
   and e.start_date<=new.end_date and e.end_date>=new.start_date
   and (e.slots && new.slots
     or ('طوال اليوم'=any(e.slots) and not ('بعد الدوام الرسمي'=any(new.slots)))
     or ('طوال اليوم'=any(new.slots) and not ('بعد الدوام الرسمي'=any(e.slots))))
 ) then raise exception 'يوجد تعارض في المكان والتاريخ والفترة مع فعالية مسجلة'; end if;
 new.updated_at=now();
 return new;
end $$;
commit;
