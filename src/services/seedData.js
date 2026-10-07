const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

async function buildSeedData() {
  const password = await bcrypt.hash('ChangeMe123!', 10);
  const now = new Date().toISOString();

  const users = [
    {
      id: 1,
      email: 'admin@hikingwithconfidence.local',
      displayName: 'System Administrator',
      passwordHash: password,
      role: ROLES.ADMINISTRATOR,
      requiresGeolock: false,
      suspended: false,
      createdAt: now,
    },
    {
      id: 2,
      email: 'coordinator@hikingwithconfidence.local',
      displayName: 'Route Coordinator',
      passwordHash: password,
      role: ROLES.COORDINATOR,
      requiresGeolock: true,
      suspended: false,
      createdAt: now,
    },
    {
      id: 3,
      email: 'hiker@hikingwithconfidence.local',
      displayName: 'Demo Hiker',
      passwordHash: password,
      role: ROLES.HIKER,
      requiresGeolock: true,
      suspended: false,
      createdAt: now,
    },
    {
      id: 4,
      email: 'viewer@hikingwithconfidence.local',
      displayName: 'Viewer User',
      passwordHash: password,
      role: ROLES.VIEWER,
      requiresGeolock: false,
      suspended: false,
      createdAt: now,
    },
  ];

  const meshRoutes = [
    {
      id: 1,
      name: 'Hiking with Confidence Demo Route',
      routeId: 'HWC-DEMO-ROUTE-01',
      channelTopic: 'meshtastic/hwc/demo',
      nodeCount: 12,
      status: 'Nominal',
      approvedNodes: ['!abcd1234', '!efgh5678'],
      active: true,
      createdAt: now,
    },
  ];

  const geofences = [
    {
      id: 1,
      name: 'Demo Trail Safety Zone',
      centerLatitude: 37.8651,
      centerLongitude: -119.5383,
      radiusMeters: 3500,
      enabled: true,
      outsideBehavior: 'warn',
      minAccuracyMeters: 75,
      maxAgeSeconds: 300,
      createdAt: now,
    },
  ];

  const alerts = [
    {
      id: 1,
      type: 'Off track',
      priority: 'Medium',
      locationDescription: 'North ridge marker 3',
      latitude: 37.871,
      longitude: -119.531,
      message: 'Hiker separated from group and requests guidance.',
      reporterUserId: 3,
      status: 'Open',
      acknowledgedBy: null,
      resolvedBy: null,
      actionsTaken: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    users,
    meshRoutes,
    geofences,
    alerts,
    alertActions: [],
    auditLogs: [],
    notifications: [],
  };
}

module.exports = { buildSeedData };
