import { expect, test } from 'claude-code/testing'

import { ECHO_COLUMNS, ECHO_MS, ECHO_STRIKES, echoLine, echoPrompt } from '../hooks/echo'
import { graphemes, terminalText } from '../hooks/terminal-text'

test('a prompt is one line, and blank or non-text prompts leave no echo', () => {
  expect(echoPrompt('  Poukładaj\n\n  hooki   pod sceny ')).toBe('Poukładaj hooki pod sceny')
  expect(echoPrompt('   \n\t ')).toBeNull()
  expect(echoPrompt(undefined)).toBeNull()
  expect(echoPrompt(['lista'])).toBeNull()
})

test('a short exchange gets no echo, a long one does at the strike or time threshold', () => {
  expect(echoLine('napraw testy', ECHO_STRIKES - 1, ECHO_MS - 1)).toBeNull()
  expect(echoLine('napraw testy', ECHO_STRIKES, 0)).toBe('napraw testy')
  expect(echoLine('napraw testy', 0, ECHO_MS)).toBe('napraw testy')
  expect(echoLine('napraw testy', 0, Number.NaN)).toBeNull()
  expect(echoLine(null, ECHO_STRIKES, ECHO_MS)).toBeNull()
})

test('the echo is cut to sixty terminal cells with an ellipsis and never splits a grapheme', () => {
  const prompt = 'ż'.repeat(80)
  const cut = echoLine(prompt, ECHO_STRIKES, 0)!
  expect(terminalText(cut, ECHO_COLUMNS).columns).toBeLessThanOrEqual(ECHO_COLUMNS)
  expect(cut.endsWith('…')).toBe(true)
  const wide = echoLine('界'.repeat(40), ECHO_STRIKES, 0)!
  expect(graphemes(wide).every(part => part === '界' || part === '…')).toBe(true)
  expect(terminalText(wide, ECHO_COLUMNS).columns).toBeLessThanOrEqual(ECHO_COLUMNS)
})
