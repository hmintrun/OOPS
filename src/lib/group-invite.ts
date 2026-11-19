export function normalizeGroupJoinCode(value: string): string | undefined {
  const code = value.trim();
  return /^[A-Z0-9]{6,8}$/i.test(code) ? code.toUpperCase() : undefined;
}

export function parseGroupInviteEntry(value: string, origin: string): string | undefined {
  const code = normalizeGroupJoinCode(value);
  if (code) return code;

  try {
    const url = new URL(value.trim(), origin);
    if (url.origin !== origin || url.pathname !== "/join" || url.username || url.password) return;
    const tokens = url.searchParams.getAll("token");
    if (tokens.length === 1) return tokens[0].trim() || undefined;
  } catch {
    return;
  }
}
