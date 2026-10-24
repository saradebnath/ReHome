const API_KEY = '';
const SEARCH_RADIUS_METERS = 16000;

const categoryChips = document.getElementById('categoryChips');
const searchButton = document.getElementById('findBtn');
const results = document.getElementById('resultsList');

categoryChips.addEventListener('click', (event) => {
  const clickedChip = event.target.closest('.chip');
  if (!clickedChip) return;

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('selected', chip === clickedChip);
  });
});

searchButton.addEventListener('click', searchNearby);

async function searchNearby() {
  const zipCode = document.getElementById('zipInput').value.trim();
  const itemName = document.getElementById('itemInput').value.trim();
  const intent = document.querySelector('input[name="intent"]:checked').value;
  const isValidZipCode = /^\d{5}$/.test(zipCode);

  if (!isValidZipCode || !itemName) {
    results.textContent = 'Please enter an item and a valid 5-digit ZIP code.';
    return;
  }

  searchButton.disabled = true;
  results.textContent = 'Searching nearby...';

  try {
    const zipLocation = await getApiData('/v1/geocode/search', {
      text: `${zipCode}, USA`,
      filter: 'countrycode:us',
      format: 'geojson'
    });

    const coordinates = zipLocation.features?.[0]?.geometry?.coordinates;
    const [longitude, latitude] = coordinates || [];

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      results.textContent = 'ZIP code not found. Please check it and try again.';
      return;
    }

    const nearbyPlaces = await findNearbyPlaces(intent, longitude, latitude);
    showPlaces(nearbyPlaces.features, latitude, longitude);
  } catch (error) {
    console.error(error);
    results.textContent = error.message || 'Could not search nearby. Please try again.';
  } finally {
    searchButton.disabled = false;
  }
}

async function findNearbyPlaces(intent, longitude, latitude) {
  const category = intent === 'donate'
    ? 'commercial.second_hand'
    : 'service.recycling.centre';

  return getApiData('/v2/places', {
    filter: `circle:${longitude},${latitude},${SEARCH_RADIUS_METERS}`,
    bias: `proximity:${longitude},${latitude}`,
    limit: '50',
    categories: category
  });
}

async function getApiData(path, params) {
  if (!API_KEY) {
    throw new Error('Add your Geoapify API key to the API_KEY at the top of app.js.');
  }

  const url = new URL(`https://api.geoapify.com${path}`);
  url.search = new URLSearchParams({ ...params, apiKey: API_KEY });

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Location search failed.');
  }

  return data;
}

function showPlaces(features, userLatitude, userLongitude) {
  results.replaceChildren();

  const places = (features || []).filter((place) => {
    const properties = place.properties || {};
    const coordinates = place.geometry?.coordinates || [];
    const [longitude, latitude] = coordinates;

    return typeof properties.name === 'string'
      && properties.name.trim()
      && Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && !isClosed(properties);
  });

  if (places.length === 0) {
    results.textContent = 'No nearby places found. Try another ZIP code.';
    return;
  }

  places.slice(0, 5).forEach((place) => {
    const properties = place.properties || {};
    const [longitude, latitude] = place.geometry.coordinates;
    const name = properties.name.trim();
    const address = properties.formatted || properties.address_line2 || 'Address unavailable';
    const milesAway = calculateDistance(userLatitude, userLongitude, latitude, longitude);

    const mapsUrl = new URL('https://www.google.com/maps/search/');
    mapsUrl.search = new URLSearchParams({
      api: '1',
      query: `${name}, ${address}`
    });

    const card = document.createElement('div');
    card.className = 'place-card';

    const title = document.createElement('h3');
    title.textContent = name;

    const details = document.createElement('p');
    details.textContent = `${address} · ${milesAway.toFixed(1)} miles`;

    const mapsLink = document.createElement('a');
    mapsLink.href = mapsUrl.toString();
    mapsLink.textContent = 'Open in Google Maps';

    card.append(title, details, mapsLink);
    results.appendChild(card);
  });
}

function isClosed(properties) {
  const rawData = properties.datasource?.raw || {};
  const closedValues = [
    'yes',
    'true',
    'closed',
    'permanently_closed',
    'abandoned',
    'disused',
    'demolished',
    'vacant'
  ];

  function hasClosedValue(value) {
    const normalizedValue = String(value || '').toLowerCase().replaceAll(' ', '_');
    return closedValues.includes(normalizedValue);
  }

  const status = properties.status || rawData.status || rawData.lifecycle;
  if (hasClosedValue(status) || hasClosedValue(rawData.shop)) {
    return true;
  }

  const closureTypes = ['closed', 'disused', 'abandoned', 'demolished'];
  return closureTypes.some((type) => {
    const value = properties[type] ?? rawData[type];
    const shopStatus = rawData[`${type}:shop`];
    const amenityStatus = rawData[`${type}:amenity`];

    return hasClosedValue(value) || Boolean(shopStatus || amenityStatus);
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  const latitudeDifference = toRadians(lat2 - lat1);
  const longitudeDifference = toRadians(lon2 - lon1);
  const distancePart =
    Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(lat1))
      * Math.cos(toRadians(lat2))
      * Math.sin(longitudeDifference / 2) ** 2;

  return 3958.8 * 2 * Math.atan2(Math.sqrt(distancePart), Math.sqrt(1 - distancePart));
}
