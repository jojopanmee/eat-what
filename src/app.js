import { loadData, saveData, uid, validateBackup, downloadBackup } from './store.js';
import { recipes } from './data/recipes.js';
import { candidates, directionsUrl, mapsUrl, placeSuitability, why } from './suggest.js';
import { searchShops, shopDetails, shopDetailUrl } from './places.js';
import { commonsPhoto } from './photos.js';
import { openingHoursStatus } from './hours.js';

const app = document.querySelector('#app');
let data = loadData();
const ui = {
  view: 'discover', mode: 'out', groupMode: 'out',
  area: data.area || '', useLocation: false, areaPickerOpen: false, budget: '', time: '30', lowEnergy: false, different: false, variety: 'open',
  groupArea: data.area || '', groupUseLocation: false, groupAreaPickerOpen: false, groupBudget: '', groupTime: '30', groupLowEnergy: false, groupVariety: 'open',
  reveal: null, groupReveal: null, excluded: [], groupExcluded: [],
  members: [], editingPerson: null, modal: null, lastOpener: null, chosenId: '', silentRefresh: false, search: '', toast: '', noMatch: '', groupNoMatch: '', busy: false, livePlaces: [], shopError: '',
};
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const today = () => new Date().toLocaleDateString('en-CA');
const money = value => value === '' || value == null ? 'Price unverified' : `~RM ${Number(value).toFixed(0)}`;
const priceFact = value => value === '' || value == null ? 'Price not listed' : `Your estimate ${money(value)}`;
const distanceFact = value => !Number.isFinite(value) || value < 0 ? '' : value < 0.1 ? 'Under 100 m straight line' : value < 1 ? `${Math.round(value * 10) * 100} m straight line` : `${value.toFixed(1)} km straight line`;
const artPosition = index => `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100}%`;
const TASTE_OPTIONS = [['Noodles','noodles'],['Rice','rice'],['Cafés','cafe'],['Food courts','food court'],['Japanese','japanese'],['Indian','indian'],['Malay','malay'],['Chinese','chinese']];
const NEED_OPTIONS = [['Halal','halal'],['No pork','no pork'],['No beef','no beef'],['Vegetarian','vegetarian'],['Vegan','vegan'],['Peanuts','peanut'],['Seafood','seafood']];
const BUDGET_OPTIONS = [['Any', ''], ['RM15', '15'], ['RM25', '25'], ['RM40', '40'], ['RM60', '60']];
const VARIETY_OPTIONS = [
  ['open', 'Anything goes', 'Let the moment decide'],
  ['familiar', 'A sure thing', 'A saved favourite'],
  ['new', 'Somewhere new', 'A wishlist or fresh find'],
  ['different', 'Plot twist', 'Skip recent repeats'],
];
const presetNeeds = new Set(NEED_OPTIONS.map(([, value]) => value));
const likedTerms = () => data.preferences.likes.toLowerCase().split(',').map(term => term.trim()).filter(Boolean);
const likesTerm = term => likedTerms().includes(term.toLowerCase());
const hasNeed = term => data.preferences.restrictions.some(need => need.toLowerCase() === term);
const placeTagline = place => place.dishes || (place.cuisine ? `${place.cuisine.split(/[;,]/).map(value => value.trim().replaceAll('_', ' ')).filter(Boolean).slice(0, 2).join(' · ')} to explore` : ({ restaurant: 'A restaurant to discover', cafe: 'A café to pause at', food_court: 'Plenty of choices under one roof', fast_food: 'A quick stop worth a look' }[place.category] || 'A new spot to look into'));
function shopArt(item) {
  const seed = [...String(item.id || item.name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const tile = item.category === 'cafe' ? 3 : item.category === 'food_court' ? 1 : item.category === 'fast_food' || /noodles?|ramen|mee|laksa/i.test(`${item.name} ${item.cuisine}`) ? 2 : seed % 2 ? 0 : 2;
  const fallback = `<div class="shop-placeholder variant-${tile}" aria-hidden="true"></div><span class="art-stamp fallback-stamp">ILLUSTRATION · NOT THE SHOP</span>`;
  const photo = item.details?.photo;
  return `<div class="art shop-art-frame">${fallback}${photo ? `<img class="shop-photo" src="${h(photo.url)}" alt="Photo linked to ${h(item.name)} by OpenStreetMap contributors" referrerpolicy="no-referrer"><span class="photo-credit">PHOTO: <a href="${h(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">${h(photo.author)} ↗</a> · ${photo.licenseUrl ? `<a href="${h(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${h(photo.license)}</a>` : h(photo.license)}</span>` : ''}</div>`;
}
const findRecipe = id => recipes.find(recipe => recipe.id === id);
const tableMembers = () => [{ name: 'You', budget: 0, preferences: data.preferences.likes, dislikes: data.preferences.dislikes, restrictions: data.preferences.restrictions }, ...ui.members];
function revealDock(item, mode, group = false) {
  if (!item) return '';
  const recipe = mode === 'home';
  return `<div class="reveal-dock" aria-label="Quick decision"><button class="button primary" data-action="${group ? 'group-choose' : 'choose'}">${recipe ? 'Cook this ♥' : group ? 'We’re going here ♥' : 'I’m going here ♥'}</button><button class="button dock-next" data-action="${group ? 'group-next' : 'next'}">Another ↻</button></div>`;
}

function persist() { try { saveData(data); } catch { ui.toast = 'Could not save on this device.'; } }
function flash(message) { ui.toast = message; render(); setTimeout(() => { if (ui.toast === message) { ui.toast = ''; render(); } }, 3500); }
function nav() { return `<nav class="nav" aria-label="Main"><button data-action="view" data-value="discover" class="${ui.view === 'discover' ? 'active' : ''}" ${ui.view === 'discover' ? 'aria-current="page"' : ''}><span aria-hidden="true">✳</span>Decide</button><button data-action="view" data-value="friends" class="${ui.view === 'friends' ? 'active' : ''}" ${ui.view === 'friends' ? 'aria-current="page"' : ''}><span aria-hidden="true">◌</span>Friends</button><button data-action="view" data-value="mine" class="${ui.view === 'mine' ? 'active' : ''}" ${ui.view === 'mine' ? 'aria-current="page"' : ''}><span aria-hidden="true">♡</span>My food</button></nav>`; }
function mast() { return `<header class="mast"><button class="wordmark" data-action="view" data-value="discover">Eat What<span>?</span></button><div class="mast-actions"><span class="mast-note">A LITTLE FOOD ADVENTURE</span><button class="mast-taste" data-action="taste" aria-label="Open food preferences">♡ <span>Preferences</span></button></div></header>`; }

function controls(group = false) {
  const mode = group ? ui.groupMode : ui.mode;
  return `<button class="mode-alternative" data-action="mode" data-group="${group}" data-value="${mode === 'out' ? 'home' : 'out'}">${mode === 'out' ? 'Cooking instead? See a recipe ↗' : 'Eating out instead? Find a shop ↗'}</button>`;
}
function lowControl(group = false) {
  const lowEnergy = group ? ui.groupLowEnergy : ui.lowEnergy;
  return `<label class="check quick-choice"><input id="${group ? 'group-' : ''}low" type="checkbox" ${lowEnergy ? 'checked' : ''}> Low energy today</label>`;
}
function surpriseLabel(group = false) {
  const mode = group ? ui.groupMode : ui.mode;
  const who = group && ui.members.length ? 'us' : 'me';
  if (mode === 'home') return `Surprise ${who} with a recipe`;
  const area = group ? ui.groupArea : ui.area;
  return `Surprise ${who} ${area ? `in ${area.slice(0, 28)}` : 'nearby'}`;
}
function whereControl(group = false) {
  if ((group ? ui.groupMode : ui.mode) !== 'out') return '';
  const prefix = group ? 'group-' : '';
  const area = group ? ui.groupArea : ui.area;
  const locating = group ? ui.groupUseLocation : ui.useLocation;
  const open = group ? ui.groupAreaPickerOpen : ui.areaPickerOpen;
  const pinned = data.areas.filter(value => value && value.toLowerCase() !== area.toLowerCase()).slice(0, 3);
  return `<div class="where-control compact-where"><div class="where-compact"><span>AREA</span><button data-action="edit-area" data-group="${group}" aria-expanded="${open}" aria-controls="${prefix}area-editor"><strong>${h(area || 'Near me')}</strong><small>Change ↗</small></button></div><div class="area-editor" id="${prefix}area-editor" ${open ? '' : 'hidden'}><label for="${prefix}area">Choose an area or town</label><div class="where-row"><input id="${prefix}area" maxlength="120" placeholder="e.g. Bangsar" autocomplete="off" value="${h(area)}" list="area-suggestions"><button class="near-button ${locating ? 'selected' : ''}" data-action="near-me" data-group="${group}" aria-pressed="${locating}">Near me</button></div><datalist id="area-suggestions">${[...new Set([...data.areas, ...data.places.map(place => place.area).filter(Boolean)])].map(value => `<option value="${h(value)}"></option>`).join('')}</datalist>${pinned.length ? `<div class="area-shortcuts"><span>Saved areas</span>${pinned.map(value => `<button data-action="area-pick" data-group="${group}" data-value="${h(value)}">${h(value)} ↗</button>`).join('')}</div>` : ''}<p class="where-error" role="status"></p></div></div>`;
}
function constraints(group = false) {
  const mode = group ? ui.groupMode : ui.mode;
  const prefix = group ? 'group-' : '';
  const budget = group ? ui.groupBudget : ui.budget;
  const time = group ? ui.groupTime : ui.time;
  const variety = group ? ui.groupVariety : ui.variety;
  const varietyLabel = VARIETY_OPTIONS.find(([value]) => value === variety)?.[1] || 'Anything goes';
  const summary = mode === 'out' ? (budget || variety !== 'open' ? `${budget ? `Up to RM${budget}` : 'Any budget'} · ${varietyLabel}` : 'Budget & variety') : 'Time & budget';
  return `<details class="fine-tune constraints"><summary><span id="${prefix}constraint-summary">${h(summary)}</span>${mode === 'home' ? ' <small>optional</small>' : ''}</summary><div class="fine-fields">
    ${mode === 'out' ? `<fieldset class="choice-field"><legend>Spend per person</legend><div class="budget-chips" role="group" aria-label="Maximum price per person">${BUDGET_OPTIONS.map(([label, value]) => `<button type="button" class="budget-chip" data-action="budget-preset" data-group="${group}" data-value="${value}" aria-pressed="${String(budget) === value}">${label}</button>`).join('')}</div><details class="custom-budget" ${budget && !BUDGET_OPTIONS.some(([, value]) => value === String(budget)) ? 'open' : ''}><summary>Another amount in RM</summary><label>Maximum per person<input id="${prefix}budget" type="number" inputmode="numeric" min="0" max="100000" placeholder="e.g. 30" value="${h(budget)}"></label></details><p class="constraint-hint">Saved prices are your estimates; mapped shop prices may be unknown.</p></fieldset><fieldset class="choice-field"><legend>What kind of surprise?</legend><div class="variety-grid" role="group" aria-label="Variety of shop">${VARIETY_OPTIONS.map(([value, label, hint]) => `<button type="button" class="variety-chip" data-action="variety-pick" data-group="${group}" data-value="${value}" aria-pressed="${variety === value}"><strong>${label}</strong><small>${hint}</small></button>`).join('')}</div></fieldset>` : `<div class="two-fields"><label>Time available<select id="${prefix}time">${[15,20,30,45,60].map(n => `<option value="${n}" ${String(n) === String(time) ? 'selected' : ''}>${n} min</option>`).join('')}</select></label><label>Budget for recipe (RM)<input id="${prefix}budget" type="number" min="0" max="100000" placeholder="Any" value="${h(budget)}"></label></div>${group ? '' : `<label class="check"><input id="different" type="checkbox" ${ui.different ? 'checked' : ''}> Something different from recent meals</label>`}`}
    </div></details>`;
}
function updateConstraintSummary(group = false) {
  const prefix = group ? 'group-' : '';
  const budget = group ? ui.groupBudget : ui.budget;
  const variety = group ? ui.groupVariety : ui.variety;
  const label = VARIETY_OPTIONS.find(([value]) => value === variety)?.[1] || 'Anything goes';
  const summary = document.getElementById(`${prefix}constraint-summary`);
  if (summary) summary.textContent = `${budget ? `Up to RM${budget}` : 'Any budget'} · ${label}`;
}
function capture(group = false) {
  const prefix = group ? 'group-' : '';
  const get = name => document.getElementById(prefix + name);
  if (group) {
    if (get('area')) ui.groupArea = get('area').value.trim();
    ui.groupBudget = get('budget')?.value || '';
    ui.groupTime = get('time')?.value || ui.groupTime;
    ui.groupLowEnergy = !!get('low')?.checked;
  } else {
    if (get('area')) ui.area = get('area').value.trim();
    ui.budget = get('budget')?.value || '';
    ui.time = get('time')?.value || ui.time;
    ui.lowEnergy = !!get('low')?.checked;
    if (ui.mode === 'home') ui.different = !!document.getElementById('different')?.checked;
    if (!ui.useLocation && ui.mode === 'out') { data.area = ui.area; persist(); }
  }
}
function resultCard(item, mode, group = false) {
  const recipe = mode === 'home';
  const area = group ? ui.groupArea : ui.area;
  const lowEnergy = group ? ui.groupLowEnergy : ui.lowEnergy;
  const badge = recipe ? `${item.time} MIN · ${item.effort.toUpperCase()} EFFORT` : h(item.area || 'NEAR YOU');
  const foodTags = recipe ? [] : [...new Set([({ restaurant: 'Restaurant', cafe: 'Café', food_court: 'Food court', fast_food: 'Quick bite' }[item.category] || ''), ...(item.details?.foodTypes || []), ...(item.cuisine || '').split(/[;,]/)].map(value => value.trim().replaceAll('_', ' ')).filter(Boolean))].slice(0, 4);
  const hours = recipe ? null : openingHoursStatus(item.details?.openingHours, new Date(), item.countryCode === 'MY' ? 'Asia/Kuala_Lumpur' : null);
  const restrictions = group ? tableMembers().flatMap(person => person.restrictions) : data.preferences.restrictions;
  const cautions = [item.unverified && restrictions.length ? 'Dietary suitability is unverified. Check with the shop.' : '', item.budgetUnknown ? 'Price is unverified against your budget.' : ''].filter(Boolean);
  const groupText = group ? `<div class="group-reason"><strong>For your table</strong><p>${h(groupReason(item))}</p></div>` : '';
  const saved = data.places.some(place => place.id === item.id);
  const picked = ui.chosenId === item.id;
  return `<article class="reveal ${ui.busy ? 'shuffling' : ''} ${ui.silentRefresh ? 'silent-refresh' : ''}" aria-live="${ui.silentRefresh ? 'off' : 'polite'}">${recipe ? `<div class="art"><div class="food-art" style="background-position:${artPosition(item.image)}"></div><span class="art-stamp">FROM THE LITTLE KITCHEN</span></div>` : shopArt(item)}
  <div class="reveal-body"><span class="eyebrow">${picked ? '♥ &nbsp; PICKED FOR TODAY' : '✳ &nbsp; ONE TO CONSIDER'}</span><div class="match-line">${badge}</div><h2>${h(item.name)}</h2><p class="tagline">${h(recipe ? item.tag : placeTagline(item))}</p>${recipe ? '' : `<div class="shop-meta">${distanceFact(item.distanceKm) ? `<span>${h(distanceFact(item.distanceKm))}</span>` : ''}<span class="hours-status ${hours.state}">${h(item.detailError ? 'Couldn’t check hours' : hours.label)}</span><span>${priceFact(item.price)}</span></div>`}<div class="why"><span>✦</span><p>${h(why(item, { mode, area, lowEnergy, data, variety: group ? ui.groupVariety : ui.variety }))}</p></div>${recipe ? '' : `<div class="shop-facts"><div class="shop-tags">${foodTags.length ? foodTags.map(tag => `<span>${h(tag)}</span>`).join('') : '<span>Cuisine not listed</span>'}</div>${item.dishes ? `<p><strong>Your dish note:</strong> ${h(item.dishes)}</p>` : item.details?.mappedDishes?.length ? `<p><strong>Mapped dishes:</strong> ${h(item.details.mappedDishes.join(', '))}</p>` : ''}</div>`}${groupText}${cautions.map(line => `<p class="caution">${h(line)}</p>`).join('')}
  <div class="result-actions"><button class="button primary" data-action="${group ? 'group-choose' : 'choose'}" data-group="${group}">${recipe ? 'I’m having this ♥' : group ? 'We’re going here ♥' : 'I’m going here ♥'}</button><button class="button pass" data-action="${group ? 'group-next' : 'next'}">Not today · another idea →</button></div>
  ${recipe ? `<button class="text-link" data-action="recipe" data-id="${item.id}" data-group="${group}">See the recipe ↗</button>` : `<div class="result-links"><button class="text-link" data-action="shop" data-group="${group}">Shop details & dishes ↗</button><a class="text-link" href="${h(mapsUrl(item, area))}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>${saved ? '<span class="saved-label">Saved ✓</span>' : `<button class="text-link" data-action="save-from-reveal" data-group="${group}">Save ☆</button>`}</div><p class="source-note">${item.source === 'OpenStreetMap' ? 'Shop data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.' : 'Your saved place.'} Hours reflect map listings, not live availability. Check before going.</p>`}</div></article>`;
}

function groupReason(item) {
  const words = `${item.name} ${item.cuisine || ''} ${item.dishes || ''}`.toLowerCase();
  const unmet = tableMembers().filter(person => person.preferences && !person.preferences.toLowerCase().split(',').some(word => words.includes(word.trim()))).map(person => person.name);
  if (unmet.length) return `A possible shared option. ${unmet.map(name => name === 'You' ? 'Your' : `${name}’s`).join(' and ')} favourites are not a clear match, so check the menu together.`;
  return tableMembers().some(person => person.preferences) ? 'A promising direction for your table. Check the menu and dietary details together.' : 'No table preferences entered yet. Check the menu and dietary details together.';
}
function noMatch(text, group = false) { if (!text) return ''; const out = (group ? ui.groupMode : ui.mode) === 'out'; return `<div class="no-match" role="status"><strong>No match yet.</strong><p>${h(text)}</p><div class="empty-actions">${group && out ? '<button class="button outline" data-action="review-group">Review table needs</button>' : ''}${out ? `<button class="button outline" data-action="area-help" data-group="${group}">Try another area</button><button class="button subtle" data-action="add-place" data-group="${group}" data-after-save="true">Add a shop you know</button>` : ''}${group && out ? '' : `<button class="button subtle" data-action="${group ? 'group-reset' : 'reset'}">Try again</button>`}</div></div>`; }
function shopNote(group = false) { return (group ? ui.groupMode : ui.mode) === 'out' && ui.shopError && (group ? ui.groupReveal : ui.reveal) ? `<p class="network-note" role="status">Live lookup paused: ${h(ui.shopError)} Showing a saved shop.</p>` : ''; }
function tasteSummary() { const likes = likedTerms().slice(0, 2); const dislikes = data.preferences.dislikes.split(',').map(term => term.trim()).filter(Boolean); const needs = data.preferences.restrictions.length; const parts = [likes.length ? `Likes ${likes.map(h).join(', ')}` : '', dislikes.length ? `Skips ${h(dislikes[0])}${dislikes.length > 1 ? ` +${dislikes.length - 1}` : ''}` : '', needs ? `${needs} dietary need${needs === 1 ? '' : 's'}` : ''].filter(Boolean); return parts.length ? parts.join(' · ') : 'Set your taste'; }
function tasteEditor() {
  const customNeeds = data.preferences.restrictions.filter(need => !presetNeeds.has(need.toLowerCase())).join(', ');
  return `<div class="taste-editor">
    <p>Choose a few things that matter. Your choices save on this device as you go.</p>
    <section class="taste-section"><h3>What sounds good?</h3><p>Tap the kinds of places or food you often enjoy.</p>
      <div class="taste-chips" role="group" aria-label="Food and places you like">${TASTE_OPTIONS.map(([label, term]) => `<button type="button" class="taste-chip ${likesTerm(term) ? 'selected' : ''}" data-action="taste-toggle" data-value="${h(term)}" aria-pressed="${likesTerm(term)}">${likesTerm(term) ? '♥ ' : '+ '}${h(label)}</button>`).join('')}</div>
    </section>
    <section class="taste-section"><h3>What must we avoid?</h3><p>We skip known conflicts. A shop’s ingredients, allergens and halal status can still be unverified.</p>
      <div class="taste-chips" role="group" aria-label="Dietary needs">${NEED_OPTIONS.map(([label, term]) => `<button type="button" class="taste-chip need-chip ${hasNeed(term) ? 'selected' : ''}" data-action="need-toggle" data-value="${h(term)}" aria-pressed="${hasNeed(term)}">${hasNeed(term) ? '✓ ' : '+ '}${h(label)}</button>`).join('')}</div>
    </section>
    <details class="fine-tune"><summary>Anything else? <small>optional</small></summary><div class="fine-fields">
      <label>Other things you like<input id="taste-likes" maxlength="500" placeholder="e.g. ramen, cosy cafés" value="${h(data.preferences.likes)}"></label>
      <label>Foods you dislike<input id="taste-dislikes" maxlength="500" placeholder="e.g. mushrooms, spicy food" value="${h(data.preferences.dislikes)}"></label>
      <label>Other dietary needs<input id="taste-restrictions" maxlength="500" placeholder="e.g. dairy, shellfish" value="${h(customNeeds)}"></label>
    </div></details>
    <p class="hint">Saved automatically. Saved places and recent meals also shape future picks.</p>
  </div>`;
}

function discover() { return `<section class="hero decision-hero"><span class="eyebrow">ONE GOOD PLACE AT A TIME &nbsp; ✳</span><h1>Where should I <em>eat?</em></h1><p>One promising shop. Another if it’s not the one.</p></section><section class="decision-card start-card simple-start">${whereControl()}${ui.mode === 'home' ? lowControl() : ''}<button class="button primary big" data-action="surprise" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Finding your pick…' : `✳ &nbsp; ${h(surpriseLabel())}`}</button><div class="quick-settings">${constraints()}<button class="taste-entry" data-action="taste">♡ &nbsp; ${tasteSummary()}</button></div><div class="decision-paths"><button class="friend-shortcut" data-action="view" data-value="friends">With friends? <strong>Decide together ↗</strong></button>${controls()}</div></section>${noMatch(ui.noMatch)}${shopNote()}${ui.reveal ? resultCard(ui.reveal, ui.mode) + revealDock(ui.reveal, ui.mode) : ui.noMatch ? '' : `<div class="waiting-art ${ui.mode === 'home' ? 'home-art' : ''}" aria-hidden="true"><span>ILLUSTRATION</span></div>`}`; }
function friends() {
  const editing = ui.editingPerson === null ? null : ui.members[ui.editingPerson];
  const savedTaste = !!(data.preferences.likes || data.preferences.dislikes || data.preferences.restrictions.length);
  const people = ui.members.map((person, index) => {
    const summary = [
      person.budget ? `RM ${person.budget} max` : '',
      person.restrictions.length ? `Needs: ${person.restrictions.join(', ')}` : '',
      person.preferences ? `Likes: ${person.preferences}` : '',
      person.dislikes ? `Skips: ${person.dislikes}` : '',
    ].filter(Boolean).join(' · ') || 'No preferences entered';
    return `<div class="person"><div class="person-copy"><strong>${h(person.name)}</strong><span>${h(summary)}</span></div><button class="person-edit" data-action="edit-person" data-index="${index}" aria-label="Edit ${h(person.name)}">Edit</button><button data-action="remove-person" data-index="${index}" aria-label="Remove ${h(person.name)}">×</button></div>`;
  }).join('');
  return `<section class="page-head friends-head"><span class="eyebrow">A SHARED YES</span><h1>With <em>friends?</em></h1><p>Find one place everyone can agree on.</p></section>
    <section class="decision-card start-card simple-start">${whereControl(true)}${ui.groupMode === 'home' ? lowControl(true) : ''}
      <div class="table-setup"><p class="table-count">${ui.members.length ? `You + ${ui.members.length} friend${ui.members.length === 1 ? '' : 's'}` : 'Just you so far'}</p><p class="table-note">${savedTaste ? 'Your saved taste is included.' : 'Your taste is not set yet.'} <button class="text-link" data-action="taste">${savedTaste ? 'Edit yours' : 'Set yours'} ↗</button></p>
        <details class="fine-tune friend-needs" ${editing ? 'open' : ''}><summary>${editing ? `Edit ${h(editing.name)}` : `Add ${ui.members.length ? 'another' : 'a'} friend`} <small>optional</small></summary><div class="fine-fields">
          <form id="person-form">
            <p class="hint">Tap any food needs that matter for them.</p><div class="friend-need-picks" role="group" aria-label="Friend’s dietary needs">${NEED_OPTIONS.map(([label, term]) => `<button type="button" data-action="person-need" data-value="${h(term)}" aria-pressed="${!!editing?.restrictions.includes(term)}">${h(label)}</button>`).join('')}</div>
            <label>Other needs or foods to avoid<input name="restrictions" maxlength="300" placeholder="e.g. dairy, mushrooms" value="${h(editing?.restrictions.join(', ') || '')}"></label>
            <details class="fine-tune" ${editing ? 'open' : ''}><summary>Name, budget & tastes <small>optional</small></summary><div class="fine-fields"><div class="two-fields"><label>Name<input name="name" maxlength="60" placeholder="Friend ${ui.members.length + 1}" value="${h(editing?.name || '')}"></label><label>Budget (RM)<input name="budget" type="number" min="0" max="100000" placeholder="Any" value="${h(editing?.budget || '')}"></label></div><label>Likes<input name="preferences" maxlength="300" placeholder="e.g. noodles, spicy" value="${h(editing?.preferences || '')}"></label><label>Dislikes<input name="dislikes" maxlength="300" placeholder="e.g. mushrooms" value="${h(editing?.dislikes || '')}"></label></div></details>
            <div class="modal-actions"><button class="button outline" type="submit">${editing ? 'Save changes' : '+ Add person'}</button>${editing ? '<button class="button subtle" type="button" data-action="cancel-edit-person">Cancel</button>' : ''}</div>
          </form>
        </div></details>${people ? `<div class="people group-people" aria-label="People in this decision">${people}</div>` : ''}</div>
      <button class="button primary big" data-action="group-surprise" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Finding your pick…' : `✳ &nbsp; ${h(surpriseLabel(true))}`}</button>
      <div class="quick-settings">${constraints(true)}</div><div class="decision-paths">${controls(true)}</div>
    </section>${noMatch(ui.groupNoMatch, true)}${shopNote(true)}${ui.groupReveal ? resultCard(ui.groupReveal, ui.groupMode, true) + revealDock(ui.groupReveal, ui.groupMode, true) : ui.groupNoMatch ? '' : `<div class="waiting-art ${ui.groupMode === 'home' ? 'home-art' : ''}" aria-hidden="true"><span>ILLUSTRATION</span></div>`}`;
}

function placesPanel() {
  const places = data.places.filter(place => `${place.name} ${place.area} ${place.cuisine} ${place.dishes}`.toLowerCase().includes(ui.search.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return `<div class="toolbar"><input id="place-search" type="search" aria-label="Search saved places" placeholder="Search places" value="${h(ui.search)}"><button class="button primary" data-action="add-place">+ Add place</button></div><div class="area-bar"><strong>Pinned areas</strong>${data.areas.map(area => `<button class="chip" data-action="remove-area" data-value="${h(area)}" title="Remove pinned area">${h(area)} ×</button>`).join('')}<button class="chip add" data-action="pin-area">+ Pin area</button></div>${places.length ? `<div class="place-grid">${places.map(place => `<article class="place-card"><div class="place-top"><span>${place.status === 'wishlist' ? 'WANT TO TRY' : 'BEEN THERE'}</span><button data-action="pin-place" data-id="${h(place.id)}" aria-label="${place.pinned ? 'Unpin' : 'Pin'} ${h(place.name)}">${place.pinned ? '★' : '☆'}</button></div><h3>${h(place.name)}</h3><p>${h(place.area || 'Area not set')} · ${h(place.cuisine || 'Cuisine not set')}</p><div>${h(place.dishes || place.notes || 'Add a dish to remember')}</div><footer><span>${money(place.price)}</span><button class="text-link" data-action="edit-place" data-id="${h(place.id)}">Edit ↗</button></footer></article>`).join('')}</div>` : `<div class="empty"><h3>Your places start with you.</h3><p>Add a favourite here, or discover a shop and save one you like.</p></div>`}`;
}
function diaryPanel() { const meals = [...data.diary].sort((a, b) => b.date.localeCompare(a.date)); return `<button class="button primary" data-action="add-log">+ Log a meal</button>${meals.length ? `<div class="diary-list">${meals.map(meal => `<article class="diary-card"><div class="date-tile"><strong>${h(meal.date.slice(8))}</strong><small>${new Date(meal.date + 'T12:00:00').toLocaleDateString('en', { month: 'short' })}</small></div><div><span class="eyebrow">${meal.mode === 'home' ? 'COOKED AT HOME' : 'ATE OUT'}</span><h3>${h(meal.name)}</h3><p>${h(meal.where)}${meal.note ? ` · ${h(meal.note)}` : ''}</p><small>${meal.rating ? '★'.repeat(meal.rating) : 'No rating'}${meal.cost !== '' ? ` · RM ${meal.cost}` : ''}</small></div><button data-action="edit-log" data-id="${h(meal.id)}" aria-label="Edit ${h(meal.name)}">✎</button></article>`).join('')}</div>` : '<div class="empty"><h3>Your food story starts here.</h3><p>When something hits the spot, keep the moment.</p></div>'}`; }
function tastePanel() { return `<div class="taste-panel"><h3>Your food preferences</h3><p>${tasteSummary()}. Change them any time.</p><button class="button outline" data-action="taste">Edit preferences ↗</button></div><div class="backup"><h3>Your data, your device.</h3><p>Places, meals and preferences stay in this browser and do not automatically sync. Keep a JSON backup.</p><div><button class="button outline" data-action="export">Export JSON</button><label class="button outline file-button">Import JSON<input id="import-file" type="file" accept=".json,application/json"></label></div></div>`; }
function mine() { return `<section class="page-head"><span class="eyebrow">YOUR LITTLE FOOD JOURNAL</span><h1>My food<span>.</span></h1><p>Places to remember and meals worth keeping.</p></section><nav class="my-jumps" aria-label="Jump within My food"><a href="#saved-places">Places <span>${data.places.length}</span></a><a href="#meal-diary">Meals <span>${data.diary.length}</span></a><a href="#my-settings">Preferences ↘</a></nav><div class="my-sections"><section class="my-section" id="saved-places"><h2>Saved places</h2><div class="section-content">${placesPanel()}</div></section><section class="my-section" id="meal-diary"><h2>Food diary</h2><div class="section-content">${diaryPanel()}</div></section><section class="my-section" id="my-settings"><h2>Preferences & backup</h2><div class="section-content">${tastePanel()}</div></section></div><p class="data-credit">Mapped shop data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Menus, prices, hours and dietary details should be checked before visiting.</p>`; }

function modal() {
  if (!ui.modal) return '';
  const m = ui.modal; let content = '';
  if (m.type === 'taste') content = `<span class="eyebrow">YOUR TASTE</span><h2>Your food preferences.</h2><div class="taste-scroll">${tasteEditor()}</div><div class="taste-footer"><button class="button primary taste-done" data-action="close">Done</button></div>`;
  if (m.type === 'recipe') { const r = m.item; content = `<span class="eyebrow">FROM THE LITTLE KITCHEN</span><h2>${h(r.name)}</h2><p>${r.time} minutes · Serves ${r.servings} · Approx. RM ${r.cost} per recipe</p><h3>Gather</h3><ul>${r.ingredients.map(x => `<li>${h(x)}</li>`).join('')}</ul><h3>Make it</h3><ol>${r.steps.map(x => `<li>${h(x)}</li>`).join('')}</ol><p class="hint">Listed ingredients to check: ${h(r.contains.join(', ') || 'none listed')}. Check packaged ingredients and substitutions for your needs.</p><button class="button primary" data-action="${m.group ? 'group-choose' : 'choose'}">I’m cooking this</button>`; }
  if (m.type === 'choice') content = `<span class="eyebrow">✳ &nbsp; GOOD PICK</span><h2>${m.mode === 'out' ? `Let’s go to ${h(m.item.name)}.` : `${h(m.item.name)} it is.`}</h2><p>${m.mode === 'out' ? 'Take a look at the route and current shop details before you head over.' : 'Open the recipe when you’re ready to cook.'}</p><div class="choice-actions">${m.mode === 'out' ? `<a class="button primary" href="${h(directionsUrl(m.item, m.group ? ui.groupArea : ui.area))}" target="_blank" rel="noopener noreferrer">Open directions ↗</a><button class="button outline" data-action="choice-shop">Shop details & dishes</button>` : `<button class="button primary" data-action="recipe" data-id="${h(m.item.id)}" data-group="${m.group}">Open recipe ↗</button>`}<button class="text-link" data-action="log-choice">Log this meal after eating</button></div>`;
  if (m.type === 'shop') {
    const shop = m.item;
    const foodTypes = [...new Set([...(shop.cuisine || '').split(/[;,]/), ...(m.details?.foodTypes || [])].map(value => value.trim().replaceAll('_', ' ')).filter(Boolean))];
    const saved = data.places.some(place => place.id === shop.id);
    const restrictions = m.group ? tableMembers().flatMap(person => person.restrictions) : data.preferences.restrictions;
    const conflict = placeSuitability({ ...shop, cuisine: foodTypes.join('; ') }, restrictions).conflict;
    const hours = openingHoursStatus(m.details?.openingHours, new Date(), shop.countryCode === 'MY' ? 'Asia/Kuala_Lumpur' : null);
    content = `<span class="eyebrow">THE SHOP</span><h2>${h(shop.name)}</h2><p>${h([...new Set([shop.area, shop.address].filter(Boolean))].join(' · ') || 'Near you')} · ${priceFact(shop.price)}</p><p class="shop-hours"><strong>${h(hours.label)}</strong>${m.details?.openingHours ? ` · Mapped hours: ${h(m.details.openingHours)}` : ''}</p><h3>What might be on the menu?</h3>${shop.dishes ? `<p><strong>Your dish note:</strong> ${h(shop.dishes)}</p>` : m.details?.mappedDishes?.length ? `<p><strong>Mapped dishes:</strong> ${h(m.details.mappedDishes.join(', '))}</p>` : '<p class="hint">Bestsellers are not available from map data. Add a dish you know if you like.</p>'}${foodTypes.length ? `<div class="food-types">${foodTypes.map(type => `<button type="button" data-action="taste-tag" data-value="${h(type)}" aria-pressed="${likesTerm(type)}" aria-label="${likesTerm(type) ? 'Remove' : 'Save'} ${h(type)} as a favourite"><span>${h(type)}</span> ${likesTerm(type) ? '♥' : '+'}</button>`).join('')}</div><p class="hint">Mapped food types, not a verified menu. Tap one you like to remember it; ask the shop about ingredients and availability.</p>` : m.loading ? '<p role="status">Looking up mapped food types…</p>' : `<p class="hint">${m.error ? h(m.error) : 'No food types are listed for this shop yet.'} Check its current menu in Google Maps.</p>`}<p class="source-note">${shop.source === 'OpenStreetMap' ? 'Shop data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.' : 'Your saved place.'} Hours, price and dietary suitability should be checked before visiting.</p>${conflict ? '<p class="caution">A mapped food type conflicts with a stated dietary need. Choose another shop.</p>' : ''}<div class="shop-actions"><a class="button outline" href="${h(mapsUrl(shop, m.group ? ui.groupArea : ui.area))}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>${m.details?.menuUrl ? `<a class="text-link" href="${h(m.details.menuUrl)}" target="_blank" rel="noopener noreferrer">Shop website ↗</a>` : ''}${saved ? '<span class="saved-label">Saved ✓</span>' : `<button class="button subtle" data-action="save-from-reveal" data-group="${m.group}">Save this shop ☆</button>`}<button class="text-link" data-action="note-shop">Add dish or price</button>${conflict ? '' : `<button class="button primary" data-action="${m.group ? 'group-choose' : 'choose'}">I’m having this ♥</button>`}</div>`;
  }
  if (m.type === 'place') { const p = m.item || m.prefill || { name: '', area: ui.area, cuisine: '', dishes: '', price: '', notes: '', status: 'visited', pinned: false }; content = `<h2>${m.item ? 'Edit place' : 'Add a place'}</h2><form id="place-form"><label>Place name<input name="name" required maxlength="160" placeholder="The spot you keep thinking about" value="${h(p.name)}"></label><details class="fine-tune" ${m.item || m.prefill ? 'open' : ''}><summary>Area, dish & price <small>optional</small></summary><div class="fine-fields"><div class="two-fields"><label>Area<input name="area" maxlength="120" value="${h(p.area)}"></label><label>Approx. price per person (RM)<input name="price" type="number" min="0" max="100000" value="${h(p.price)}"></label></div><div class="two-fields"><label>Cuisine<input name="cuisine" maxlength="200" value="${h(p.cuisine)}"></label><label>Dish to remember<input name="dishes" maxlength="400" value="${h(p.dishes)}"></label></div><label>Notes<textarea name="notes" maxlength="1000" rows="3">${h(p.notes)}</textarea></label><div class="two-fields"><label>Status<select name="status"><option value="visited" ${p.status === 'visited' ? 'selected' : ''}>Been there</option><option value="wishlist" ${p.status === 'wishlist' ? 'selected' : ''}>Want to try</option></select></label><label class="check"><input name="pinned" type="checkbox" ${p.pinned ? 'checked' : ''}> Pin place</label></div></div></details><div class="modal-actions"><button class="button primary" type="submit">Save place</button>${m.item ? '<button class="button subtle" type="button" data-action="delete-place">Remove place</button>' : ''}</div></form>`; }
  if (m.type === 'log') { const meal = m.item || { name: '', date: today(), mode: 'out', where: '', cost: '', rating: null, note: '', placeId: '', recipeId: '' }; content = `<h2>${m.existing ? 'Edit meal' : 'Log a meal'}</h2><form id="log-form"><label>What did you eat?<input name="name" required maxlength="160" value="${h(meal.name)}"></label><div class="two-fields"><label>When<input name="date" type="date" required value="${h(meal.date)}"></label><label>Where<select name="mode"><option value="out" ${meal.mode === 'out' ? 'selected' : ''}>Ate out</option><option value="home" ${meal.mode === 'home' ? 'selected' : ''}>Cooked at home</option></select></label></div><details class="fine-tune" ${m.existing ? 'open' : ''}><summary>Cost, rating & note <small>optional</small></summary><div class="fine-fields"><label>Place or occasion<input name="where" maxlength="160" value="${h(meal.where)}"></label><div class="two-fields"><label>Cost (RM)<input name="cost" type="number" min="0" max="100000" value="${h(meal.cost)}"></label><label>Rating<select name="rating"><option value="">No rating</option>${[1,2,3,4,5].map(n => `<option value="${n}" ${meal.rating === n ? 'selected' : ''}>${n} star${n > 1 ? 's' : ''}</option>`).join('')}</select></label></div><label>Note<textarea name="note" maxlength="1000" rows="3">${h(meal.note)}</textarea></label></div></details><div class="modal-actions"><button class="button primary" type="submit">Save meal</button>${m.existing ? '<button class="button subtle" type="button" data-action="delete-log">Remove meal</button>' : ''}</div></form>`; }
  return `<div class="modal-backdrop" data-action="close"><div class="modal ${m.type === 'taste' ? 'taste-modal' : ''}" role="dialog" aria-modal="true" aria-label="${h(m.type)}" data-action="modal-body"><button class="modal-close" data-action="close" aria-label="Close">×</button>${content}</div></div>`;
}
function focusIdentity(element) {
  if (!element || element === document.body) return null;
  if (element.dataset?.action) return Object.fromEntries(['action', 'value', 'id', 'group', 'index'].map(key => [key, element.dataset[key] || '']));
  return element.id ? { elementId: element.id } : null;
}
function focusMatching(key) {
  if (!key) return;
  const elements = key.elementId ? [document.getElementById(key.elementId)] : [...app.querySelectorAll('[data-action]')].filter(element => ['action', 'value', 'id', 'group', 'index'].every(field => (element.dataset[field] || '') === key[field]));
  elements.find(element => element?.getClientRects().length)?.focus({ preventScroll: true });
}
function render() {
  const before = focusIdentity(document.activeElement);
  const tasteScroll = document.querySelector('.taste-scroll')?.scrollTop;
  const startLayout = ui.view === 'discover' && !ui.reveal && !ui.noMatch || ui.view === 'friends' && !ui.groupReveal && !ui.groupNoMatch;
  const hasReveal = ui.view === 'discover' && ui.reveal || ui.view === 'friends' && ui.groupReveal;
  app.innerHTML = `${mast()}<main class="layout ${startLayout ? 'start-layout' : ''} ${hasReveal ? 'has-reveal' : ''}">${ui.view === 'discover' ? discover() : ui.view === 'friends' ? friends() : mine()}</main>${nav()}${modal()}${ui.toast ? `<div class="toast" role="status">${h(ui.toast)}</div>` : ''}`;
  if (tasteScroll !== undefined && document.querySelector('.taste-scroll')) document.querySelector('.taste-scroll').scrollTop = tasteScroll;
  if (ui.modal) (ui.modal.type === 'choice' ? document.querySelector('.choice-actions .primary') : ui.modal.type === 'taste' ? document.querySelector('.modal-close') : document.querySelector('.modal input:not([type=checkbox])') || document.querySelector('.modal-close'))?.focus({ preventScroll: true });
  else focusMatching(before);
}
app.addEventListener('error', event => { if (event.target.matches?.('.shop-photo')) event.target.classList.add('failed'); }, true);

async function suggest(group = false) {
  if (ui.busy) return;
  const budgetInput = document.getElementById(group ? 'group-budget' : 'budget');
  if (budgetInput && !budgetInput.reportValidity()) return;
  capture(group);
  const mode = group ? ui.groupMode : ui.mode;
  const area = group ? ui.groupArea : ui.area;
  if (mode === 'out' && !area) { if (group) ui.groupUseLocation = true; else ui.useLocation = true; }
  const excluded = group ? ui.groupExcluded : ui.excluded;
  ui.busy = true; render();
  if (mode === 'out') {
    try { ui.livePlaces = await searchShops({ area }); ui.shopError = ''; }
    catch (error) { ui.livePlaces = []; ui.shopError = error.message || 'Nearby shops could not be loaded.'; }
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 250));
  const list = candidates({ mode, data, livePlaces: ui.livePlaces, area, budget: group ? ui.groupBudget : ui.budget, time: group ? ui.groupTime : ui.time, lowEnergy: group ? ui.groupLowEnergy : ui.lowEnergy, different: group ? false : ui.different, variety: group ? ui.groupVariety : ui.variety, group: group ? tableMembers() : [], excluded });
  const restrictions = group ? tableMembers().flatMap(person => person.restrictions) : data.preferences.restrictions;
  const dislikes = group ? tableMembers().map(person => person.dislikes).filter(Boolean).join(',') : data.preferences.dislikes;
  const checkBeforeReveal = restrictions.length || dislikes.trim();
  let item = null, checked = 0;
  for (const candidate of list) {
    const match = { ...candidate };
    if (mode === 'out' && shopDetailUrl(match) && checkBeforeReveal && checked < 5) {
      checked++;
      try {
        match.details = await shopDetails(match);
        if (!match.cuisine) match.cuisine = match.details.foodTypes.join('; ');
        if (placeSuitability(match, restrictions).conflict) continue;
        if (dislikes.toLowerCase().split(/[,;\n]+/).map(term => term.trim()).filter(Boolean).some(term => `${match.name} ${match.cuisine} ${match.dishes} ${match.details.mappedDishes.join(' ')}`.toLowerCase().includes(term))) continue;
      } catch { match.detailError = true; }
    }
    item = match; break;
  }
  ui.busy = false;
  const tableNeeds = group && (ui.groupBudget || tableMembers().some(person => person.budget || person.dislikes || person.restrictions.length));
  const nearbyKnown = [...data.places, ...ui.livePlaces].some(place => !area || place.area && (place.area.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(place.area.toLowerCase())));
  const message = excluded.length ? 'You have seen the available matches. Start a fresh round or adjust a constraint.' : mode === 'out' ? tableNeeds && nearbyKnown ? 'The shops found here do not fit all the table’s stated needs or budget. Review those needs or try another area.' : ui.shopError || 'No mapped shops fit here right now. Try another area or add a place you know.' : 'No recipe fits right now. Try more time or adjust a dietary need.';
  if (item && mode === 'out') { if (group) ui.groupAreaPickerOpen = false; else ui.areaPickerOpen = false; }
  if (group) { ui.groupReveal = item; ui.groupNoMatch = item ? '' : message; }
  else { ui.reveal = item; ui.noMatch = item ? '' : message; }
  if (item && mode === 'out') { data.recentShops = [item.id, ...data.recentShops.filter(id => id !== item.id)].slice(0, 8); persist(); }
  render();
  document.querySelector(item ? '.reveal' : '.no-match')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: item && innerWidth < 850 ? 'start' : 'center' });
  if (item && mode === 'out' && shopDetailUrl(item) && !item.details && !item.detailError) enrichShop(item, group);
  else if (item?.details?.photoFile) enrichPhoto(item, group, item.details.photoFile);
}
async function enrichShop(item, group) {
  let details = null, detailError = false;
  try { details = await shopDetails(item); } catch { detailError = true; }
  const current = group ? ui.groupReveal : ui.reveal;
  if (!current || current.id !== item.id) return;
  const updated = { ...current, details, detailError, cuisine: current.cuisine || details?.foodTypes.join('; ') || '' };
  if (group) ui.groupReveal = updated; else ui.reveal = updated;
  ui.silentRefresh = true; render(); ui.silentRefresh = false;
  if (details?.photoFile) enrichPhoto(item, group, details.photoFile);
}
async function enrichPhoto(item, group, file) {
  const photo = await commonsPhoto(file);
  if (!photo) return;
  const current = group ? ui.groupReveal : ui.reveal;
  if (!current || current.id !== item.id || !current.details) return;
  const updated = { ...current, details: { ...current.details, photo } };
  if (group) ui.groupReveal = updated; else ui.reveal = updated;
  ui.silentRefresh = true; render(); ui.silentRefresh = false;
}
function choose(group = false) {
  const item = group ? ui.groupReveal : ui.reveal;
  if (!item) return;
  const mode = group ? ui.groupMode : ui.mode;
  ui.chosenId = item.id;
  ui.modal = { type: 'choice', item, mode, group };
  render();
}
function logChoice() {
  const { item, mode } = ui.modal;
  ui.modal = { type: 'log', item: { id: uid(), name: item.name, date: today(), mode, where: mode === 'out' ? item.name : 'Home', cost: mode === 'out' ? item.price : item.cost, rating: null, note: '', placeId: mode === 'out' ? item.id : '', recipeId: mode === 'home' ? item.id : '' }, existing: false };
  render();
}
function saveFromReveal(group = false) {
  const item = group ? ui.groupReveal : ui.reveal;
  if (!item || data.places.some(place => place.id === item.id)) return;
  const mappedCuisine = ui.modal?.type === 'shop' && ui.modal.item.id === item.id ? ui.modal.details?.foodTypes.join('; ').slice(0, 200) || '' : '';
  data.places.unshift({ id: item.id, name: item.name, area: item.area || '', cuisine: mappedCuisine || item.cuisine || '', dishes: item.dishes || '', price: item.price ?? '', notes: '', status: 'wishlist', pinned: false, source: item.source || 'personal', lat: item.lat ?? null, lon: item.lon ?? null, diet: [], category: item.category || '', countryCode: item.countryCode || '' });
  persist(); flash('Shop saved ☆');
}
function toggleLike(term) {
  const clean = term.toLowerCase().trim().slice(0, 80);
  if (!clean) return;
  const values = likedTerms();
  const next = values.includes(clean) ? values.filter(value => value !== clean) : [...values, clean];
  if (next.join(', ').length > 500) return flash('Your likes are full. Remove one first.');
  data.preferences.likes = next.join(', ');
  const tasteDetailsOpen = document.querySelector('.modal .taste-editor details')?.open;
  persist(); render();
  if (tasteDetailsOpen) document.querySelector('.modal .taste-editor details').open = true;
  [...document.querySelectorAll('[data-action="taste-toggle"], [data-action="taste-tag"]')].find(button => button.dataset.value === term)?.focus();
}
function toggleNeed(term) {
  if (!presetNeeds.has(term)) return;
  data.preferences.restrictions = hasNeed(term) ? data.preferences.restrictions.filter(need => need.toLowerCase() !== term) : [...data.preferences.restrictions, term];
  ui.reveal = null; ui.groupReveal = null;
  persist(); render();
  [...document.querySelectorAll('[data-action="need-toggle"]')].find(button => button.dataset.value === term)?.focus({ preventScroll: true });
}
async function openShop(group = false) {
  const item = group ? ui.groupReveal : ui.reveal;
  if (!item) return;
  const modal = { type: 'shop', item, group, loading: !!shopDetailUrl(item) && !item.details, details: item.details || null, error: '' };
  ui.modal = modal; render();
  if (!modal.loading) return;
  try { modal.details = await shopDetails(item); }
  catch (error) { modal.error = error.message || 'Mapped food types are unavailable.'; }
  modal.loading = false;
  if (ui.modal === modal) render();
}

app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action, id = target.dataset.id;
  if (['taste', 'shop', 'recipe', 'add-place', 'edit-place', 'add-log', 'edit-log', 'choose', 'group-choose'].includes(action)) ui.lastOpener = focusIdentity(target);
  if (action === 'view') { ui.view = target.dataset.value; ui.modal = null; render(); scrollTo(0, 0); }
  if (action === 'mode') { capture(target.dataset.group === 'true'); if (target.dataset.group === 'true') { ui.groupMode = target.dataset.value; ui.groupReveal = null; ui.groupExcluded = []; } else { ui.mode = target.dataset.value; ui.reveal = null; ui.excluded = []; } render(); }
  if (action === 'budget-preset') { const group = target.dataset.group === 'true'; const value = target.dataset.value; if (group) ui.groupBudget = value; else ui.budget = value; const input = document.getElementById(group ? 'group-budget' : 'budget'); if (input) input.value = value; target.closest('.budget-chips')?.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === target))); target.closest('.choice-field')?.querySelector('.custom-budget')?.removeAttribute('open'); updateConstraintSummary(group); }
  if (action === 'variety-pick') { const group = target.dataset.group === 'true'; if (group) ui.groupVariety = target.dataset.value; else ui.variety = target.dataset.value; target.closest('.variety-grid')?.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === target))); updateConstraintSummary(group); }
  if (action === 'surprise') { ui.excluded = []; if (ui.mode === 'out' && !ui.area) ui.useLocation = true; suggest(); }
  if (action === 'next') { if (ui.reveal) ui.excluded.push(ui.reveal.id); suggest(); }
  if (action === 'group-surprise') { ui.groupExcluded = []; if (ui.groupMode === 'out' && !ui.groupArea) ui.groupUseLocation = true; suggest(true); }
  if (action === 'group-next') { if (ui.groupReveal) ui.groupExcluded.push(ui.groupReveal.id); suggest(true); }
  if (action === 'reset') { ui.excluded = []; suggest(); }
  if (action === 'group-reset') { ui.groupExcluded = []; suggest(true); }
  if (action === 'shop') openShop(target.dataset.group === 'true');
  if (action === 'note-shop') { const item = ui.modal.item; const saved = data.places.find(place => place.id === item.id); ui.modal = saved ? { type: 'place', item: saved } : { type: 'place', prefill: { ...item, cuisine: item.cuisine || ui.modal.details?.foodTypes.join('; ') || '', status: 'wishlist', pinned: false } }; render(); document.querySelector('.modal input[name="dishes"]')?.focus(); }
  if (action === 'edit-area' || action === 'area-help') { const group = target.dataset.group === 'true'; capture(group); const key = group ? 'groupAreaPickerOpen' : 'areaPickerOpen'; ui[key] = action === 'area-help' ? true : !ui[key]; render(); if (ui[key]) { const input = document.getElementById(group ? 'group-area' : 'area'); input?.focus({ preventScroll: true }); input?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); } }
  if (action === 'review-group') { const details = document.querySelector('.friend-needs'); if (details) { details.open = true; details.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); details.querySelector('summary')?.focus(); } }
  if (action === 'near-me') { const group = target.dataset.group === 'true'; capture(group); if (group) { ui.groupArea = ''; ui.groupUseLocation = true; ui.groupAreaPickerOpen = false; ui.groupExcluded = []; } else { ui.area = ''; ui.useLocation = true; ui.areaPickerOpen = false; ui.excluded = []; } render(); suggest(group); }
  if (action === 'area-pick') { const group = target.dataset.group === 'true'; capture(group); if (group) { ui.groupArea = target.dataset.value; ui.groupUseLocation = false; ui.groupAreaPickerOpen = false; ui.groupExcluded = []; } else { ui.area = target.dataset.value; ui.useLocation = false; ui.areaPickerOpen = false; ui.excluded = []; } render(); suggest(group); }
  if (action === 'taste') { ui.modal = { type: 'taste' }; render(); }
  if (action === 'taste-toggle' || action === 'taste-tag') toggleLike(target.dataset.value);
  if (action === 'need-toggle') toggleNeed(target.dataset.value);
  if (action === 'person-need') { const input = document.querySelector('#person-form input[name="restrictions"]'); if (input) { const values = input.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean); const term = target.dataset.value; input.value = (values.includes(term) ? values.filter(value => value !== term) : [...values, term]).join(', '); input.dispatchEvent(new Event('input', { bubbles: true })); target.focus({ preventScroll: true }); } }
  if (action === 'choose') choose();
  if (action === 'group-choose') choose(true);
  if (action === 'log-choice') logChoice();
  if (action === 'choice-shop') openShop(ui.modal.group);
  if (action === 'recipe') { ui.modal = { type: 'recipe', item: findRecipe(id), group: target.dataset.group === 'true' }; render(); }
  if (action === 'save-from-reveal') saveFromReveal(target.dataset.group === 'true');
  if (action === 'add-place') { const group = target.dataset.group === 'true', afterSave = target.dataset.afterSave === 'true'; ui.modal = afterSave ? { type: 'place', prefill: { name: '', area: group ? ui.groupArea : ui.area, cuisine: '', dishes: '', price: '', notes: '', status: 'wishlist', pinned: false }, afterSave, group } : { type: 'place' }; render(); }
  if (action === 'edit-place') { ui.modal = { type: 'place', item: data.places.find(place => place.id === id) }; render(); }
  if (action === 'pin-place') { const place = data.places.find(place => place.id === id); if (place) { place.pinned = !place.pinned; persist(); render(); } }
  if (action === 'pin-area') { const area = prompt('Area to pin:')?.trim(); if (area && area.length <= 120 && !data.areas.includes(area)) { data.areas.push(area); persist(); render(); } }
  if (action === 'remove-area' && confirm(`Remove ${target.dataset.value} from pinned areas?`)) { data.areas = data.areas.filter(area => area !== target.dataset.value); persist(); render(); }
  if (action === 'delete-place' && confirm('Remove this place? Diary entries will stay.')) { data.places = data.places.filter(place => place.id !== ui.modal.item.id); ui.modal = null; persist(); flash('Place removed.'); }
  if (action === 'add-log') { ui.modal = { type: 'log' }; render(); }
  if (action === 'edit-log') { ui.modal = { type: 'log', item: data.diary.find(meal => meal.id === id), existing: true }; render(); }
  if (action === 'delete-log' && confirm('Remove this meal from your diary?')) { data.diary = data.diary.filter(meal => meal.id !== ui.modal.item.id); ui.modal = null; persist(); flash('Meal removed.'); }
  if (action === 'edit-person') { ui.editingPerson = Number(target.dataset.index); render(); document.querySelector('#person-form input[name="name"]')?.focus(); }
  if (action === 'cancel-edit-person') { ui.editingPerson = null; render(); document.querySelector('.friend-needs summary')?.focus({ preventScroll: true }); }
  if (action === 'remove-person') { const index = Number(target.dataset.index); ui.members.splice(index, 1); if (ui.editingPerson === index) ui.editingPerson = null; else if (ui.editingPerson !== null && ui.editingPerson > index) ui.editingPerson--; ui.groupReveal = null; render(); }
  if (action === 'export') { downloadBackup(data); flash('Backup downloaded.'); }
  if (action === 'close') { ui.modal = null; render(); focusMatching(ui.lastOpener); }
});
app.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target, fields = new FormData(form);
  if (form.id === 'person-form') { const index = ui.editingPerson === null ? ui.members.length : ui.editingPerson; const person = { name: String(fields.get('name')).trim() || `Friend ${index + 1}`, budget: fields.get('budget') ? Number(fields.get('budget')) : 0, preferences: String(fields.get('preferences')).trim(), dislikes: String(fields.get('dislikes')).trim(), restrictions: String(fields.get('restrictions')).split(',').map(x => x.trim().toLowerCase()).filter(Boolean) }; if (ui.editingPerson === null) ui.members.push(person); else ui.members[ui.editingPerson] = person; ui.editingPerson = null; ui.groupReveal = null; render(); document.querySelector(`.person-edit[data-index="${index}"]`)?.focus({ preventScroll: true }); }
  if (form.id === 'place-form') { const old = ui.modal.item; const base = old || ui.modal.prefill; const afterSave = ui.modal.afterSave, group = ui.modal.group; const place = { id: base?.id || uid(), name: String(fields.get('name')).trim(), area: String(fields.get('area')).trim(), cuisine: String(fields.get('cuisine')).trim(), dishes: String(fields.get('dishes')).trim(), price: fields.get('price') === '' ? '' : Number(fields.get('price')), notes: String(fields.get('notes')).trim(), status: String(fields.get('status') || 'visited'), pinned: fields.has('pinned'), source: base?.source || 'personal', lat: base?.lat ?? null, lon: base?.lon ?? null, diet: base?.diet || [], category: base?.category || '', countryCode: base?.countryCode || '' }; if (!place.name) return flash('Give the place a name.'); data.places = old ? data.places.map(item => item.id === old.id ? place : item) : [place, ...data.places]; if (ui.reveal?.id === place.id) ui.reveal = { ...ui.reveal, ...place }; if (ui.groupReveal?.id === place.id) ui.groupReveal = { ...ui.groupReveal, ...place }; ui.modal = null; persist(); flash('Place saved.'); if (afterSave) { if (group) ui.groupExcluded = []; else ui.excluded = []; suggest(group); } }
  if (form.id === 'log-form') { const old = ui.modal.item; const meal = { id: old?.id || uid(), name: String(fields.get('name')).trim(), date: String(fields.get('date')), mode: String(fields.get('mode')), where: String(fields.get('where')).trim(), cost: fields.get('cost') === '' ? '' : Number(fields.get('cost')), rating: fields.get('rating') ? Number(fields.get('rating')) : null, note: String(fields.get('note')).trim(), placeId: old?.placeId || '', recipeId: old?.recipeId || '' }; if (!meal.name || !meal.date) return flash('Add a meal name and date.'); data.diary = ui.modal.existing ? data.diary.map(item => item.id === old.id ? meal : item) : [meal, ...data.diary]; ui.modal = null; ui.view = 'mine'; persist(); flash('A good meal, remembered ♥'); document.getElementById('meal-diary')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
});
app.addEventListener('input', event => {
  if (event.target.matches?.('#person-form input[name="restrictions"]')) { const values = event.target.value.toLowerCase().split(',').map(value => value.trim()); document.querySelectorAll('[data-action="person-need"]').forEach(button => button.setAttribute('aria-pressed', String(values.includes(button.dataset.value)))); }
  if (event.target.id === 'budget' || event.target.id === 'group-budget') { const group = event.target.id === 'group-budget'; if (group) ui.groupBudget = event.target.value; else ui.budget = event.target.value; document.querySelectorAll('.budget-chip').forEach(button => button.setAttribute('aria-pressed', 'false')); updateConstraintSummary(group); }
  if (event.target.id === 'taste-likes') { data.preferences.likes = event.target.value; persist(); }
  if (event.target.id === 'taste-dislikes') { data.preferences.dislikes = event.target.value; ui.reveal = null; ui.groupReveal = null; persist(); }
  if (event.target.id === 'taste-restrictions') { data.preferences.restrictions = [...new Set([...data.preferences.restrictions.filter(need => presetNeeds.has(need.toLowerCase())).map(need => need.toLowerCase()), ...event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)])]; ui.reveal = null; ui.groupReveal = null; persist(); }
  if (event.target.id === 'place-search') { ui.search = event.target.value; const position = event.target.selectionStart; render(); const input = document.getElementById('place-search'); input.focus(); input.setSelectionRange(position, position); }
  if (event.target.id === 'area' || event.target.id === 'group-area') {
    const group = event.target.id === 'group-area';
    if (group) { ui.groupArea = event.target.value; ui.groupUseLocation = false; }
    else { ui.area = event.target.value; ui.useLocation = false; }
    const compact = document.querySelector('.where-compact strong'); if (compact) compact.textContent = event.target.value || 'Near me';
    const button = document.querySelector(group ? '[data-action="group-surprise"]' : '[data-action="surprise"]'); if (button) button.textContent = `✳  ${surpriseLabel(group)}`;
    document.querySelector('.where-error').textContent = '';
    const nearButton = document.querySelector('.near-button'); if (nearButton) { nearButton.classList.remove('selected'); nearButton.setAttribute('aria-pressed', 'false'); }
  }
});
app.addEventListener('change', async event => { if (event.target.id !== 'import-file') return; const file = event.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) return flash('Backup is too large (2 MB limit).'); try { const imported = validateBackup(JSON.parse(await file.text())); if (!confirm('Replace all saved places, meals and preferences with this backup?')) return; data = imported; ui.area = data.area; ui.groupArea = data.area; ui.useLocation = false; ui.groupUseLocation = false; ui.reveal = null; ui.groupReveal = null; persist(); flash('Backup imported. Welcome back ✳'); } catch (error) { flash(`Import failed: ${error.message}`); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !ui.modal && ['area', 'budget', 'group-area', 'group-budget'].includes(event.target.id)) {
    event.preventDefault();
    if (ui.busy) return;
    const group = event.target.id.startsWith('group-');
    if (group) ui.groupExcluded = []; else ui.excluded = [];
    suggest(group);
    return;
  }
  if (!ui.modal) return;
  if (event.key === 'Escape') { ui.modal = null; render(); focusMatching(ui.lastOpener); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...document.querySelectorAll('.modal button, .modal input, .modal select, .modal textarea, .modal summary')].filter(element => element.getClientRects().length && !element.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
