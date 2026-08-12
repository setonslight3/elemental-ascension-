/**
 * config.js — deployment settings.
 *
 * ── Cloud saves (optional) ───────────────────────────────────────────────────
 * Fill these two in to turn on accounts and cross-device progress. Leave them
 * empty and the game works exactly as before, saving locally only.
 *
 * Both values are meant to be public. A Supabase *anon* key is a client-side
 * key by design: it identifies the project, it does not grant access. Access is
 * decided by Row Level Security on the server, which is why the SQL in
 * `docs/CLOUD-SAVE.md` must be run before this is switched on. Do NOT paste a
 * `service_role` key here — that one is a master key and would let anyone read
 * and delete every player's save.
 *
 * Environment variables cannot be used here: this is a static site with no
 * build step, so nothing exists to substitute them in. Committing the anon key
 * is the intended approach.
 */

export const CLOUD = {
  /** e.g. 'https://abcdefghijklm.supabase.co' */
  url: 'https://kzlsyxxgepguwrnyyyvx.supabase.co',
  /**
   * The project's public anon key (role: "anon"). Publishable by design — it
   * identifies the project and nothing more. The Row Level Security policies
   * in docs/CLOUD-SAVE.md are what actually protect player saves, so this key
   * is only safe once that SQL has been run.
   */
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6bHN5eHhnZXBndXdybnl5eXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjQxOTcsImV4cCI6MjEwMjEwMDE5N30.HP8HscXfAS4UJDqdA7ir9gNb43OVCBLqYHo4C1wNBUM',
  /** Table holding one row per player. See docs/CLOUD-SAVE.md. */
  table: 'saves'
};

/**
 * Local overrides, for testing a cloud project without editing this file:
 *   localStorage.setItem('ea:cloud', JSON.stringify({ url, anonKey }))
 */
export function resolveCloudConfig() {
  const cfg = { ...CLOUD };
  try {
    const raw = window.localStorage?.getItem('ea:cloud');
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch { /* storage blocked; use the compiled-in values */ }
  return cfg;
}

export const cloudConfigured = () => {
  const c = resolveCloudConfig();
  return !!(c.url && c.anonKey);
};
