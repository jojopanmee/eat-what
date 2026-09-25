// Only use photos explicitly linked by this shop's OpenStreetMap record.
const COMMONS = 'https://commons.wikimedia.org';
const PHOTO_EXT = /\.(?:jpe?g|png|webp)$/i;

export function commonsFile(tags = {}) {
  for (const tag of [tags.wikimedia_commons, tags.image]) {
    if (typeof tag !== 'string' || tag.length > 500) continue;
    let value = tag.trim();
    if (value.startsWith('https://')) {
      let url;
      try { url = new URL(value); } catch { continue; }
      try {
        if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/File:')) value = decodeURIComponent(url.pathname.slice(6));
        else if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:FilePath/')) value = `File:${decodeURIComponent(url.pathname.slice(23))}`;
        else if (url.hostname === 'upload.wikimedia.org' && url.pathname.startsWith('/wikipedia/commons/')) value = `File:${decodeURIComponent(url.pathname.split('/').at(-1))}`;
        else continue;
      } catch { continue; }
    }
    if (!value.startsWith('File:')) continue;
    const file = value.slice(5).replaceAll('_', ' ').trim();
    if (file && file.length <= 240 && PHOTO_EXT.test(file) && !/[\x00-\x1f<>|{}]/.test(file)) return file;
  }
  return '';
}

const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|lt|gt|nbsp|#39);/g, match => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }[match])).replace(/\s+/g, ' ').trim();

export async function commonsPhoto(file, fetcher = fetch) {
  if (!file || !PHOTO_EXT.test(file)) return null;
  const endpoint = new URL('/w/api.php', COMMONS);
  for (const [key, value] of Object.entries({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960', titles: `File:${file}`, format: 'json', origin: '*' })) endpoint.searchParams.set(key, value);
  try {
    const response = await fetcher(endpoint.toString(), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const page = Object.values((await response.json()).query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    const url = new URL(info?.thumburl || '');
    if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org') return null;
    const meta = info.extmetadata || {};
    const author = plain(meta.Artist?.value).slice(0, 160);
    const license = plain(meta.LicenseShortName?.value).slice(0, 80);
    if (!author || !license) return null;
    let licenseUrl = '';
    try { const link = new URL(meta.LicenseUrl?.value); if (link.protocol === 'https:') licenseUrl = link.toString(); } catch { /* The Commons file page still shows the license. */ }
    return { url: url.toString(), author, license, licenseUrl, sourceUrl: `${COMMONS}/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}` };
  } catch { return null; }
}
