import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, validateBackup } from '../src/store.js';

const place = { id: 'p1', name: 'Favourite shop', area: 'Bangsar', cuisine: 'noodles', dishes: 'dry noodles', price: 18, notes: '', status: 'wishlist', pinned: true, source: 'personal', lat: null, lon: null, diet: [] };
const meal = { id: 'm1', name: 'Dry noodles', date: '2026-09-25', mode: 'out', where: 'Favourite shop', cost: 18, rating: 5, note: 'Lovely', placeId: 'p1', recipeId: '' };

test('valid backup round trips saved places, diary and preferences', () => {
  const backup = emptyData();
  backup.area = 'Bangsar'; backup.areas = ['Bangsar']; backup.places = [place]; backup.diary = [meal];
  backup.preferences.likes = 'noodles';
  backup.recentShops = ['p1'];
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup);
});

test('older version 3 backups gain empty recent shops and invalid history is rejected', () => {
  const older = emptyData();
  delete older.recentShops;
  assert.deepEqual(validateBackup(older).recentShops, []);
  older.recentShops = [12];
  assert.throws(() => validateBackup(older), /Backup sections/);
});

test('backup accepts optional mapped shop category for saved taste', () => {
  const backup = emptyData();
  backup.places = [{ ...place, category: 'cafe', countryCode: 'MY' }];
  assert.equal(validateBackup(backup).places[0].category, 'cafe');
  assert.equal(validateBackup(backup).places[0].countryCode, 'MY');
  backup.places[0].category = 42;
  assert.throws(() => validateBackup(backup), /saved place/);
  backup.places[0].category = 'cafe'; backup.places[0].countryCode = 'MYS';
  assert.throws(() => validateBackup(backup), /saved place/);
});

test('import rejects wrong version, malformed entries and prices', () => {
  assert.throws(() => validateBackup({ version: 2 }), /version 3/);
  const backup = emptyData();
  backup.places = [{ ...place, status: 'imaginary' }];
  assert.throws(() => validateBackup(backup), /saved place/);
  backup.places = [{ ...place, price: -1 }];
  assert.throws(() => validateBackup(backup), /saved place/);
  backup.places = [place]; backup.diary = [{ ...meal, date: 'tomorrow' }];
  assert.throws(() => validateBackup(backup), /diary entry/);
  backup.diary = [{ ...meal, date: '2026-02-30' }];
  assert.throws(() => validateBackup(backup), /diary entry/);
});
