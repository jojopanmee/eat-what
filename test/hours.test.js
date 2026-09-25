import test from 'node:test';
import assert from 'node:assert/strict';
import { openingHoursStatus } from '../src/hours.js';

const fridayNoon = new Date('2026-09-25T04:00:00Z'); // 12:00 in Malaysia
const fridayNight = new Date('2026-09-25T15:00:00Z'); // 23:00 in Malaysia

test('simple listed hours show a cautious open or closed status', () => {
  assert.equal(openingHoursStatus('Mo-Su 10:00-22:00', fridayNoon).state, 'open');
  assert.equal(openingHoursStatus('Mo-Su 10:00-22:00', fridayNight).state, 'closed');
  assert.equal(openingHoursStatus('24/7', fridayNight).state, 'open');
});

test('overnight rules and unknown exceptions do not misstate opening', () => {
  assert.equal(openingHoursStatus('Fr-Sa 18:00-02:00', fridayNight).state, 'open');
  assert.equal(openingHoursStatus('Mo-Su 10:00-22:00; PH off', fridayNoon).state, 'unknown');
  assert.equal(openingHoursStatus('Mo-Su 10:00-22:00', fridayNoon, null).state, 'unknown');
  assert.equal(openingHoursStatus('').state, 'unknown');
});
