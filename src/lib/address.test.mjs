import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAddress, didYouMean, looksLikeAddress } from './address.js'

test('real addresses are never refused, however odd they look', () => {
  // The cost of being wrong here is refusing somebody their account, which
  // is far worse than one bounce. Permissive on purpose.
  for (const good of [
    'david@moritznet.com',
    'a@b.co',
    'first.last+pond@sub.domain.co.uk',
    "o'brien@example.ie",
    'someone@a-very-long-domain-name.travel',
    'x_y-z@example.museum',
  ]) {
    assert.equal(looksLikeAddress(good), true, good)
  }
})

test('and the ones nobody could ever deliver to are stopped here', () => {
  for (const bad of [
    'dave@', '@gmail.com', 'dave', 'dave@localhost', 'dave@@gmail.com',
    'da ve@gmail.com', 'dave@gmail..com', 'dave@.com', 'dave@com.',
    'dave@gmail.c', 'dave@gmail.123', '', '   ',
  ]) {
    assert.equal(looksLikeAddress(bad), false, bad)
  }
})

test('a too-long address is refused rather than sent', () => {
  assert.equal(looksLikeAddress(`${'a'.repeat(70)}@gmail.com`), false, 'local part over 64')
  assert.equal(looksLikeAddress(`a@${'b'.repeat(260)}.com`), false, 'over 254 in total')
})

test('the slips that actually turn up are caught', () => {
  assert.equal(didYouMean('dave@gmial.com'), 'dave@gmail.com')
  assert.equal(didYouMean('dave@hotmial.com'), 'dave@hotmail.com')
  assert.equal(didYouMean('dave@outlok.com'), 'dave@outlook.com')
  assert.equal(didYouMean('dave@yaho.com'), 'dave@yahoo.com')
  // .con is a slip on any domain — nobody has ever meant it.
  assert.equal(didYouMean('dave@moritznet.con'), 'dave@moritznet.com')
})

test('and a correct address is left alone, which is the normal answer', () => {
  // A wrong suggestion on a right address teaches somebody to ignore the
  // next one — so silence is the default.
  for (const fine of [
    'david@moritznet.com',
    'someone@gmail.com',
    'team@eend.app',
    'a@b.co.uk',
    'person@co.uk',
    'x@some-small-company.io',
  ]) {
    assert.equal(didYouMean(fine), null, fine)
  }
})

test('a real TLD is never mistaken for a typo of .com', () => {
  // Somebody on .co.uk being asked whether they meant .com would be wrong
  // every single time.
  assert.equal(didYouMean('dave@bbc.co.uk'), null)
  assert.equal(didYouMean('dave@example.org'), null)
  assert.equal(didYouMean('dave@example.dev'), null)
})

test('the field gets one answer, never a refusal and a suggestion at once', () => {
  assert.deepEqual(checkAddress(''), { ok: false, quiet: true })

  const missing = checkAddress('dave@')
  assert.equal(missing.ok, false)
  assert.match(missing.why, /after the @/)

  const noAt = checkAddress('dave')
  assert.equal(noAt.ok, false)
  assert.match(noAt.why, /needs an @/)

  const slip = checkAddress('dave@gmial.com')
  assert.equal(slip.ok, true, 'structurally fine, so never refused')
  assert.equal(slip.meant, 'dave@gmail.com')
  assert.equal(slip.why, undefined, 'not refused and suggested at the same time')

  assert.deepEqual(checkAddress('david@moritznet.com'), { ok: true })
})

test('a suggestion identical to what was typed is not offered', () => {
  // Otherwise "did you mean dave@gmail.com?" appears under dave@gmail.com.
  assert.equal(checkAddress('dave@gmail.com').meant, undefined)
  assert.equal(checkAddress('DAVE@GMAIL.COM').meant, undefined)
})

test('no domain is listed as a typo of itself', () => {
  // It was: gmail.com sat in its own list of slips, so every correct gmail
  // address was offered gmail as a correction. Caught by the test above;
  // this is the one that stops it coming back through the table.
  for (const domain of ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com']) {
    assert.equal(didYouMean(`someone@${domain}`), null, domain)
  }
})
