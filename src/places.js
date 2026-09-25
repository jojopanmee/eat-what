// User-triggered, keyless OpenStreetMap lookup through Photon. Never polls in the background.
import { commonsFile } from './photos.js';
const PHOTON = 'https://photon.komoot.io';
const OSM = 'https://api.openstreetmap.org/api/0.6';
const TTL = 15 * 60 * 1000;
const searchCache = new Map();
const detailCache = new Map();
const geocodeCache = new Map();
const timeout = ms => AbortSignal.timeout(ms);

export function straightLineKm(from, to) {
  if (![from?.lat, from?.lon, to?.lat, to?.lon].every(Number.isFinite)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const latitude = radians(to.lat - from.lat);
  const longitude = radians(to.lon - from.lon);
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

export function mapShop(feature, area = '', origin = null) {
  const p = feature?.properties || {};
  const [lon, lat] = feature?.geometry?.coordinates || [];
  if (!p.name || !['N', 'W', 'R'].includes(p.osm_type) || !Number.isSafeInteger(p.osm_id) || !Number.isFinite(lat) || !Number.isFinite(lon) || !['restaurant', 'fast_food', 'cafe', 'food_court'].includes(p.osm_value)) return null;
  return {
    id: `osm-${p.osm_type}-${p.osm_id}`, name: String(p.name).slice(0, 160),
    area: area || p.locality || p.district || p.city || '', cuisine: '', dishes: '', price: '', notes: '',
    status: 'discovered', pinned: false, source: 'OpenStreetMap', lat, lon, diet: [],
    category: p.osm_value, address: [p.street, p.city].filter(Boolean).join(', '), countryCode: String(p.countrycode || '').toUpperCase(),
    distanceKm: origin ? straightLineKm(origin, { lat, lon }) : null,
  };
}

export function nearbyUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error('Location is invalid.');
  const url = new URL('/reverse', PHOTON);
  url.searchParams.set('lat', String(lat)); url.searchParams.set('lon', String(lon));
  url.searchParams.set('radius', '3'); url.searchParams.set('limit', '50');
  for (const type of ['restaurant', 'fast_food', 'cafe', 'food_court']) url.searchParams.append('osm_tag', `amenity:${type}`);
  return url.toString();
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Error('Location is unavailable. Choose an area instead.'));
    navigator.geolocation.getCurrentPosition(
      point => resolve({ lat: point.coords.latitude, lon: point.coords.longitude }),
      () => reject(Error('Allow location, or choose an area instead.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export async function areaPosition(area, fetcher = fetch) {
  const key = area.trim().toLowerCase();
  if (!key) throw Error('Type an area or allow location.');
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const url = new URL('/api/', PHOTON);
  url.searchParams.set('q', area.trim()); url.searchParams.set('countrycode', 'MY'); url.searchParams.set('limit', '1');
  const response = await fetcher(url, { signal: timeout(12000) });
  if (!response.ok) throw Error('Area lookup is unavailable right now. Try again shortly.');
  const feature = (await response.json()).features?.[0];
  const [lon, lat] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw Error('That area was not found. Try a nearby town.');
  const point = { lat, lon };
  geocodeCache.set(key, point);
  return point;
}

export async function searchShops({ area = '', positionProvider = currentPosition, fetcher = fetch } = {}) {
  const point = area.trim() ? await areaPosition(area, fetcher) : await positionProvider();
  const key = `${area.trim().toLowerCase()}|${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < TTL) return cached.places;
  const response = await fetcher(nearbyUrl(point.lat, point.lon), { signal: timeout(12000) });
  if (!response.ok) throw Error('Nearby shops are unavailable right now. Your saved places still work.');
  const raw = (await response.json()).features;
  if (!Array.isArray(raw)) throw Error('Nearby shops could not be read. Try again shortly.');
  const seen = new Set();
  const places = raw.map(feature => mapShop(feature, area.trim(), point)).filter(place => {
    if (!place || seen.has(place.id)) return false;
    seen.add(place.id); return true;
  });
  searchCache.set(key, { time: Date.now(), places });
  return places;
}

export function shopDetailUrl(item) {
  const match = /^osm-([NWR])-(\d+)$/.exec(item.id || '');
  if (!match) return null;
  const type = { N: 'node', W: 'way', R: 'relation' }[match[1]];
  return `${OSM}/${type}/${match[2]}.json`;
}

export async function shopDetails(item, fetcher = fetch) {
  const url = shopDetailUrl(item);
  if (!url) return { foodTypes: [], mappedDishes: [], openingHours: '', menuUrl: '' };
  if (detailCache.has(url)) return detailCache.get(url);
  const response = await fetcher(url, { signal: timeout(5000) });
  if (!response.ok) throw Error('Shop details are unavailable right now.');
  const tags = (await response.json()).elements?.[0]?.tags || {};
  const foodTypes = String(tags.cuisine || '').split(/[;,]/).map(value => value.trim().replaceAll('_', ' ')).filter(Boolean).slice(0, 10);
  const mappedDishes = String(tags.dish || '').split(/[;,]/).map(value => value.trim().replaceAll('_', ' ')).filter(Boolean).slice(0, 5);
  const openingHours = String(tags.opening_hours || '').slice(0, 200);
  const rawMenu = tags['website:menu'] || tags['menu:website'] || tags.website || '';
  const menuUrl = /^https?:\/\//i.test(rawMenu) ? rawMenu : '';
  const detail = { foodTypes, mappedDishes, openingHours, menuUrl, photoFile: commonsFile(tags) };
  detailCache.set(url, detail);
  return detail;
}
