/** Exchanges a single-use pairing link (scanned from the frame or copied from Settings) for this device's long-lived session cookie. */
export async function pair(linkOrToken: string): Promise<boolean> {
  const value = linkOrToken.trim();
  const token = value.includes('#pair=') ? value.slice(value.indexOf('#pair=') + '#pair='.length) : value;
  if (!token) return false;
  const response = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  return response.ok;
}
export async function signedIn(): Promise<boolean> {
  const response = await fetch('/api/session');
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(`Could not check your session (${response.status}).`);
  return true;
}
