const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function evaluateGeofence({ zone, location }) {
  const now = Date.now();
  const timestampMs = new Date(location.timestamp).getTime();
  const ageSeconds = Number.isFinite(timestampMs) ? (now - timestampMs) / 1000 : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return { allowed: false, reason: 'Invalid coordinates', severity: 'error' };
  }

  if (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters <= 0) {
    return { allowed: false, reason: 'Invalid location accuracy', severity: 'error' };
  }

  if (ageSeconds > zone.maxAgeSeconds) {
    return { allowed: false, reason: 'Location timestamp is stale', severity: 'error' };
  }

  if (location.accuracyMeters > zone.minAccuracyMeters) {
    return { allowed: false, reason: 'Location accuracy does not meet policy', severity: 'error' };
  }

  const distanceMeters = haversineDistanceMeters(
    zone.centerLatitude,
    zone.centerLongitude,
    location.latitude,
    location.longitude
  );
  const inside = distanceMeters <= zone.radiusMeters;

  if (inside) {
    return { allowed: true, inside, distanceMeters, reason: 'Inside geofence', severity: 'info' };
  }

  if (zone.outsideBehavior === 'warn') {
    return { allowed: true, inside, distanceMeters, reason: 'Outside geofence warning', severity: 'warn' };
  }

  if (zone.outsideBehavior === 'alert') {
    return { allowed: true, inside, distanceMeters, reason: 'Outside geofence alert', severity: 'alert' };
  }

  return { allowed: false, inside, distanceMeters, reason: 'Outside geofence (restricted)', severity: 'error' };
}

module.exports = {
  haversineDistanceMeters,
  evaluateGeofence,
};
