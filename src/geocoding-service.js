export class GeocodingService {
    constructor(mapboxToken) {
        this.endpoint = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
        this.token = mapboxToken;
    }
    async searchPlaces(query, limit = 5, signal) {
        const q = query.trim();
        if (!q)
            return [];
        const url = `${this.endpoint}/${encodeURIComponent(q)}.json?autocomplete=true&limit=${limit}&access_token=${encodeURIComponent(this.token)}`;
        try {
            const res = await fetch(url, { signal });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const features = (json && json.features) || [];
            return features.map((f) => ({
                name: f.place_name,
                center: f.center,
                context: f.context,
            }));
        }
        catch (e) {
            console.warn('Geocoding search error', e);
            return [];
        }
    }
    async reverseGeocode(lngLat, signal) {
        const [lng, lat] = lngLat;
        const url = `${this.endpoint}/${lng},${lat}.json?limit=1&access_token=${encodeURIComponent(this.token)}`;
        try {
            const res = await fetch(url, { signal });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const name = json && json.features && json.features[0] && json.features[0].place_name;
            return name || null;
        }
        catch (e) {
            console.warn('Reverse geocoding error', e);
            return null;
        }
    }
}
