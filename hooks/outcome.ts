// Wywołanie powłoki w tle nie ma jeszcze końcowego wyniku. Silnik może je
// przenieść w tło także po starcie: po Ctrl+B, limicie czasu albo zmianie tury.
export function isBackgroundToolCall(tool: string, input: Record<string, unknown>, result?: unknown): boolean {
  if (tool !== 'Bash') return false
  if (input.run_in_background === true) return true
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return false
  const id = (result as Record<string, unknown>).backgroundTaskId
  return typeof id === 'string' && id.trim() !== ''
}
