# Cloud saves & accounts

The game works fully without this. Progress saves to the browser's
`localStorage`, and a save code can move it between devices by hand.

Turning this on adds email accounts and automatic cross-device sync: sign in on
a phone, keep playing on a laptop.

It takes about five minutes.

---

> **This build is already pointed at a project**
> (`kzlsyxxgepguwrnyyyvx.supabase.co`), so only two dashboard steps remain:
>
> 1. **Step 2** — run the SQL.
> 2. **Step 3** — turn off *Confirm email*.
>
> Then open the game → **ACCOUNT** → **TEST CONNECTION**. It reports both, so
> you can confirm each one took effect without leaving the game.

## 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) (the free tier is plenty — a
save is a few kilobytes) and create a project.

From **Project Settings → API**, copy two values:

| Value | Looks like | Secret? |
|---|---|---|
| Project URL | `https://abcdefghijklm.supabase.co` | No |
| `anon` `public` key | a long `eyJ…` string | **No — safe to publish** |

> **Do not use the `service_role` key.** That one bypasses all security rules.
> The `anon` key is designed to sit in client-side code; it identifies the
> project but grants nothing on its own. Access is decided by the security
> policy in step 2, which is why that step is not optional.

## 2. Create the table and lock it down

In the Supabase dashboard open **SQL Editor** and run this:

```sql
-- One row per player.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  payload    text        not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security is what makes the public anon key safe: without a policy
-- granting it, nobody can read or write anything.
alter table public.saves enable row level security;

-- Each signed-in player may only touch their own row.
create policy "players read their own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "players write their own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "players update their own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Verify it worked, either way:

- **In Supabase:** Table Editor → `saves` shows the table, and Authentication →
  Policies lists three policies against it.
- **In the game (easier):** Hub → **ACCOUNT** → **TEST CONNECTION**. It reports
  whether the server answers, whether the table exists, and — importantly —
  whether Row Level Security is actually switched on. If RLS is off it says so
  loudly, because that is the one misconfiguration that exposes every player's
  save while otherwise looking like it works.

## 3. Decide about email confirmation

**Authentication → Providers → Email**, scroll to **Confirm email**, switch it
off, then **Save**. (In newer dashboards the same switch lives under
**Authentication → Sign In / Providers → Email**.)

With it off, creating an account signs you straight in — no inbox round trip.
**TEST CONNECTION** in the game reports the current state either way, so you
can check the toggle actually saved.

- **Off** — players can sign up and play immediately. Simplest, and fine for a
  game where the account only protects a save file.
- **On** — players must click a link in their inbox before their first sign-in.
  Safer against throwaway signups, but you will need SMTP configured or
  Supabase's low default email limits will bite.

The game handles both: with confirmation on, sign-up shows "Confirm your email,
then sign in" rather than failing silently.

## 4. Point the game at the project

Edit `src/config.js`:

```js
export const CLOUD = {
  url: 'https://abcdefghijklm.supabase.co',
  anonKey: 'eyJhbGciOi…',
  table: 'saves'
};
```

Commit and deploy. The Hub's **ACCOUNT** card will switch from "Local save
only" to "Save to cloud".

### Why not environment variables?

This is a static site with no build step — nothing exists to substitute an env
var into the JavaScript before it reaches the browser. Adding one in Vercel
would simply do nothing. Committing the anon key is the intended approach for a
Supabase client, and is safe precisely because of the policies in step 2.

If you would rather not commit it, you can set it per-device from the browser
console instead:

```js
localStorage.setItem('ea:cloud', JSON.stringify({
  url: 'https://…supabase.co', anonKey: 'eyJ…'
}));
```

---

## How syncing behaves

- **Local storage stays authoritative while playing.** The cloud is a backup
  and a transfer mechanism, never a dependency — losing connectivity mid-run
  changes nothing.
- **Progress uploads automatically** after every stage, win or lose. Failures
  are logged and retried on the next stage; they never interrupt play.
- **Signing in reconciles rather than overwrites.** A fresh device adopts the
  account's save; an account with no save adopts the device's.
- **A genuine conflict asks.** If both sides have real progress and they
  differ, the game shows what each contains — level, stages cleared, date — and
  the player picks. It never merges and never silently discards a session.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Cloud saves are not set up on this project yet." (404) | The `saves` table does not exist, or its name differs from `table` in config.js. |
| Sign-in works but saving fails with 401/403 | RLS is on but the policies in step 2 were not created. |
| "Confirm your email, then sign in." | Email confirmation is enabled — expected; check the inbox. |
| Nothing happens, console shows a CORS error | The `url` is wrong or has a trailing path. It should be the bare project URL. |

## Privacy

The only things stored are an email address, a hashed password (handled by
Supabase, never seen by the game) and the save file. No analytics, no
telemetry, no third-party requests. Deleting the account row removes
everything.
