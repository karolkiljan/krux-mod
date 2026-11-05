import { expect, test } from 'claude-code/testing'

import { AUDIT_SYSTEM, auditClaims, auditPrompt, auditReason, auditWorthy, evidenceOf } from '../hooks/audit'
import type { HistoryMessage } from '../hooks/lore'

const ANSWER = 'Krux przeczytać config.yml: port 8080. Testy przechodzą, 52 na 52. Pewnie warto dodać cache.'

test('only an answer that says it saw or checked something goes to the audit', () => {
  expect(auditWorthy(ANSWER)).toBe(true)
  expect(auditWorthy('Krux puścić npm test, 3 padać.')).toBe(true)
  expect(auditWorthy('Hej Morra, co dziś kopać?')).toBe(false)
  expect(auditWorthy('Krux polecać wariant 2: prostszy i bez nowej zależności.')).toBe(false)
})

test('the evidence is the newest tool output first, with the facts line on top, within a budget', () => {
  const history: HistoryMessage[] = [
    { role: 'user', text: 'zbadaj config', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: 'config.yml' }, text: 'port: 3000\nhost: localhost' }] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' }, isError: true, text: '50 passed, 2 failed' }] },
  ]
  const evidence = evidenceOf(history, 'Stan z narzędzi przed tą turą — testy: …')
  expect(evidence.startsWith('Stan z narzędzi')).toBe(true)
  expect(evidence.indexOf('npm test')).toBeLessThan(evidence.indexOf('config.yml'))
  expect(evidence).toContain('[błąd]')
  const flood: HistoryMessage[] = Array.from({ length: 40 }, (_, i) => ({ role: 'assistant' as const, text: '', toolUses: [{ tool: 'Read', input: { file_path: `f${i}.ts` }, text: 'x'.repeat(3000) }] }))
  expect(evidenceOf(flood, null).length).toBeLessThanOrEqual(8000)
  expect(evidenceOf(flood, null)).toContain('f39.ts')
  // Podsumowanie długiego wyjścia stoi na końcu: audytor musi je widzieć.
  const long: HistoryMessage[] = [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm run build' }, text: `${'log\n'.repeat(1000)}Build succeeded in 4.2s` }] }]
  const kept = evidenceOf(long, null)
  expect(kept).toContain('Build succeeded in 4.2s')
  expect(kept.length).toBeLessThan(1800)
})

test('the verdict keeps only sentences that stand in the answer, and BRAK means nothing to fix', () => {
  expect(auditClaims('BRAK', ANSWER)).toEqual([])
  expect(auditClaims('brak uwag', ANSWER)).toEqual([])
  expect(auditClaims('NONE', ANSWER)).toEqual([])
  expect(auditClaims('- "Krux przeczytać config.yml: port 8080."\n2. Testy przechodzą, 52 na 52.', ANSWER)).toEqual(['Krux przeczytać config.yml: port 8080.', 'Testy przechodzą, 52 na 52.'])
  // Mały model, który zmyśli cytat, nie zatrzyma tury za zdanie, którego nie było.
  expect(auditClaims('Krux usunąć bazę danych.', ANSWER)).toEqual([])
  expect(auditClaims('a\nb\nc\nd\nKrux przeczytać config.yml: port 8080.', ANSWER)).toEqual(['Krux przeczytać config.yml: port 8080.'])
})

test('the audit prompt carries both sides, and the reason asks for a check without apologies', () => {
  expect(auditPrompt(ANSWER, '')).toContain('(brak wywołań narzędzi)')
  expect(auditPrompt(ANSWER, 'Read config.yml')).toMatch(/<dowody>[\s\S]*Read config\.yml[\s\S]*<odpowiedź>[\s\S]*port 8080/u)
  expect(AUDIT_SYSTEM).toContain('BRAK')
  const reason = auditReason(['Krux przeczytać config.yml: port 8080.'])
  expect(reason).toContain('Audyt faktów')
  expect(reason).toContain('Bez przeprosin')
  expect(reason).not.toMatch(/[”“«»]/u)
})
