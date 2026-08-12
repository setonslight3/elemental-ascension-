/**
 * Cloud.js — accounts and cross-device saves, over Supabase's REST API.
 *
 * Written against the HTTP endpoints directly rather than the Supabase SDK, so
 * the game stays a static site with nothing to install, nothing to bundle and
 * no third-party script to load at runtime.
 *
 * The contract with the rest of the game:
 *
 *  - **Local storage stays authoritative while playing.** The cloud is a sync
 *    layer, never a dependency. Sign-in failing, the network dropping, or the
 *    project being misconfigured must all leave a perfectly playable game.
 *  - **Nothing is overwritten silently.** When the local and cloud saves have
 *    genuinely diverged, the player is asked which to keep; the game never
 *    guesses and never destroys progress on its own.
 *  - **Tokens live in localStorage** and are refreshed on demand. This is a
 *    single-player game with no secrets to protect beyond the account itself.
 */

import { resolveCloudConfig, cloudConfigured } from '../config.js';
import { exportProfile, importProfile } from './Save.js';

const SESSION_KEY = 'elemental-ascension/session';

/** Network calls are bounded so a dead endpoint cannot hang the UI. */
const TIMEOUT_MS = 12000;

async function request(path, { method = 'GET', body, token, headers = {}, cfg } = {}) {
  const conf = cfg || resolveCloudConfig();
  if (!conf.url || !conf.anonKey) throw new CloudError('Cloud saves are not configured.', 'unconfigured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${conf.url.replace(/\/$/, '')}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: conf.anonKey,
        Authorization: `Bearer ${token || conf.anonKey}`,
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new CloudError('The server took too long to answer.', 'timeout');
    throw new CloudError('Could not reach the server. Check your connection.', 'network');
  }
  clearTimeout(timer);

  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }

  if (!res.ok) {
    throw new CloudError(friendlyError(res.status, data), 'http', res.status, data);
  }
  return data;
}

export class CloudError extends Error {
  constructor(message, kind = 'unknown', status = 0, data = null) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.data = data;
  }
}

/** Turn Supabase's error shapes into something a player can act on. */
function friendlyError(status, data) {
  const raw = (data && (data.error_description || data.msg || data.message || data.error)) || '';
  const lower = String(raw).toLowerCase();

  if (lower.includes('invalid login')) return 'That email or password is not right.';
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'That email already has an account — sign in instead.';
  }
  if (lower.includes('password should be') || lower.includes('password must')) {
    return 'Password must be at least 6 characters.';
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'That does not look like a valid email address.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email first.';
  }
  if (status === 401 || status === 403) return 'Not signed in, or the session expired.';
  if (status === 404) return 'Cloud saves are not set up on this project yet.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status >= 500) return 'The server is having trouble. Try again shortly.';
  return raw || `Request failed (${status}).`;
}

/* ------------------------------------------------------------------ session */

