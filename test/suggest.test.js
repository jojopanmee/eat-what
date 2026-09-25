import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, recipeConflict, placeSuitability, mapsUrl, why } from '../src/suggest.js';
import { recipes } from '../src/data/recipes.js';
import { emptyData } from '../src/store.js';

const place = { id: 'mine', name: 'My corner cafe', area: 'Bangsar', cuisine: 'noodles', dishes: 'dry noodles', price: 18, notes: '', status: 'wishlist', pinned: true, source: 'personal', lat: null, lon: null, diet: [] };
const live = [
  { id: 'osm-N-1', name: 'Test noodle shop', area: 'Bangsar', cuisine: '', dishes: '', price: '', notes: '', status: 'discovered', pinned: false, source: 'OpenStreetMap', lat: 3.12, lon: 101.67, diet: [], category: 'restaurant' },
  { id: 'osm-N-2', name: 'Test rice shop', area: 'Bangsar', cuisine: '', dishes: '', price: '', notes: '', status: 'discovered', pinned: false, source: 'OpenStreetMap', lat: 3.13, lon: 101.68, diet: [], category: 'food_court' },
];

test('eat out uses saved and live shops, never canned places', () => {
  assert.deepEqual(candidates({ mode: 'out', data: emptyData() }), []);
  const items = candidates({ mode: 'out', data: emptyData(), livePlaces: live });
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(live.map(item => item.id)));
});

test('another shop excludes the just rejected shop', () => {
  const data = emptyData();
  const first = candidates({ mode: 'out', data, livePlaces: live })[0];
  const next = candidates({ mode: 'out', data, livePlaces: live, excluded: [first.id] })[0];
  assert.ok(next);
  assert.notEqual(next.id, first.id);
});

test('recorded taste makes matching shop types more likely', () => {
  const data = emptyData();
  const shops = [
    { ...live[0], name: 'A regular restaurant', category: 'restaurant' },
    { ...live[1], name: 'A quiet café', category: 'cafe' },
  ];
  data.preferences.likes = 'cafe';
  assert.equal(candidates({ mode: 'out', data, livePlaces: shops })[0].category, 'cafe');
  assert.match(why(shops[1], { mode: 'out', data }), /you like cafés/i);
  data.preferences.dislikes = 'cafe';
  assert.ok(candidates({ mode: 'out', data, livePlaces: shops }).every(item => item.category !== 'cafe'));
});

test('saved wishlist and pinned place is favoured; area and known budget apply', () => {
  const data = emptyData(); data.places.push({ ...place });
  assert.equal(candidates({ mode: 'out', data, livePlaces: live, area: 'Bangsar' })[0].id, 'mine');
  assert.ok(!candidates({ mode: 'out', data, area: 'Kuching' }).some(item => item.id === 'mine'));
  assert.ok(!candidates({ mode: 'out', data, area: 'Bangsar', budget: 12 }).some(item => item.id === 'mine'));
  assert.equal(candidates({ mode: 'out', data, livePlaces: [live[0]], area: 'Bangsar' }).filter(item => item.id === live[0].id).length, 1);
});

test('budget limits known prices while keeping unknown mapped prices visibly uncertain', () => {
  const data = emptyData();
  data.places.push({ ...place, price: 35 });
  const items = candidates({ mode: 'out', data, livePlaces: live, area: 'Bangsar', budget: 25 });
  assert.ok(!items.some(item => item.id === 'mine'));
  assert.ok(items.some(item => item.id === live[0].id && item.budgetUnknown));
});

test('variety moods meaningfully change the first shop', () => {
  const data = emptyData();
  data.places.push(
    { ...place, id: 'regular', name: 'Noodle regular', cuisine: 'noodles', status: 'visited', pinned: false },
    { ...place, id: 'wish', name: 'Noodle wishlist', cuisine: 'noodles', status: 'wishlist', pinned: false },
  );
  data.diary.push({ id: 'meal', name: 'Noodle regular', date: '2026-09-25', mode: 'out', where: 'Noodle regular', cost: 18, rating: 4, note: '', placeId: 'regular', recipeId: '' });
  const rice = { ...live[1], cuisine: 'rice' };
  assert.equal(candidates({ mode: 'out', data, livePlaces: [rice], variety: 'familiar' })[0].id, 'regular');
  assert.equal(candidates({ mode: 'out', data, livePlaces: [rice], variety: 'new' })[0].id, 'wish');
  assert.equal(candidates({ mode: 'out', data, livePlaces: [rice], variety: 'different' })[0].id, rice.id);
  assert.match(why(data.places[0], { mode: 'out', variety: 'familiar', data }), /already know/i);
  assert.match(why(data.places[1], { mode: 'out', variety: 'new', data }), /wishlist/i);
  assert.match(why(data.places[1], { mode: 'out', variety: 'different', data }), /different stop/i);
  assert.doesNotMatch(why(data.places[0], { mode: 'out', variety: 'different', data }), /different stop/i);
});

