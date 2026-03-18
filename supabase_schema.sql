begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    display_name text not null,
    avatar_url text,
    created_at timestamptz not null default now(),
    constraint profiles_username_format check (username ~ '^[a-z0-9_]+$')
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references auth.users(id) on delete cascade,
    content text not null,
    image_url text,
    created_at timestamptz not null default now()
);

create index if not exists idx_messages_recipient_id on public.messages(recipient_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
on public.profiles
for select
to public
using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists messages_insert_anyone on public.messages;
create policy messages_insert_anyone
on public.messages
for insert
to public
with check (true);

drop policy if exists messages_select_recipient_only on public.messages;
create policy messages_select_recipient_only
on public.messages
for select
to authenticated
using (auth.uid() = recipient_id);

drop policy if exists messages_delete_recipient_only on public.messages;
create policy messages_delete_recipient_only
on public.messages
for delete
to authenticated
using (auth.uid() = recipient_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (
        id,
        username,
        display_name,
        avatar_url
    )
    values (
        new.id,
        lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
        coalesce(
            new.raw_user_meta_data->>'display_name',
            new.raw_user_meta_data->>'username',
            split_part(new.email, '@', 1)
        ),
        null
    )
    on conflict (id) do update
    set
        username = excluded.username,
        display_name = excluded.display_name;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'message-images',
    'message-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_public_read_avatars on storage.objects;
create policy storage_public_read_avatars
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists storage_public_read_message_images on storage.objects;
create policy storage_public_read_message_images
on storage.objects
for select
to public
using (bucket_id = 'message-images');

drop policy if exists storage_insert_avatars_own_folder on storage.objects;
create policy storage_insert_avatars_own_folder
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_update_avatars_owner_only on storage.objects;
create policy storage_update_avatars_owner_only
on storage.objects
for update
to authenticated
using (
    bucket_id = 'avatars'
    and owner = auth.uid()
)
with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_delete_avatars_owner_only on storage.objects;
create policy storage_delete_avatars_owner_only
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'avatars'
    and owner = auth.uid()
);

drop policy if exists storage_insert_message_images_anyone on storage.objects;
create policy storage_insert_message_images_anyone
on storage.objects
for insert
to public
with check (
    bucket_id = 'message-images'
);

drop policy if exists storage_update_message_images_owner_only on storage.objects;
create policy storage_update_message_images_owner_only
on storage.objects
for update
to authenticated
using (
    bucket_id = 'message-images'
    and owner = auth.uid()
)
with check (
    bucket_id = 'message-images'
    and owner = auth.uid()
);

drop policy if exists storage_delete_message_images_owner_only on storage.objects;
create policy storage_delete_message_images_owner_only
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'message-images'
    and owner = auth.uid()
);

commit;
