const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { buildApp } = require('../src/app');
const { haversineDistanceMeters, evaluateGeofence } = require('../src/utils/geofence');

const TEST_DATA_FILE = path.resolve(process.cwd(), 'data/test-data.json');

async function createAgent() {
  process.env.STORAGE_ADAPTER = 'memory';
  process.env.LOCAL_DATA_FILE = 'data/test-data.json';
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  const app = await buildApp();
  return request.agent(app);
}

async function login(agent, email, password = 'ChangeMe123!') {
  const csrfToken = await getCsrfToken(agent);
  await agent.post('/api/auth/login').set('csrf-token', csrfToken).send({ email, password }).expect(200);
}

async function getCsrfToken(agent) {
  const response = await agent.get('/api/auth/csrf-token').expect(200);
  return response.body.csrfToken;
}

describe('Hiking with Confidence API', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  });

  test('requires authentication for protected routes', async () => {
    const agent = await createAgent();
    await agent.get('/api/dashboard').expect(401);
  });

  test('viewer is blocked from route management by server-side RBAC', async () => {
    const agent = await createAgent();
    await login(agent, 'viewer@hikingwithconfidence.local');
    const csrfToken = await getCsrfToken(agent);

    await agent
      .post('/api/routes')
      .set('csrf-token', csrfToken)
      .send({
        name: 'Forbidden',
        routeId: 'FORB-1',
        channelTopic: 'x/y',
        nodeCount: 1,
        status: 'ok',
        approvedNodes: [],
        active: true,
      })
      .expect(403);
  });

  test('geofence evaluator enforces boundary, accuracy and timestamp freshness', () => {
    const zone = {
      centerLatitude: 37.8651,
      centerLongitude: -119.5383,
      radiusMeters: 100,
      outsideBehavior: 'restrict',
      minAccuracyMeters: 50,
      maxAgeSeconds: 300,
    };

    const inside = evaluateGeofence({
      zone,
      location: {
        latitude: 37.8651,
        longitude: -119.5383,
        accuracyMeters: 10,
        timestamp: new Date().toISOString(),
      },
    });
    expect(inside.allowed).toBe(true);

    const outside = evaluateGeofence({
      zone,
      location: {
        latitude: 37.8751,
        longitude: -119.5383,
        accuracyMeters: 10,
        timestamp: new Date().toISOString(),
      },
    });
    expect(outside.allowed).toBe(false);

    const stale = evaluateGeofence({
      zone,
      location: {
        latitude: 37.8651,
        longitude: -119.5383,
        accuracyMeters: 10,
        timestamp: new Date(Date.now() - 1000 * 1000).toISOString(),
      },
    });
    expect(stale.allowed).toBe(false);

    expect(haversineDistanceMeters(37.8651, -119.5383, 37.8651, -119.5383)).toBeCloseTo(0, 4);
  });

  test('hiker can create alert and coordinator can acknowledge/resolve with audit trail actions', async () => {
    process.env.STORAGE_ADAPTER = 'memory';
    process.env.LOCAL_DATA_FILE = 'data/test-data.json';
    if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
    const app = await buildApp();
    const hiker = request.agent(app);
    await login(hiker, 'hiker@hikingwithconfidence.local');
    const hikerCsrfToken = await getCsrfToken(hiker);

    await hiker
      .post('/api/alerts')
      .set('csrf-token', hikerCsrfToken)
      .send({
        type: 'Emergency',
        priority: 'Critical',
        locationDescription: 'Switchback 5',
        message: 'Need immediate assistance',
      })
      .expect(400);

    const created = await hiker
      .post('/api/alerts')
      .set('csrf-token', hikerCsrfToken)
      .send({
        type: 'Emergency',
        priority: 'Critical',
        locationDescription: 'Switchback 5',
        message: 'Need immediate assistance',
        confirmation: true,
      })
      .expect(201);

    const alertId = created.body.alert.id;

    const coordinator = request.agent(app);
    await login(coordinator, 'coordinator@hikingwithconfidence.local');
    const coordinatorCsrfToken = await getCsrfToken(coordinator);

    await coordinator
      .patch(`/api/alerts/${alertId}/acknowledge`)
      .set('csrf-token', coordinatorCsrfToken)
      .expect(200);
    await coordinator
      .post(`/api/alerts/${alertId}/actions`)
      .set('csrf-token', coordinatorCsrfToken)
      .send({ actionType: 'dispatch', notes: 'Sent support team' })
      .expect(201);
    const resolved = await coordinator
      .patch(`/api/alerts/${alertId}/resolve`)
      .set('csrf-token', coordinatorCsrfToken)
      .expect(200);
    expect(resolved.body.alert.status).toBe('Resolved');

    const alerts = await coordinator.get('/api/alerts').expect(200);
    const alert = alerts.body.alerts.find((a) => a.id === alertId);
    expect(alert.actions.length).toBeGreaterThanOrEqual(3);
  });
});
