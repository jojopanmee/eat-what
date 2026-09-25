import { recipes } from './data/recipes.js';

const split = value => String(value || '').toLowerCase().split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
const includes = (haystack, needles) => needles.some(word => haystack.includes(word));
const meat = ['chicken', 'beef', 'pork', 'lamb', 'fish', 'sardine', 'shrimp', 'prawn', 'seafood', 'duck', 'bacon', 'ham', 'lard', 'gelatin'];
const animal = [...meat, 'egg', 'milk', 'cheese', 'butter', 'cream', 'honey'];
const words = item => `${item.name} ${item.category?.replaceAll('_', ' ') || ''} ${item.cuisine || ''} ${item.dishes || ''} ${item.notes || ''} ${(item.contains || []).join(' ')}`.toLowerCase();
function hash(text) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; }
const knownFoodConflict = (text, rule) => {
  const stated = text.toLowerCase().replace(/\b(?:no|without)\s+(?:pork|beef|peanuts?|seafood)\b|\b(?:pork|beef|peanut|seafood)[ -]free\b/g, '');
  if (rule === 'vegetarian') return meat.some(food => new RegExp(`\\b${food}\\b`).test(stated));
  if (rule === 'vegan') return animal.some(food => new RegExp(`\\b${food}\\b`).test(stated));
  if (rule === 'halal') return /\b(?:pork|bacon|ham|lard|pig|alcohol|beer|wine|liquor)\b/.test(stated);
  if (rule === 'no pork') return /\b(?:pork|bacon|ham|lard|pig)\b/.test(stated);
  if (rule === 'no beef') return /\bbeef\b/.test(stated);
  if (rule === 'peanut') return /\b(?:peanuts?|groundnuts?)\b/.test(stated);
  if (rule === 'seafood') return /\b(?:seafood|fish|sardine|shrimp|prawn|squid|crab|oyster|mussel|scallop)\b/.test(stated);
  if (rule === 'shellfish') return /\b(?:shellfish|shrimp|prawn|crab|oyster|mussel|scallop)\b/.test(stated);
  if (rule === 'gluten') return /\b(?:wheat|bread|noodles|soy sauce|gluten)\b/.test(stated);
  if (rule === 'dairy') return /\b(?:milk|butter|cheese|cream|dairy)\b/.test(stated);
  return stated.includes(rule);
};

export function recipeConflict(recipe, restrictions = []) {
  const rules = restrictions.map(x => x.toLowerCase().trim()).filter(Boolean);
  if (rules.includes('vegan') && !recipe.diet.includes('vegan')) return true;
  if (rules.includes('vegetarian') && !recipe.diet.includes('vegetarian')) return true;
  const ingredients = `${recipe.contains.join(' ')} ${recipe.ingredients.join(' ')}`.toLowerCase();
  return rules.some(rule => !['vegan', 'vegetarian'].includes(rule) && knownFoodConflict(ingredients, rule));
}

export function placeSuitability(item, restrictions = []) {
  const rules = restrictions.map(x => x.toLowerCase().trim()).filter(Boolean);
  if (!rules.length) return { conflict: false, unverified: false };
  const text = words(item);
  const tags = item.diet || [];
  for (const rule of rules) {
    if (knownFoodConflict(text, rule)) return { conflict: true, unverified: false };
  }
  return { conflict: false, unverified: item.source === 'OpenStreetMap' || rules.some(rule => !tags.includes(rule)) };
}

