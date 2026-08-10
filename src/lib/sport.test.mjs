import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headingFor, isOnFoot, toSport, words } from './sport.js'

test('Strava’s own words, made to fit', () => {
  assert.equal(toSport('Run'), 'run')
  assert.equal(toSport('TrailRun'), 'run')
  assert.equal(toSport('VirtualRun'), 'run')
  assert.equal(toSport('Walk'), 'walk')
  assert.equal(toSport('Hike'), 'hike')
  assert.equal(toSport('Ride'), 'ride')
  assert.equal(toSport('VirtualRide'), 'ride')
  assert.equal(toSport('EBikeRide'), 'ride')
  assert.equal(toSport('Swim'), 'swim')
})

test('anything else still has a distance and a line on a map', () => {
  assert.equal(toSport('Kitesurf'), 'other')
  assert.equal(toSport(''), 'other')
  assert.equal(toSport(null), 'other')
})

test('a run is called a run', () => {
  // The whole argument against renaming everything to "Activity": David
  // ran 21.4 km and the app should say so.
  assert.equal(words('run').one, 'run')
  assert.equal(words('walk').one, 'walk')
  assert.equal(words('Hike').one, 'hike')
})

test('the heading follows what is actually there', () => {
  assert.equal(headingFor([{ sport: 'run' }, { sport: 'run' }]), 'Runs')
  // Somebody who only walks should never read a heading saying Runs.
  assert.equal(headingFor([{ sport: 'walk' }]), 'Walks')
  assert.equal(headingFor([{ sport: 'ride' }]), 'Rides')
})

test('and mixed on-foot is one word people actually use', () => {
  assert.equal(headingFor([{ sport: 'run' }, { sport: 'walk' }]), 'On foot')
  assert.equal(headingFor([{ sport: 'run' }, { sport: 'hike' }, { sport: 'walk' }]), 'On foot')
  assert.equal(headingFor([{ sport: 'run' }, { sport: 'ride' }]), 'Moving')
})

test('an empty trip does not get a heading it cannot fill', () => {
  // No activities at all means the section is not rendered; this only has
  // to not throw.
  assert.equal(typeof headingFor([]), 'string')
})

test('on foot is the kind whose track says where a day went', () => {
  // A ride covers ground too fast to say much about a day, and a swim
  // goes in circles.
  assert.equal(isOnFoot({ sport: 'walk' }), true)
  assert.equal(isOnFoot({ sport: 'run' }), true)
  assert.equal(isOnFoot({ sport: 'hike' }), true)
  assert.equal(isOnFoot({ sport: 'ride' }), false)
  assert.equal(isOnFoot({ sport: 'swim' }), false)
})

test('a row with no type at all is a run, because the table is called runs', () => {
  // Every row written before the column existed is one of David's runs.
  // Calling those "outings" would be the schema's history leaking into
  // somebody's holiday.
  assert.equal(words(undefined).one, 'run')
  assert.equal(words(null).one, 'run')
  assert.equal(words('').one, 'run')
  // But something Strava sent that we do not recognise is genuinely other.
  assert.equal(words('Kitesurf').one, 'outing')
})
