/** Up to two initials for an avatar, from a display name or (failing that) the local part of an email. */
export function initialsFor(nameOrEmail: string | null | undefined): string {
  const name = (nameOrEmail || '').trim().replace(/@.*/, '');
  const letters = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '?';
}
