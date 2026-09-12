/**
 * Session token storage for the auth foundation (Phase 3A). The
 * PRODUCTION browser transport decision (bearer-with-refresh vs.
 * SameSite=None cookie vs. same-site hosting migration) is deferred —
 * see docs/adr/0001-cross-site-auth-transport.md. This interface exists
 * so that decision, whenever it's made, can be implemented as a new
 * SessionTransport without touching any auth/purchase call site.
 *
 * The ONLY implementation built in this phase is in-memory — cleared on
 * page reload, never localStorage/sessionStorage. It exists purely so
 * PR C's dev-only /account-test harness can hold a bearer token across
 * calls within a single page session while exercising the backend auth
 * flow end-to-end.
 */
export interface SessionTransport {
  getToken(): string | null;
  setToken(token: string): void;
  clear(): void;
}

function createInMemorySessionTransport(): SessionTransport {
  let currentToken: string | null = null;

  return {
    getToken(): string | null {
      return currentToken;
    },
    setToken(token: string): void {
      currentToken = token;
    },
    clear(): void {
      currentToken = null;
    },
  };
}

export const inMemorySessionTransport: SessionTransport = createInMemorySessionTransport();
