import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsFile, commonsPhoto } from '../src/photos.js';

const json = data => ({ ok: true, json: async () => data });

test('only exact map-linked Commons image tags can provide shop photos', () => {
  assert.equal(commonsFile({ wikimedia_commons: 'File:My_shop_front.jpg' }), 'My shop front.jpg');
  assert.equal(commonsFile({ image: 'https://commons.wikimedia.org/wiki/File:Tea_house.jpeg' }), 'Tea house.jpeg');
  assert.equal(commonsFile({ image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Local_cafe.png' }), 'Local cafe.png');
  assert.equal(commonsFile({ image: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Shop_front.webp' }), 'Shop front.webp');
  assert.equal(commonsFile({ image: 'https://example.com/shop.jpg' }), '');
  assert.equal(commonsFile({ wikimedia_commons: 'Category:Restaurants' }), '');
  assert.equal(commonsFile({ image: 'https://commons.wikimedia.org/wiki/File:%EF%ZZ.jpg' }), '');
});

test('Commons thumbnail includes safe author, license and source', async () => {
  let requested = '';
  const photo = await commonsPhoto('My shop front.jpg', async url => {
    requested = url;
    return json({ query: { pages: { 12: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/My_shop_front.jpg/960px-My_shop_front.jpg', extmetadata: { Artist: { value: '<a href="https://example.org">Nora &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }] } } } });
  });
  assert.match(requested, /titles=File%3AMy\+shop\+front.jpg/);
  assert.equal(photo.author, 'Nora & Co');
  assert.equal(photo.license, 'CC BY-SA 4.0');
  assert.equal(photo.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.match(photo.sourceUrl, /commons.wikimedia.org\/wiki\/File:My_shop_front.jpg/);
});

test('Commons rejects unrelated hosts and missing photo credit', async () => {
  const make = (url, meta) => json({ query: { pages: { 1: { imageinfo: [{ thumburl: url, extmetadata: meta }] } } } });
  const credit = { Artist: { value: 'Nora' }, LicenseShortName: { value: 'CC BY 4.0' } };
  assert.equal(await commonsPhoto('Shop.jpg', async () => make('https://evil.example/photo.jpg', credit)), null);
  assert.equal(await commonsPhoto('Shop.jpg', async () => make('https://upload.wikimedia.org/shop.jpg', {})), null);
  assert.equal(await commonsPhoto('', async () => { throw Error('should not fetch'); }), null);
});
