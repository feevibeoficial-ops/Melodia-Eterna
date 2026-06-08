function looksLikeMojibake(value: string) {
  return /Ã.|Â.|â.|ðŸ|�/.test(value);
}

export function fixMojibake(value: string): string {
  if (!value || !looksLikeMojibake(value)) {
    return value;
  }

  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

export function normalizeTextDeep<T>(input: T): T {
  if (typeof input === 'string') {
    return fixMojibake(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeTextDeep(item)) as T;
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, normalizeTextDeep(value)]),
    ) as T;
  }

  return input;
}
