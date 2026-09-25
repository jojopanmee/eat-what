import test from 'node:test';
import assert from 'node:assert/strict';
import { mapShop, nearbyUrl, areaPosition, searchShops, shopDetailUrl, shopDetails } from '../src/places.js';

const feature = (id, name, cuisine = 'restaurant') => ({ properties: { osm_type: 'N', osm_id: id, osm_value: cuisine, name, city: 'Kuala Lumpur', countrycode: 'my' }, geometry: { coordinates: [101.7, 3.16] } });
const json = data => ({ ok: true, json: async () => data });

test('maps real OSM features to shops and ignores unnamed/nonfood data', () => {
  assert.equal(mapShop(feature(123, 'Test shop')).id, 'osm-N-123');
  assert.equal(mapShop(feature(123, 'Test shop')).source, 'OpenStreetMap');
  assert.equal(mapShop(feature(123, 'Test shop')).countryCode, 'MY');
  assert.equal(mapShop(feature(123, 'Test shop'), 'KLCC').area, 'KLCC');
  assert.equal(mapShop(feature(123, '') ), null);
  assert.equal(mapShop(feature(123, 'Library', 'library')), null);
  assert.match(nearbyUrl(3.16, 101.7), /osm_tag=amenity%3Arestaurant/);
  assert.throws(() => nearbyUrl(999, 101.7), /invalid/);
});

test('typed area is geocoded; nearby results are deduplicated and cached', async () => {
  let calls = 0;
  const fetcher = async url => { calls++; return String(url).includes('/api/') ? json({ features: [{ geometry: { coordinates: [101.7, 3.16] } }] }) : json({ features: [feature(123, 'Test shop'), feature(123, 'Test shop'), feature(124, 'Next shop')] }); };
  assert.deepEqual(await areaPosition('Test Area', fetcher), { lat: 3.16, lon: 101.7 });
  const first = await searchShops({ area: 'Test Area', fetcher });
  assert.equal(first.length, 2);
  await searchShops({ area: 'Test Area', fetcher });
  assert.equal(calls, 2);
  const other = await searchShops({ area: 'Other Area', fetcher });
  assert.equal(other[0].area, 'Other Area');
  assert.equal(calls, 4);
});

test('shop detail shows only mapped cuisine and safe website links', async () => {
  const shop = mapShop(feature(91234, 'Sample'));
  assert.match(shopDetailUrl(shop), /node\/91234\.json$/);
  const detail = await shopDetails(shop, async () => json({ elements: [{ tags: { cuisine: 'malaysian;noodles', dish: 'laksa;roti', opening_hours: 'Mo-Su 10:00-22:00', website: 'https://example.com' } }] }));
  assert.deepEqual(detail.foodTypes, ['malaysian', 'noodles']);
  assert.deepEqual(detail.mappedDishes, ['laksa', 'roti']);
  assert.equal(detail.openingHours, 'Mo-Su 10:00-22:00');
  assert.equal(detail.menuUrl, 'https://example.com');
  assert.equal(shopDetailUrl({ id: 'personal' }), null);
});

test('shop detail keeps only the exact OSM element’s Commons photo link', async () => {
  const shop = mapShop(feature(91235, 'Photo shop'));
  const calls = [];
  const detail = await shopDetails(shop, async url => {
    calls.push(String(url));
    return json({ elements: [{ tags: { wikimedia_commons: 'File:Photo_shop.jpg' } }] });
  });
  assert.equal(calls.length, 1);
  assert.equal(detail.photoFile, 'Photo shop.jpg');
});
