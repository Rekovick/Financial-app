import type { AppConfig, Bootstrap, ColumnMapping, Transaction } from './types';

/**
 * Some hosts can't make cross-origin requests at all — the claude.ai artifact
 * sandbox, for one. On those, connecting to a Sheet can never work, so the app
 * says so up front instead of failing with an opaque network error.
 */
export const PREVIEW_ONLY = import.meta.env.VITE_PREVIEW_ONLY === '1';

export interface Connection {
  /** The Apps Script `/exec` web-app URL. */
  url: string;
  /** Shared secret configured inside the script. Never leaves this device. */
  token: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'auth' | 'server' | 'shape' | 'conflict',
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 25_000;

/**
 * Apps Script web apps don't answer CORS pre-flight, so every call is a
 * "simple request": GET, or POST with `text/plain`. That's the whole trick —
 * don't add JSON content-type headers here or the browser will pre-flight and
 * every request will fail with an opaque CORS error.
 */
async function call<T>(conn: Connection, action: string, payload?: unknown): Promise<T> {
  if (!conn.url) throw new ApiError('No Google Sheet connected yet.', 'auth');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(conn.url, {
      method: 'POST',
      // Deliberately text/plain — see the note above.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: conn.token, action, payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError('The Sheet took too long to answer. It may be a very large sheet.', 'network', err);
    }
    throw new ApiError(
      'Could not reach the Google Sheet. Check the connection or your internet.',
      'network',
      err,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(`Google Sheets returned ${res.status}.`, res.status === 401 ? 'auth' : 'server', text.slice(0, 400));
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Apps Script serves its sign-in page as HTML when the deployment isn't
    // set to "Anyone" — by far the most common setup mistake, so name it.
    if (/<html/i.test(text)) {
      throw new ApiError(
        'The web app asked for a Google sign-in instead of returning data. Re-deploy the Apps Script with “Who has access: Anyone”.',
        'auth',
      );
    }
    throw new ApiError('The Sheet sent back something unreadable.', 'shape', text.slice(0, 400));
  }

  const body = json as { ok?: boolean; error?: string; code?: string; data?: T };
  if (!body || typeof body !== 'object') throw new ApiError('Malformed response.', 'shape', json);
  if (!body.ok) {
    const kind = body.code === 'UNAUTHORIZED' ? 'auth' : body.code === 'CONFLICT' ? 'conflict' : 'server';
    throw new ApiError(body.error || 'The Sheet rejected that request.', kind, body);
  }
  return body.data as T;
}

export const api = {
  /** Cheap liveness + auth check used by the connect screen. */
  ping(conn: Connection): Promise<{ spreadsheetName: string; sheets: string[]; version: string }> {
    return call(conn, 'ping');
  },

  /** Everything the app needs in one round trip. */
  bootstrap(conn: Connection): Promise<Bootstrap> {
    return call(conn, 'bootstrap');
  },

  /**
   * A few bytes that say whether a full fetch is worth making. Used by the
   * background poll so an idle app on a phone isn't pulling the whole ledger
   * once a minute.
   */
  revision(conn: Connection): Promise<{ revision: number; rowCount: number; sheetName: string }> {
    return call(conn, 'revision');
  },

  upsert(conn: Connection, transactions: Transaction[]): Promise<{ revision: number; transactions: Transaction[] }> {
    return call(conn, 'upsert', { transactions });
  },

  remove(conn: Connection, ids: string[]): Promise<{ revision: number; deleted: string[]; missing?: string[] }> {
    return call(conn, 'delete', { ids });
  },

  saveConfig(conn: Connection, config: AppConfig): Promise<{ revision: number }> {
    return call(conn, 'saveConfig', { config });
  },

  setMapping(conn: Connection, sheetName: string, mapping: ColumnMapping): Promise<Bootstrap> {
    return call(conn, 'setMapping', { sheetName, mapping });
  },

  /** Adds the app-managed columns (category, member, notes…) the sheet lacks. */
  prepareSheet(conn: Connection, sheetName: string): Promise<Bootstrap> {
    return call(conn, 'prepareSheet', { sheetName });
  },
};

/** Basic shape check so a pasted-wrong URL fails fast with a useful message. */
export function validateWebAppUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return 'Paste the web app URL from your Apps Script deployment.';
  if (!/^https:\/\//i.test(u)) return 'The URL must start with https://';
  if (!/script\.google(usercontent)?\.com/i.test(u)) {
    return 'That does not look like an Apps Script URL (it should contain script.google.com).';
  }
  if (!/\/exec\b/.test(u)) {
    return u.includes('/dev')
      ? 'That is the test URL (/dev), which only works while you are signed in. Use the /exec deployment URL.'
      : 'The URL should end with /exec.';
  }
  return null;
}
