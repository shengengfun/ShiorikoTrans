// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { fillSummaryPrompt, splitIntoChunks, summaryPresets } from './summarize'

describe('summary prompts', () => {
	it('substitutes the transcript into the template', () => {
		expect(fillSummaryPrompt('A\n%s\nB', 'body')).toBe('A\nbody\nB')
	})

	it('appends the transcript when the template lost its placeholder', () => {
		// A template without `%s` used to drop the transcript entirely.
		const filled = fillSummaryPrompt('Summarize this.', 'body')
		expect(filled).toContain('body')
		expect(filled.startsWith('Summarize this.')).toBe(true)
	})

	it('keeps a placeholder in every preset so the settings hint stays true', () => {
		for (const preset of summaryPresets()) {
			expect(preset.prompt('English')).toMatch(/%s|\{\{text\}\}|<text>/)
		}
	})
})

describe('transcript chunking', () => {
	it('keeps short input in one chunk', () => {
		expect(splitIntoChunks('a\nb\nc', 100)).toEqual(['a\nb\nc'])
	})

	it('splits long input on line boundaries', () => {
		const text = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n')
		const chunks = splitIntoChunks(text, 40)
		expect(chunks.length).toBeGreaterThan(1)
		// Nothing is lost or duplicated by the split.
		expect(chunks.join('\n').replace(/\n+/g, '\n')).toBe(text.replace(/\n+/g, '\n'))
		for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(40)
	})

	it('hard-splits a single oversized line', () => {
		const chunks = splitIntoChunks('x'.repeat(25), 10)
		expect(chunks.join('')).toHaveLength(25)
		for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(10)
	})
})
