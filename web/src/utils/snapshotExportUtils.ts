const UNSAFE_CHARS = /[/\\:*?"<>|]/g

export function sanitizeFilename(name: string): string {
  return name
    .replace(UNSAFE_CHARS, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deduplicateFilenames(names: string[]): string[] {
  const counts = new Map<string, number>()
  return names.map((name) => {
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    return count > 1 ? `${name}-${count}` : name
  })
}
