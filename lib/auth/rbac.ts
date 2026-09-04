import { getSession, SessionPayload } from "./session";

export interface AuthResult {
  authenticated: boolean;
  authorized: boolean;
  user?: SessionPayload;
  status: number;
  error?: string;
}

/**
 * Server-side RBAC verification helper.
 * Validates session cryptographically and checks if the role is allowed.
 */
export async function verifyRole(allowedRoles: string[]): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      authenticated: false,
      authorized: false,
      status: 401,
      error: "Unauthenticated. Please log in.",
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      authenticated: true,
      authorized: false,
      user: session,
      status: 403,
      error: `Access Denied. Required roles: [${allowedRoles.join(", ")}]. Your role: ${session.role}`,
    };
  }

  return {
    authenticated: true,
    authorized: true,
    user: session,
    status: 200,
  };
}
