import { expect, test } from 'claude-code/testing'

import { wrapWords } from '../hooks/format'

test('WT-06 a long message breaks into lines between words, to fit a dialog', async () => {
  expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four'])
  expect(wrapWords('short', 20)).toEqual(['short'])
  expect(wrapWords('', 10)).toEqual([])
  expect(wrapWords('abcdefghijkl x', 5)).toEqual(['abcde', 'x'])
})