function loadSession() {
  try {
    const raw = window.localStorage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function storeSession(session) {
  try {
    if (session) window.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage?.removeItem(SESSION_KEY);
  } catch { /* storage blocked — the session lasts this tab only */ }
}

const sessionFrom = (payload) => ({
  accessToken: payload.access_token,
  refreshToken: payload.refresh_token,
  expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  userId: payload.user?.id ?? payload.id ?? null,
  email: payload.user?.email ?? payload.email ?? null
});

/* -------------------------------------------------------------------- API */

export class CloudSaves {
  constructor(profile) {
    this.profile = profile;
    this.session = loadSession();
    this.listeners = new Set();
    this.status = this.session ? 'signed-in' : 'signed-out';
    this.lastSyncAt = null;
    this.lastError = null;
    this.busy = false;
  }

  get configured() { return cloudConfigured(); }
  get signedIn() { return !!this.session?.accessToken; }
  get email() { return this.session?.email ?? null; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _emit() {
    for (const fn of [...this.listeners]) {
      try { fn(this); } catch (err) { console.error('[cloud] listener threw', err); }
    }
  }

  _setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    this._emit();
  }

  /**
   * Self-test for the project setup, runnable from the Account screen.
   *
   * This exists because the two ways a Supabase setup goes wrong are silent
   * from the player's side and opposite in severity:
   *
   *  - The SQL was never run, so the table is missing and nothing saves.
   *  - The table exists but Row Level Security was NOT enabled, in which case
   *    the anon key can read every player's save. That is the one genuinely
   *    dangerous misconfiguration, and it looks identical to a working setup
   *    until someone goes looking.
   *
   * A signed-out read tells the two apart: with RLS on it returns an empty
   * list, with RLS off it returns rows.
   *
   * @returns {Promise<{ok:boolean, checks:Array<{name:string, pass:boolean, detail:string}>}>}
   */
  async checkSetup() {
    const cfg = resolveCloudConfig();
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass, detail });

    if (!cfg.url || !cfg.anonKey) {
      add('Configuration', false, 'No project URL or key in src/config.js.');
      return { ok: false, checks };
    }
    add('Configuration', true, cfg.url.replace(/^https?:\/\//, ''));

    // 1. Can we reach the auth service, and how is it configured? The auth
    //    settings endpoint is public, so this works before anyone signs in —
    //    which is exactly when you want to know whether sign-ups are even
    //    allowed and whether new accounts need an email round trip.
    try {
      const settings = await request('/auth/v1/settings', { cfg });
      add('Server reachable', true, 'auth service answered');

      if (settings?.disable_signup === true) {
        add('Sign-ups', false,
          'DISABLED for this project — nobody can create an account. Enable them in Authentication → Providers → Email.');
      } else {
        add('Sign-ups', true, 'enabled');
      }

      // GoTrue calls it "mailer_autoconfirm": true means confirmation is OFF.
      if (settings?.mailer_autoconfirm === true) {
        add('Email confirmation', true, 'OFF — new accounts sign in immediately');
      } else {
        add('Email confirmation', true,
          'ON — new accounts must click a link in their inbox before the first sign-in. Turn it off in Authentication → Providers → Email → "Confirm email".');
      }
    } catch (err) {
      add('Server reachable', false, err.message);
      return { ok: false, checks };
    }

    // 2. Does the table exist, and is RLS doing its job?
    try {
      const rows = await request(`/rest/v1/${cfg.table}?select=user_id&limit=1`, { cfg });
      if (Array.isArray(rows) && rows.length > 0) {
        add('Table + security', false,
          `WARNING: "${cfg.table}" is readable without signing in. Row Level Security is OFF — run the SQL in docs/CLOUD-SAVE.md.`);
        return { ok: false, checks };
      }
      add('Table + security', true, `"${cfg.table}" exists and is protected`);
    } catch (err) {
      if (err.status === 404) {
        add('Table + security', false,
          `Table "${cfg.table}" does not exist. Run the SQL in docs/CLOUD-SAVE.md.`);
      } else if (err.status === 401 || err.status === 403) {
        // Locked down even harder than needed — still a working setup.
        add('Table + security', true, 'table is protected');
      } else {
        add('Table + security', false, err.message);
      }
      if (err.status !== 401 && err.status !== 403) return { ok: false, checks };
    }

    return { ok: checks.every((c) => c.pass), checks };
  }

  /* ------------------------------------------------------------- accounts */

  async signUp(email, password) {
    return this._auth('/auth/v1/signup', { email, password }, 'creating account');
  }

  async signIn(email, password) {
    return this._auth('/auth/v1/token?grant_type=password', { email, password }, 'signing in');
  }

  async _auth(path, body, what) {
    if (this.busy) throw new CloudError('Already busy — one moment.', 'busy');
    this.busy = true;
    this._setStatus(what);
    try {
      const data = await request(path, { method: 'POST', body });
      if (!data?.access_token) {
        // Supabase returns a user with no token when email confirmation is on.
        this._setStatus('signed-out');
        throw new CloudError('Account created. Confirm your email, then sign in.', 'confirm');
      }
      this.session = sessionFrom(data);
      storeSession(this.session);
      this._setStatus('signed-in');
      return this.session;
    } catch (err) {
      this._setStatus('signed-out', err.message);
      throw err;
    } finally {
      this.busy = false;
    }
  }

  signOut() {
    this.session = null;
    storeSession(null);
    this._setStatus('signed-out');
  }

  /** Refresh an expired access token; sign out if the refresh itself fails. */
  async _ensureToken() {
    if (!this.session) throw new CloudError('Not signed in.', 'auth');
    if (Date.now() < this.session.expiresAt - 60000) return this.session.accessToken;

    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: this.session.refreshToken }
      });
      this.session = { ...sessionFrom(data), email: this.session.email };
      storeSession(this.session);
      return this.session.accessToken;
    } catch (err) {
      this.signOut();
      throw new CloudError('Your session expired — sign in again.', 'auth');
    }
  }

  /* ---------------------------------------------------------------- saves */

  /** @returns {Promise<{data:object, updatedAt:number}|null>} */
  async fetchRemote() {
    const token = await this._ensureToken();
    const cfg = resolveCloudConfig();
    const rows = await request(
      `/rest/v1/${cfg.table}?user_id=eq.${this.session.userId}&select=payload,updated_at`,
      { token, cfg }
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    try {
      return {
        data: importProfile(row.payload),
        updatedAt: Date.parse(row.updated_at) || 0
      };
    } catch (err) {
      throw new CloudError('The save stored in your account is damaged.', 'corrupt');
    }
  }

  /** Push the local profile up, replacing whatever is there. */
  async push() {
    const token = await this._ensureToken();
    const cfg = resolveCloudConfig();
    const payload = exportProfile(this.profile.data);
    this._setStatus('syncing');
    try {
      await request(`/rest/v1/${cfg.table}`, {
        method: 'POST',
        token, cfg,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [{
          user_id: this.session.userId,
          payload,
          updated_at: new Date().toISOString()
        }]
      });
      this.lastSyncAt = Date.now();
      this._setStatus('signed-in');
      return true;
    } catch (err) {
      this._setStatus('signed-in', err.message);
      throw err;
    }
  }

  /** Replace the local profile with the account's copy. */
  async pull() {
    this._setStatus('syncing');
    try {
      const remote = await this.fetchRemote();
      if (!remote) {
        this._setStatus('signed-in');
        return null;
      }
      this.profile.replaceWith(remote.data);
      this.lastSyncAt = Date.now();
      this._setStatus('signed-in');
      return remote;
    } catch (err) {
      this._setStatus('signed-in', err.message);
      throw err;
    }
  }

  /**
   * Decide what should happen after signing in.
   *
   * Never resolves a real conflict on its own: if both sides show progress and
   * they are not the same save, it reports `conflict` and lets the player
   * choose. Losing a play session to an automatic merge is unforgivable in a
   * game where the save *is* the progress.
   *
   * @returns {Promise<{action:'pushed'|'pulled'|'in-sync'|'conflict', local?:object, remote?:object}>}
   */
  async reconcile() {
    const remote = await this.fetchRemote();
    const local = this.profile.data;

    if (!remote) {
      await this.push();
      return { action: 'pushed' };
    }

    const localProgress = progressScore(local);
    const remoteProgress = progressScore(remote.data);

    // A brand-new local profile should just adopt the account's save.
    if (localProgress === 0 && remoteProgress > 0) {
      await this.pull();
      return { action: 'pulled', remote: remote.data };
    }
    if (remoteProgress === 0 && localProgress > 0) {
      await this.push();
      return { action: 'pushed' };
    }
    // Same save, already in step.
    if (Math.abs((local.updatedAt || 0) - (remote.data.updatedAt || 0)) < 1500 &&
        localProgress === remoteProgress) {
      return { action: 'in-sync' };
    }
    return { action: 'conflict', local, remote: remote.data };
  }

  /** Background push after a stage; failures are logged, never surfaced mid-run. */
  async autoPush() {
    if (!this.configured || !this.signedIn) return;
    try {
      await this.push();
    } catch (err) {
      console.warn('[cloud] auto-sync failed, will retry later', err.message);
    }
  }
}

/** A rough "how much has this profile achieved" number, for conflict triage. */
export function progressScore(data) {
  if (!data) return 0;
  const cleared = Object.values(data.stages || {}).filter((s) => s.cleared > 0).length;
  return (data.level || 1) - 1 +
    cleared * 3 +
    Math.floor((data.metrics?.kills || 0) / 50) +
    (data.highestUnlocked || 1) - 1;
}

/** One-line human summary of a save, for the conflict dialog. */
export function describeSave(data) {
  if (!data) return 'empty';
  const cleared = Object.values(data.stages || {}).filter((s) => s.cleared > 0).length;
  const when = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'unknown date';
  return `Level ${data.level || 1} · ${cleared} stages cleared · ${when}`;
}
