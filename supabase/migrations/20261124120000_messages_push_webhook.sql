-- Fires the send-push Edge Function whenever a new anonymous message is
-- inserted, so the recipient gets a Web Push notification and their
-- installed app's badge updates even when TYM is fully closed.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_message_push()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://hyvymincmtmcnvglgofh.supabase.co/functions/v1/send-push',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'messages',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', null
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'saOH_f5p2h_9An6mz-F9OkfUpIufVTCp'
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

drop trigger if exists on_new_message_push on public.messages;
create trigger on_new_message_push
after insert on public.messages
for each row
execute function public.notify_new_message_push();