export function candidates({ mode, data, livePlaces = [], area = '', budget = 0, time = 60, lowEnergy = false, different = false, variety = 'open', group = [], excluded = [] }) {
  const restrictions = group.length ? [...new Set(group.flatMap(person => person.restrictions || []))] : data.preferences.restrictions;
  const dislikes = group.length ? group.flatMap(person => split(person.dislikes)) : split(data.preferences.dislikes);
  const likes = group.length ? group.flatMap(person => split(person.preferences)) : split(data.preferences.likes);
  const limits = [Number(budget), ...group.map(person => Number(person.budget))].filter(n => n > 0);
  const limit = limits.length ? Math.min(...limits) : 0;
  const recent = [...data.diary].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentKinds = new Set(recent.flatMap(meal => {
    const place = data.places.find(saved => saved.id === meal.placeId);
    return place ? [place.category, ...split(place.cuisine)].filter(Boolean) : [];
  }));
  const savedIds = new Set(data.places.map(place => place.id));
  const source = mode === 'home' ? recipes : [...data.places, ...livePlaces.filter(place => !savedIds.has(place.id))];
  const day = new Date().toISOString().slice(0, 10);
  return source.filter(item => {
    if (excluded.includes(item.id)) return false;
    if (mode === 'home') {
      if (item.time > Number(time) || (lowEnergy && item.effort !== 'low') || (limit && item.cost > limit) || recipeConflict(item, restrictions)) return false;
    } else {
      if (area && (!item.area || !item.area.toLowerCase().includes(area.toLowerCase()) && !area.toLowerCase().includes(item.area.toLowerCase()))) return false;
      if (limit && item.price && Number(item.price) > limit) return false;
      if (placeSuitability(item, restrictions).conflict) return false;
    }
    return !includes(words(item), dislikes);
  }).map(item => {
    const eaten = recent.some(meal => meal.placeId === item.id || meal.recipeId === item.id || meal.name.toLowerCase() === item.name.toLowerCase());
    let score = (item.pinned ? 5 : 0) + (item.status === 'wishlist' ? 3 : 0) + (includes(words(item), likes) ? 6 : 0);
    if (mode === 'out' && data.areas.some(pinned => pinned && item.area?.toLowerCase().includes(pinned.toLowerCase()))) score += 2;
    if (mode === 'out' && data.diary.some(meal => meal.placeId === item.id && meal.rating >= 4)) score += 2;
    if (mode === 'out' && item.source === 'OpenStreetMap' && item.status === 'discovered') score += item.category === 'restaurant' || item.category === 'food_court' ? 2 : item.category === 'cafe' ? -2 : 0;
    if (item.status === 'visited') score += 2;
    if (eaten) score -= different || variety === 'different' ? 14 : 5;
    if (mode === 'home' && item.time <= 20) score += 1;
    if (mode === 'out' && limit && !item.price) score -= 2;
    if (mode === 'out' && variety === 'familiar') {
      if (item.pinned) score += 7;
      if (item.status === 'visited') score += 8;
      if (item.status === 'discovered') score -= 8;
    }
    if (mode === 'out' && variety === 'new') {
      if (item.status === 'wishlist' || item.status === 'discovered') score += 9;
      if (item.status === 'visited') score -= 7;
    }
    if (mode === 'out' && variety === 'different') {
      const kinds = [item.category, ...split(item.cuisine)].filter(Boolean);
      if (recentKinds.size && kinds.length) score += kinds.some(kind => recentKinds.has(kind)) ? -6 : 5;
      if (item.status === 'discovered') score += 2;
    }
    return { ...item, score, unverified: mode === 'out' && placeSuitability(item, restrictions).unverified, budgetUnknown: mode === 'out' && !!limit && !item.price, tie: hash(item.id + day) };
  }).sort((a, b) => b.score - a.score || a.tie - b.tie);
}

export function why(item, { mode, area = '', lowEnergy = false, data, variety = 'open' } = {}) {
  if (mode === 'home') return lowEnergy ? `Low effort, about ${item.time} minutes, and still a proper meal. ${item.why}` : `${item.why} Ready in about ${item.time} minutes.`;
  const recentStops = [...(data?.diary || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  if (variety === 'familiar' && item.status === 'visited') return `A place you already know${item.pinned ? ' and pinned' : ''}.${item.dishes ? ` Your note about ${item.dishes} makes it tempting again.` : ' An easy yes when deciding feels like work.'}`;
  if (variety === 'familiar' && item.pinned) return `You pinned this place as one to remember.${item.dishes ? ` Your note about ${item.dishes} makes it tempting.` : ' Take another look at its current menu.'}`;
  if (variety === 'new' && item.status === 'wishlist') return `That place on your wishlist could finally have its night.${item.dishes ? ` You saved ${item.dishes} as the draw.` : ' Peek at the current menu and see what calls to you.'}`;
  if (variety === 'different' && !recentStops.some(meal => meal.placeId === item.id) && recentStops.some(meal => meal.placeId)) return `A different stop from your recent meals.${item.dishes ? ` Maybe ${item.dishes} is the reason to go.` : ' Check the current menu for something that catches your eye.'}`;
  const liked = split(data?.preferences?.likes).find(term => words(item).includes(term));
  if (liked) return `You like ${{ cafe: 'cafés', 'food court': 'food courts' }[liked] || liked}. This shop’s name or mapped details point that way; check its menu.`;
  if (item.status === 'discovered') {
    const kind = { restaurant: 'A restaurant', cafe: 'A café', food_court: 'A food court', fast_food: 'A quick stop' }[item.category] || 'A shop';
    const place = `${kind}${area ? ` around ${area}` : ' nearby'}`;
    const dish = item.details?.mappedDishes?.[0];
    if (dish) return `${dish[0].toUpperCase()}${dish.slice(1)} is listed in this shop’s map details. See if it’s on today’s menu.`;
    const listed = [...new Set(item.details?.foodTypes || [])].slice(0, 2);
    return listed.length ? `${place} with ${listed.join(' and ')} listed on the map—worth a closer look.` : `${place} for a change of scene. Food details aren’t mapped yet; check the current menu.`;
  }
  if (item.pinned) return `You pinned this place for a reason.${item.dishes ? ` Maybe ${item.dishes} is calling your name.` : ' Maybe tonight is the night to go back.'}`;
  if (item.status === 'wishlist') return `That place you meant to try${area ? ` in ${area}` : ''} could be tonight’s little adventure.${item.dishes ? ` You saved ${item.dishes} as the draw.` : ''}`;
  return `A place you saved${area ? ` around ${area}` : ''}.${item.dishes ? ` You wanted to remember ${item.dishes}.` : ' Maybe it is time to go back.'}`;
}

export function mapsUrl(item, area = '') {
  const query = item.lat != null && item.lon != null ? `${item.name} ${item.lat},${item.lon}` : [item.name, item.area || area].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
