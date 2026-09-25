const KEY = 'eat-what-v3';

export const emptyData = () => ({
  version: 3,
  area: '',
  areas: [],
  places: [],
  diary: [],
  recentShops: [],
  preferences: { likes: '', dislikes: '', restrictions: [] },
});

const text = (value, max) => typeof value === 'string' && value.length <= max;
const money = value => value === '' || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000);
const id = value => text(value, 150) && !!value;
const calendarDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export function validateBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 3) throw Error('This is not an Eat What? version 3 backup.');
  if (!text(value.area, 120) || !Array.isArray(value.areas) || value.areas.length > 100 || value.areas.some(area => !text(area, 120)) ||
      !Array.isArray(value.places) || value.places.length > 1000 || !Array.isArray(value.diary) || value.diary.length > 5000 ||
      (value.recentShops !== undefined && (!Array.isArray(value.recentShops) || value.recentShops.length > 8 || value.recentShops.some(shop => !id(shop)))) ||
      !value.preferences || typeof value.preferences !== 'object') throw Error('Backup sections are missing or invalid.');
  for (const place of value.places) {
    if (!place || !id(place.id) || !text(place.name, 160) || !place.name.trim() || !text(place.area, 120) ||
        !text(place.cuisine, 200) || !text(place.dishes, 400) || !text(place.notes, 1000) || !money(place.price) ||
        !['visited', 'wishlist'].includes(place.status) || typeof place.pinned !== 'boolean' ||
        !text(place.source, 60) || (place.category !== undefined && !text(place.category, 50)) || (place.countryCode !== undefined && !text(place.countryCode, 2)) || !(place.lat === null || Number.isFinite(place.lat) && Math.abs(place.lat) <= 90) ||
        !(place.lon === null || Number.isFinite(place.lon) && Math.abs(place.lon) <= 180) ||
        !Array.isArray(place.diet) || place.diet.some(tag => !text(tag, 50))) throw Error('A saved place has invalid fields.');
  }
  for (const meal of value.diary) {
    if (!meal || !id(meal.id) || !text(meal.name, 160) || !meal.name.trim() || !text(meal.date, 20) ||
        !calendarDate(meal.date) || !['out', 'home'].includes(meal.mode) ||
        !text(meal.where, 160) || !text(meal.note, 1000) || !money(meal.cost) ||
        !(meal.rating === null || Number.isInteger(meal.rating) && meal.rating >= 1 && meal.rating <= 5) ||
        !text(meal.placeId, 150) || !text(meal.recipeId, 150)) throw Error('A diary entry has invalid fields.');
  }
  const p = value.preferences;
  if (!text(p.likes, 500) || !text(p.dislikes, 500) || !Array.isArray(p.restrictions) || p.restrictions.length > 50 || p.restrictions.some(tag => !text(tag, 500))) throw Error('Preferences are invalid.');
  return { ...structuredClone(value), recentShops: value.recentShops || [] };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validateBackup(JSON.parse(raw)) : emptyData();
  } catch { return emptyData(); }
}
export function saveData(data) { localStorage.setItem(KEY, JSON.stringify(validateBackup(data))); }
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(validateBackup(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `eat-what-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