test('known dietary conflicts are excluded, unknown shop suitability is unverified', () => {
  assert.equal(recipeConflict(recipes.find(recipe => recipe.id === 'peanut-noodles'), ['peanut']), true);
  assert.equal(recipeConflict(recipes.find(recipe => recipe.id === 'chicken-rice'), ['vegetarian']), true);
  assert.equal(placeSuitability({ name: 'Chicken rice', cuisine: '', dishes: '', notes: '', diet: [] }, ['vegetarian']).conflict, true);
  assert.equal(placeSuitability(live[0], ['vegetarian']).unverified, true);
  const data = emptyData();
  const group = [{ budget: 12, preferences: 'rice', dislikes: '', restrictions: ['vegetarian', 'peanut'] }];
  const items = candidates({ mode: 'out', data, livePlaces: [...live, { ...live[0], id: 'osm-N-3', cuisine: 'chicken', name: 'Chicken place' }], group });
  assert.ok(items.length);
  assert.ok(items.every(item => !placeSuitability(item, group[0].restrictions).conflict));
  assert.ok(!items.some(item => item.name === 'Chicken place'));
});

test('halal and no-pork preferences skip known conflicts without treating halal tags as conflicts', () => {
  const halalTagged = { ...live[0], name: 'Halal noodle house', cuisine: 'halal' };
  assert.deepEqual(placeSuitability(halalTagged, ['halal']), { conflict: false, unverified: true });
  assert.equal(placeSuitability({ ...live[0], name: 'Pork noodles' }, ['halal']).conflict, true);
  assert.equal(placeSuitability({ ...live[0], name: 'Bacon café' }, ['no pork']).conflict, true);
  assert.equal(placeSuitability({ ...live[0], name: 'No pork café' }, ['no pork']).conflict, false);
  assert.equal(placeSuitability({ ...live[0], name: 'Beef noodles' }, ['no beef']).conflict, true);
  assert.equal(placeSuitability({ ...live[0], name: 'Prawn noodles' }, ['seafood']).conflict, true);
  const porkRecipe = { ...recipes[0], contains: ['pork'], ingredients: ['100 g pork'] };
  assert.equal(recipeConflict(porkRecipe, ['halal']), true);
});

test('low energy, time and recent meals change recipe candidates', () => {
  const data = emptyData();
  data.diary.push({ id: 'm', name: 'Soy butter egg noodles', date: '2026-09-25', mode: 'home', where: 'Home', cost: '', rating: null, note: '', placeId: '', recipeId: 'egg-noodles' });
  const items = candidates({ mode: 'home', data, time: 20, lowEnergy: true, different: true });
  assert.ok(items.every(item => item.effort === 'low' && item.time <= 20));
  assert.notEqual(items[0].id, 'egg-noodles');
});

test('map links search the chosen shop without a key', () => {
  assert.match(mapsUrl(place), /query=My%20corner%20cafe%20Bangsar/);
  assert.match(mapsUrl(live[0]), /query=Test%20noodle%20shop%203.12%2C101.67/);
  assert.ok(!mapsUrl(live[0]).includes('key='));
});

test('discovery copy only mentions mapped food when this shop has mapped food', () => {
  const bare = { ...live[0], status: 'discovered', details: { foodTypes: [], mappedDishes: [] } };
  assert.match(why(bare, { mode: 'out', area: 'Bangsar' }), /details aren’t mapped yet/i);
  assert.doesNotMatch(why(bare, { mode: 'out', area: 'Bangsar' }), /listed on the map/i);
  const tagged = { ...bare, details: { foodTypes: ['noodles'], mappedDishes: ['laksa'] } };
  assert.match(why(tagged, { mode: 'out', area: 'Bangsar' }), /laksa is listed in this shop’s map details/i);
});
