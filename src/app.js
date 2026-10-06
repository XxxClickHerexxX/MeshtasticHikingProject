const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');

const { createStore } = require('./services/store');
const { attachUser, requireAuth, requireRole } = require('./middleware/auth');
const { evaluateGeofence } = require('./utils/geofence');
const {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  routeSchema,
  geofenceSchema,
  geolockCheckSchema,
  alertSchema,
  alertActionSchema,
} = require('./utils/validation');
const { ROLES } = require('./config/constants');
const { NotificationService } = require('./integrations/notificationService');
const { createMeshAdapter } = require('./integrations/meshAdapter');

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

async function buildApp() {
  const app = express();
  const store = createStore();
  await store.initialize();

  const notificationService = new NotificationService(store);
  const meshAdapter = createMeshAdapter();
  try {
    await meshAdapter.connect();
  } catch {
    // Continue in degraded mode; adapter status endpoint will expose disconnected state.
  }

  app.set('view engine', 'ejs');
  app.set('views', path.resolve(process.cwd(), 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'development-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  };

  if ((process.env.STORAGE_ADAPTER || (process.env.DATABASE_URL ? 'postgres' : 'memory')) === 'postgres') {
    sessionConfig.store = new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    });
  }

  app.use(session(sessionConfig));
  app.use(attachUser(store));
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/', (req, res) => {
    if (!req.user) return res.redirect('/login');
    return res.redirect('/dashboard');
  });

  app.get('/login', (_req, res) => res.render('page', { page: 'login', user: null }));

  ['dashboard', 'alerts', 'geolock', 'meshes', 'users', 'settings'].forEach((page) => {
    app.get(`/${page}`, (req, res) => {
      if (!req.user) return res.redirect('/login');
      return res.render('page', { page, user: req.user });
    });
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const body = parseBody(loginSchema, req, res);
      if (!body) return;

      const user = await store.findUserByEmail(body.email);
      if (!user || user.suspended) {
        await store.addAuditLog({
          eventType: 'auth.login.failed',
          targetType: 'user',
          targetId: body.email,
          details: { reason: 'not_found_or_suspended' },
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const ok = await bcrypt.compare(body.password, user.passwordHash);
      if (!ok) {
        await store.addAuditLog({
          eventType: 'auth.login.failed',
          targetType: 'user',
          targetId: user.id,
          details: { reason: 'bad_password' },
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = user.id;
      await store.addAuditLog({
        eventType: 'auth.login.success',
        actorUserId: user.id,
        targetType: 'session',
        targetId: req.sessionID,
        details: {},
      });

      const safeUser = { ...user };
      delete safeUser.passwordHash;
      return res.json({ user: safeUser });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
    try {
      await store.addAuditLog({
        eventType: 'auth.logout',
        actorUserId: req.user.id,
        targetType: 'session',
        targetId: req.sessionID,
        details: {},
      });
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    return res.json({ user: req.user });
  });

  app.get('/api/dashboard', requireAuth, async (req, res, next) => {
    try {
      const summary = await store.dashboardSummary();
      const meshStatus = meshAdapter.status();
      return res.json({ ...summary, meshStatus });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/users', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const users = await store.listUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/users', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(createUserSchema, req, res);
      if (!body) return;
      const existing = await store.findUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: 'User already exists' });

      const passwordHash = await bcrypt.hash(body.password, 10);
      const user = await store.createUser({
        email: body.email,
        displayName: body.displayName,
        passwordHash,
        role: body.role,
        requiresGeolock: body.requiresGeolock,
        suspended: false,
      });

      await store.addAuditLog({
        eventType: 'user.created',
        actorUserId: req.user.id,
        targetType: 'user',
        targetId: user.id,
        details: { role: user.role },
      });

      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/users/:id', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(updateUserSchema, req, res);
      if (!body) return;
      const updated = await store.updateUser(req.params.id, body);
      if (!updated) return res.status(404).json({ error: 'User not found' });

      await store.addAuditLog({
        eventType: 'user.updated',
        actorUserId: req.user.id,
        targetType: 'user',
        targetId: updated.id,
        details: body,
      });

      res.json({ user: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/routes', requireAuth, async (_req, res, next) => {
    try {
      res.json({ routes: await store.listRoutes() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/routes', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(routeSchema, req, res);
      if (!body) return;
      const route = await store.createRoute(body);
      await store.addAuditLog({
        eventType: 'mesh.route.created',
        actorUserId: req.user.id,
        targetType: 'route',
        targetId: route.id,
        details: body,
      });
      res.status(201).json({ route });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/routes/:id', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(routeSchema.partial(), req, res);
      if (!body) return;
      const route = await store.updateRoute(req.params.id, body);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      await store.addAuditLog({
        eventType: 'mesh.route.updated',
        actorUserId: req.user.id,
        targetType: 'route',
        targetId: route.id,
        details: body,
      });
      res.json({ route });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/routes/:id', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const deleted = await store.deleteRoute(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Route not found' });
      await store.addAuditLog({
        eventType: 'mesh.route.deleted',
        actorUserId: req.user.id,
        targetType: 'route',
        targetId: req.params.id,
        details: {},
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/geofences', requireAuth, async (_req, res, next) => {
    try {
      res.json({ geofences: await store.listGeofences() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/geofences', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(geofenceSchema, req, res);
      if (!body) return;
      const geofence = await store.createGeofence(body);
      await store.addAuditLog({
        eventType: 'geofence.created',
        actorUserId: req.user.id,
        targetType: 'geofence',
        targetId: geofence.id,
        details: body,
      });
      res.status(201).json({ geofence });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/geofences/:id', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(geofenceSchema.partial(), req, res);
      if (!body) return;
      const geofence = await store.updateGeofence(req.params.id, body);
      if (!geofence) return res.status(404).json({ error: 'Geofence not found' });
      await store.addAuditLog({
        eventType: 'geofence.updated',
        actorUserId: req.user.id,
        targetType: 'geofence',
        targetId: geofence.id,
        details: body,
      });
      res.json({ geofence });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/geolock/check', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(geolockCheckSchema, req, res);
      if (!body) return;

      const geofences = await store.listGeofences();
      const zone = geofences.find((g) => g.enabled);
      if (!zone) {
        return res.json({ allowed: true, reason: 'No active geofence configured' });
      }

      const result = evaluateGeofence({ zone, location: body });
      if (result.severity === 'alert') {
        await store.addAuditLog({
          eventType: 'geolock.outside.alert',
          actorUserId: req.user.id,
          targetType: 'geofence',
          targetId: zone.id,
          details: result,
        });
      }

      return res.json({ zone: zone.name, ...result });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/alerts', requireAuth, async (req, res, next) => {
    try {
      const alerts = await store.listAlerts();
      const alertsWithActions = await Promise.all(
        alerts.map(async (alert) => ({ ...alert, actions: await store.listAlertActions(alert.id) }))
      );
      res.json({ alerts: alertsWithActions });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/alerts', requireAuth, requireRole(ROLES.HIKER, ROLES.COORDINATOR, ROLES.ADMINISTRATOR), async (req, res, next) => {
    try {
      const body = parseBody(alertSchema, req, res);
      if (!body) return;

      if ((body.type === 'Emergency' || body.priority === 'Critical') && body.confirmation !== true) {
        return res.status(400).json({ error: 'Emergency/Critical alerts require explicit confirmation' });
      }

      if (req.user.requiresGeolock) {
        const geofences = await store.listGeofences();
        const zone = geofences.find((g) => g.enabled);
        const headerLocation = req.headers['x-location-check'];

        if (zone && headerLocation) {
          try {
            const parsed = geolockCheckSchema.safeParse(JSON.parse(headerLocation));
            if (parsed.success) {
              const evalResult = evaluateGeofence({ zone, location: parsed.data });
              if (!evalResult.allowed) {
                await store.addAuditLog({
                  eventType: 'alert.create.restricted_by_geolock',
                  actorUserId: req.user.id,
                  targetType: 'geofence',
                  targetId: zone.id,
                  details: evalResult,
                });
                return res.status(403).json({ error: 'Geolock policy restricted this action', geolock: evalResult });
              }
            }
          } catch {
            return res.status(400).json({ error: 'Invalid location check header format' });
          }
        }
      }

      const alert = await store.createAlert({
        type: body.type,
        priority: body.priority,
        locationDescription: body.locationDescription,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        message: body.message,
        reporterUserId: req.user.id,
        status: 'Open',
      });

      await store.addAlertAction({
        alertId: alert.id,
        actorUserId: req.user.id,
        actionType: 'created',
        notes: 'Alert created',
      });

      await store.addAuditLog({
        eventType: 'alert.created',
        actorUserId: req.user.id,
        targetType: 'alert',
        targetId: alert.id,
        details: { type: alert.type, priority: alert.priority },
      });

      await notificationService.sendAlert(alert);
      await meshAdapter.publishAlert(alert);

      if (alert.type === 'Emergency' || alert.priority === 'Critical') {
        await notificationService.sendEscalation(alert);
        await store.addAuditLog({
          eventType: 'notification.escalated',
          actorUserId: req.user.id,
          targetType: 'alert',
          targetId: alert.id,
          details: { mode: process.env.MQTT_ENABLED === 'true' ? 'configured' : 'development-safe' },
        });
      }

      res.status(201).json({ alert });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/alerts/:id/actions', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const body = parseBody(alertActionSchema, req, res);
      if (!body) return;

      const alert = await store.findAlertById(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });

      const action = await store.addAlertAction({
        alertId: alert.id,
        actorUserId: req.user.id,
        actionType: body.actionType,
        notes: body.notes,
      });

      await store.addAuditLog({
        eventType: 'alert.action.recorded',
        actorUserId: req.user.id,
        targetType: 'alert',
        targetId: alert.id,
        details: body,
      });

      res.status(201).json({ action });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/alerts/:id/acknowledge', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const alert = await store.findAlertById(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });

      const updated = await store.updateAlert(alert.id, {
        status: 'Acknowledged',
        acknowledgedBy: req.user.id,
      });

      await store.addAlertAction({
        alertId: alert.id,
        actorUserId: req.user.id,
        actionType: 'acknowledged',
        notes: 'Alert acknowledged by coordinator/admin',
      });

      await store.addAuditLog({
        eventType: 'alert.acknowledged',
        actorUserId: req.user.id,
        targetType: 'alert',
        targetId: alert.id,
        details: {},
      });

      res.json({ alert: updated });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/alerts/:id/resolve', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (req, res, next) => {
    try {
      const alert = await store.findAlertById(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });

      const updated = await store.updateAlert(alert.id, {
        status: 'Resolved',
        resolvedBy: req.user.id,
      });

      await store.addAlertAction({
        alertId: alert.id,
        actorUserId: req.user.id,
        actionType: 'resolved',
        notes: 'Alert resolved by coordinator/admin',
      });

      await store.addAuditLog({
        eventType: 'alert.resolved',
        actorUserId: req.user.id,
        targetType: 'alert',
        targetId: alert.id,
        details: {},
      });

      res.json({ alert: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/audit-logs', requireAuth, requireRole(ROLES.ADMINISTRATOR, ROLES.COORDINATOR), async (_req, res, next) => {
    try {
      res.json({ auditLogs: await store.listAuditLogs(50) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/mesh/status', requireAuth, (req, res) => {
    res.json({ status: meshAdapter.status() });
  });

  app.use((err, _req, res, _next) => {
    // Avoid leaking internals
    res.status(500).json({ error: 'Unexpected server error' });
  });

  app.locals.store = store;
  return app;
}

module.exports = { buildApp };
