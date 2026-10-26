export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Your private session has expired. Reload to sign in again.');
    let message = `Request failed (${response.status}). Please try again.`;
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
    throw new Error(message);
  }
  return response.json();
}
export function json(method: string, value: unknown): RequestInit { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }; }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
