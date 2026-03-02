create table custom_agents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  sprite_id int not null,
  name text not null,
  persona text not null,
  created_at timestamptz default now()
);

alter table custom_agents enable row level security;

create policy "users_own_agents" on custom_agents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
