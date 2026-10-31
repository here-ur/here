let owner: string | null = null;

export function setLocalOwner(userId: string | null) {
  owner = userId;
}

export function accountKey(key: string): string | null {
  return owner ? `${key}.${owner}` : null;
}
