const API_KEY = process.env.MY_API_KEY;
const RADIUS = 16000;
let category = 'electronics';

document.getElementById('categoryChips').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;

  document.querySelectorAll('.chip').forEach((button) => {
    button.classList.toggle('selected', button === chip);
  });
  category = chip.dataset.value;
});

document.getElementById('findBtn').addEventListener('click', async () => {
  const zip = document.getElementById('zipInput').value.trim();
  const item = document.getElementById('itemInput').value.trim();
  const intent = document.querySelector('input[name="intent"]:checked').value;
  const results = document.getElementById('resultsList');
  const button = document.getElementById('findBtn');

  if (!/^\d{5}$/.test(zip) || !item) {
    results.textContent = 'Enter an item and a valid 5-digit ZIP code.';
    return;
  }

  button.disabled = true;
  results.textContent = 'Searching nearby...';

  try {
    const zipData = await get('/v1/geocode/search', {
      text: `${zip}, USA`,
      filter: 'countrycode:us',
      format: 'geojson'
    });
    const [longitude, latitude] = zipData.features?.[0]?.geometry?.coordinates || [];

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      results.textContent = 'ZIP code not found. Check it and try again.';
      return;
    }

    const params = {
      filter: `circle:${longitude},${latitude},${RADIUS}`,
      bias: `proximity:${longitude},${latitude}`,
      limit: '50'
    };
    const places = intent === 'donate'
      ? await get('/v2/places', { ...params, categories: 'commercial.second_hand' })
      : await get('/v2/places', { ...params, categories: 'service.recycling.centre' });

    showPlaces(places.features, latitude, longitude);
  } catch (error) {
    console.error(error);
    results.textContent = error.message || 'Could not search nearby. Please try again.';
  } finally {
    button.disabled = false;
  }
});

async function get(path, params) {
  const url = new URL(`https://api.geoapify.com${path}`);
  url.search = new URLSearchParams({ ...params, apiKey: API_KEY });

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Location search failed.');
  return data;
}

function showPlaces(features, userLat, userLon) {
  const results = document.getElementById('resultsList');
  results.replaceChildren();

  const places = features?.filter(({ properties = {}, geometry }) => {
    const [lon, lat] = geometry?.coordinates || [];
    return typeof properties.name === 'string'
      && properties.name.trim()
      && Number.isFinite(lat)
      && Number.isFinite(lon)
      && !isClosed(properties);
  }) || [];
  if (!places.length) {
    results.textContent = 'No nearby places found. Try another ZIP code.';
    return;
  }

  places.slice(0, 5).forEach(({ properties = {}, geometry }) => {
    const [lon, lat] = geometry.coordinates;
    const name = properties.name.trim();
    const address = properties.formatted || properties.address_line2 || 'Address unavailable';
    const miles = distance(userLat, userLon, lat, lon);
    const map = new URL('https://www.google.com/maps/search/');
    map.search = new URLSearchParams({ api: '1', query: `${name}, ${address}` });

    const card = document.createElement('div');
    card.className = 'place-card';
    const title = document.createElement('h3');
    title.textContent = name;
    const details = document.createElement('p');
    details.textContent = `📍 ${address} · ${miles.toFixed(1)} miles`;
    const link = document.createElement('a');
    link.href = map.toString();
    link.textContent = 'Open in Google Maps';
    card.append(title, details, link);
    results.appendChild(card);
  });
}

function isClosed(properties) {
  const raw = properties.datasource?.raw || {};
  const closedValues = ['yes', 'true', 'closed', 'permanently_closed', 'abandoned', 'disused', 'demolished', 'vacant'];
  const isClosedValue = (value) =>
    closedValues.includes(String(value || '').toLowerCase().replaceAll(' ', '_'));
  const status = properties.status || raw.status || raw.lifecycle;

  return isClosedValue(status) || isClosedValue(raw.shop)
    || ['closed', 'disused', 'abandoned', 'demolished'].some((key) =>
      isClosedValue(properties[key] ?? raw[key])
      || Boolean(raw[`${key}:shop`] || raw[`${key}:amenity`])
    );
}

function distance(lat1, lon1, lat2, lon2) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
