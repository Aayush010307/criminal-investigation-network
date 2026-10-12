/**
 * api.ts - the only place that talks to the backend.
 * The access token lives in sessionStorage: it is dropped when the tab closes, is never put in a URL,
 * and the page loads scripts only from its own origin (Content-Security-Policy set by the API),
 * which limits what an injected script could do. Every authorisation decision is made by the server.
 */
export type Role = 'viewer' | 'investigator' | 'admin';
export interface Session { token: string; username: string; role: Role }

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: string[] | string) { super(message); }
}

const KEY = 'cin.session';
let session: Session | null = (() => {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
})();
const listeners = new Set<() => void>();

export const getSession = () => session;
export function setSession(s: Session | null) {
  session = s;
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* storage blocked: session lasts for this page only */ }
  listeners.forEach((l) => l());
}
export function onSession(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const RANK: Record<Role, number> = { viewer: 0, investigator: 1, admin: 2 };
export const can = (min: Role) => !!session && RANK[session.role] >= RANK[min];

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const qs = opts.query ? new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method: opts.method || 'GET',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the API server. Is it running (npm start in api/)?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session && !path.startsWith('/auth/login')) setSession(null);   // expired or revoked: back to sign-in
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details);
  }
  return data as T;
}

/** A readable one-line message for any error thrown by api(). */
export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    const d = Array.isArray(e.details) ? e.details.join('; ') : e.details;
    return d ? `${e.message}: ${d}` : e.message;
  }
  return 'Unexpected error';
}

// ----- shared types of the API responses
export interface PropSpec { enum?: string[]; int?: [number, number]; float?: [number, number] }
export type Spec = 'string' | 'date' | 'boolean' | PropSpec;
export interface EntityDef { label: string; key: string; keyPattern: string; required: string[]; filters: string[]; props: Record<string, Spec> }
export interface RelDef { from: string; to: string; directed: boolean; props: Record<string, Spec> }
export interface Schema { entities: Record<string, EntityDef>; relationships: Record<string, RelDef> }
export interface GNode { id: string; label: string; caption: string; props: Record<string, unknown> }
export interface GEdge { source: string; target: string; type: string; props: Record<string, unknown> }
export interface Graph { nodes: GNode[]; edges: GEdge[] }

let schemaPromise: Promise<Schema> | null = null;
export const getSchema = () => (schemaPromise ||= api<Schema>('/schema').catch((e) => { schemaPromise = null; throw e; }));

/** entity collection name (suspects ...) for a node label (Suspect ...) */
export const ENTITY_OF: Record<string, string> = { Suspect: 'suspects', Crime: 'crimes', Location: 'locations', Evidence: 'evidence', Officer: 'officers' };
export const LABEL_OF_ID = (id: string) => (/^CR\d/.test(id) ? 'Crime' : /^S\d/.test(id) ? 'Suspect' : /^L\d/.test(id) ? 'Location' : /^E\d/.test(id) ? 'Evidence' : /^B\d/.test(id) ? 'Officer' : null);
