# Eat What?

A mobile-first decision app for the moment nobody knows where to eat. Tap **Surprise me nearby** to allow location and reveal one real mapped shop. Or tap **Change** beside the area to type a town or choose a pinned area. The app requests location only after the nearby button is tapped. **Another** skips the current shop without a swipe, and recent reveals are remembered so later visits start with a fresher choice. Mapped shop cards show approximate straight-line distance from the location or selected area's map point. The optional **Budget & variety** chooser offers one-tap RM limits and four moods: anything goes, a sure thing, somewhere new, or a plot twist away from recent meals. A budget filters only prices you entered; mapped shops with unknown prices stay available and are labelled unverified. On phones, the choose and another-idea actions stay within reach while you read the card. Choose a shop to see a confirmation with keyless Google Maps directions and optional diary logging; its listed cuisine, dishes, hours, and your own notes fill in as they arrive. **Preferences** is in the header on every screen: tap quick likes and dietary needs, with optional text for dislikes and other needs. Choices save immediately. Known dietary conflicts are skipped; halal status, allergens and unknown suitability remain unverified. Saved places, pinned areas, and rated meals also guide later suggestions. **Friends** starts with you and offers quick dietary chips when adding someone; names and detailed tastes are optional. **Cook at home** offers eight illustrated recipes offline. No onboarding or account is needed.

The three main destinations are **Decide**, **Friends**, and **My food**. Friends can decide immediately with your saved preferences or add each person's needs. My food shows saved places, the meal diary, and preferences on one page, with jump links at the top. The app has no backend, paid API, API key, or hardcoded restaurant list. Live shop discovery uses the keyless [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md), based on OpenStreetMap data. Opening a mapped shop fetches its [OpenStreetMap element](https://wiki.openstreetmap.org/wiki/Api06) to show listed cuisine, dishes and hours. If that exact shop's map record links to a Wikimedia Commons image, the reveal shows its photo with photographer and license credit. Shops without a linked and credited photo get one of four original shop illustrations labelled as such. Map tags are clues, **not a verified menu**. Google Maps opens only when the user taps its link. The Google API key previously shared is unused and is not in the project.

## Run locally

Requires Node.js 22 or newer. No package installation is needed.

```bash
npm run dev
```

Open <http://localhost:5173>. To preview the production build at a GitHub Pages repository path:

```bash
npm test
BASE_PATH=/eat-what/ npm run build
PORT=5174 node scripts/serve.js --dist
```

Open <http://localhost:5174/eat-what/>. The built site is in `dist/`.

## Deploy

The public [`jojopanmee/eat-what`](https://github.com/jojopanmee/eat-what) repository publishes from `main` through `.github/workflows/pages.yml`. Each push checks for a Google API key pattern, runs the tests, builds with `BASE_PATH=/eat-what/`, and publishes `dist/` to <https://jojopanmee.github.io/eat-what/>. GitHub Pages is set to use **GitHub Actions** as its source. For Netlify or another root-level static host, run `npm run build` and publish `dist/`.

## Data and limits

Places, pinned areas, meal diary, preferences, recent reveals, and validated version 3 JSON backups stay in browser local storage. They do not automatically sync; use **My food → Preferences & backup** to export/import. Older version 3 backups remain importable. Import validates the file and asks before replacing local data. Group members last for the current page session. Saved shops and recipes work offline after a first online visit. New shop discovery, mapped food types, linked shop photos, external maps, and the optional web fonts require internet. A shop photo request goes to Wikimedia Commons when its map record includes a Commons image link.

Photon is a community service with rate limits and no service guarantee. The app queries it only on a user's request and caches search results for 15 minutes in the current page session. If it is unavailable, saved places can still be suggested. Commons links are uncommon in map records, so many shops will still show illustrated cards. The app never guesses a shop photo from its name or shows an unrelated stock photo as if it were the venue. Listed hours are interpreted only for simple weekly schedules and labelled as map listings; holidays, temporary closures and changes may not be reflected. Prices and personal dish notes come from the user's saved data, not a verified listing. Bestseller rankings are not available from OpenStreetMap. A known dietary conflict is excluded; unknown shop suitability is labelled unverified. Check current menus, prices, hours, ingredients and allergens with the shop before visiting.
