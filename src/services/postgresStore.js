const { Pool } = require('pg');
const fs = require('fs');

class PostgresStore {
  constructor({ connectionString, runMigrations = false, migrationFile }) {
    this.pool = new Pool({ connectionString });
    this.runMigrations = runMigrations;
    this.migrationFile = migrationFile;
  }

  async initialize() {
    if (this.runMigrations && this.migrationFile && fs.existsSync(this.migrationFile)) {
      const sql = fs.readFileSync(this.migrationFile, 'utf8');
      await this.pool.query(sql);
    }
  }

  sanitizeUserRow(row) {
    if (!row) return null;
    const rest = { ...row };
    delete rest.password_hash;
    return {
      id: rest.id,
      email: rest.email,
      displayName: rest.display_name,
      role: rest.role,
      requiresGeolock: rest.requires_geolock,
      suspended: rest.suspended,
      createdAt: rest.created_at,
    };
  }

  mapRouteRow(row) {
    return {
      id: row.id,
      name: row.name,
      routeId: row.route_id,
      channelTopic: row.channel_topic,
      nodeCount: row.node_count,
      status: row.status,
      approvedNodes: row.approved_nodes,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  mapGeofenceRow(row) {
    return {
      id: row.id,
      name: row.name,
      centerLatitude: Number(row.center_latitude),
      centerLongitude: Number(row.center_longitude),
      radiusMeters: row.radius_meters,
      enabled: row.enabled,
      outsideBehavior: row.outside_behavior,
      minAccuracyMeters: row.min_accuracy_meters,
      maxAgeSeconds: row.max_age_seconds,
      createdAt: row.created_at,
    };
  }

  mapAlertRow(row) {
    return {
      id: row.id,
      type: row.type,
      priority: row.priority,
      locationDescription: row.location_description,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      message: row.message,
      reporterUserId: row.reporter_user_id,
      status: row.status,
      acknowledgedBy: row.acknowledged_by,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findUserByEmail(email) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      email: rows[0].email,
      displayName: rows[0].display_name,
      passwordHash: rows[0].password_hash,
      role: rows[0].role,
      requiresGeolock: rows[0].requires_geolock,
      suspended: rows[0].suspended,
      createdAt: rows[0].created_at,
    };
  }

  async findUserById(id) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      email: rows[0].email,
      displayName: rows[0].display_name,
      passwordHash: rows[0].password_hash,
      role: rows[0].role,
      requiresGeolock: rows[0].requires_geolock,
      suspended: rows[0].suspended,
      createdAt: rows[0].created_at,
    };
  }

  async listUsers() {
    const { rows } = await this.pool.query('SELECT * FROM users ORDER BY id');
    return rows.map((r) => this.sanitizeUserRow(r));
  }

  async createUser(user) {
    const { rows } = await this.pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, requires_geolock, suspended)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user.email, user.displayName, user.passwordHash, user.role, user.requiresGeolock, user.suspended]
    );
    return this.sanitizeUserRow(rows[0]);
  }

  async updateUser(id, updates) {
    const current = await this.findUserById(id);
    if (!current) return null;
    const merged = { ...current, ...updates };
    const { rows } = await this.pool.query(
      `UPDATE users
       SET display_name = $2, role = $3, requires_geolock = $4, suspended = $5
       WHERE id = $1
       RETURNING *`,
      [id, merged.displayName, merged.role, merged.requiresGeolock, merged.suspended]
    );
    return this.sanitizeUserRow(rows[0]);
  }

  async listRoutes() {
    const { rows } = await this.pool.query('SELECT * FROM mesh_routes ORDER BY id');
    return rows.map((r) => this.mapRouteRow(r));
  }

  async createRoute(route) {
    const { rows } = await this.pool.query(
      `INSERT INTO mesh_routes (name, route_id, channel_topic, node_count, status, approved_nodes, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [route.name, route.routeId, route.channelTopic, route.nodeCount, route.status, route.approvedNodes, route.active]
    );
    return this.mapRouteRow(rows[0]);
  }

  async updateRoute(id, updates) {
    const { rows: currentRows } = await this.pool.query('SELECT * FROM mesh_routes WHERE id = $1', [id]);
    if (!currentRows[0]) return null;
    const current = this.mapRouteRow(currentRows[0]);
    const merged = { ...current, ...updates };

    const { rows } = await this.pool.query(
      `UPDATE mesh_routes
       SET name=$2, route_id=$3, channel_topic=$4, node_count=$5, status=$6, approved_nodes=$7, active=$8
       WHERE id = $1
       RETURNING *`,
      [id, merged.name, merged.routeId, merged.channelTopic, merged.nodeCount, merged.status, merged.approvedNodes, merged.active]
    );
    return this.mapRouteRow(rows[0]);
  }

  async deleteRoute(id) {
    const res = await this.pool.query('DELETE FROM mesh_routes WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  async listGeofences() {
    const { rows } = await this.pool.query('SELECT * FROM geofences ORDER BY id');
    return rows.map((r) => this.mapGeofenceRow(r));
  }

  async createGeofence(geofence) {
    const { rows } = await this.pool.query(
      `INSERT INTO geofences (name, center_latitude, center_longitude, radius_meters, enabled, outside_behavior, min_accuracy_meters, max_age_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        geofence.name,
        geofence.centerLatitude,
        geofence.centerLongitude,
        geofence.radiusMeters,
        geofence.enabled,
        geofence.outsideBehavior,
        geofence.minAccuracyMeters,
        geofence.maxAgeSeconds,
      ]
    );
    return this.mapGeofenceRow(rows[0]);
  }

  async updateGeofence(id, updates) {
    const { rows: currentRows } = await this.pool.query('SELECT * FROM geofences WHERE id = $1', [id]);
    if (!currentRows[0]) return null;
    const current = this.mapGeofenceRow(currentRows[0]);
    const merged = { ...current, ...updates };

    const { rows } = await this.pool.query(
      `UPDATE geofences
       SET name=$2, center_latitude=$3, center_longitude=$4, radius_meters=$5, enabled=$6, outside_behavior=$7, min_accuracy_meters=$8, max_age_seconds=$9
       WHERE id = $1
       RETURNING *`,
      [
        id,
        merged.name,
        merged.centerLatitude,
        merged.centerLongitude,
        merged.radiusMeters,
        merged.enabled,
        merged.outsideBehavior,
        merged.minAccuracyMeters,
        merged.maxAgeSeconds,
      ]
    );
    return this.mapGeofenceRow(rows[0]);
  }

  async listAlerts() {
    const { rows } = await this.pool.query('SELECT * FROM alerts ORDER BY created_at DESC');
    return rows.map((r) => this.mapAlertRow(r));
  }

  async findAlertById(id) {
    const { rows } = await this.pool.query('SELECT * FROM alerts WHERE id = $1', [id]);
    return rows[0] ? this.mapAlertRow(rows[0]) : null;
  }

  async createAlert(alert) {
    const { rows } = await this.pool.query(
      `INSERT INTO alerts (type, priority, location_description, latitude, longitude, message, reporter_user_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        alert.type,
        alert.priority,
        alert.locationDescription,
        alert.latitude,
        alert.longitude,
        alert.message,
        alert.reporterUserId,
        alert.status,
      ]
    );
    return this.mapAlertRow(rows[0]);
  }

  async updateAlert(id, updates) {
    const { rows: currentRows } = await this.pool.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (!currentRows[0]) return null;
    const current = this.mapAlertRow(currentRows[0]);
    const merged = { ...current, ...updates };

    const { rows } = await this.pool.query(
      `UPDATE alerts
       SET type=$2, priority=$3, location_description=$4, latitude=$5, longitude=$6, message=$7, status=$8, acknowledged_by=$9, resolved_by=$10, updated_at=NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        merged.type,
        merged.priority,
        merged.locationDescription,
        merged.latitude,
        merged.longitude,
        merged.message,
        merged.status,
        merged.acknowledgedBy,
        merged.resolvedBy,
      ]
    );
    return this.mapAlertRow(rows[0]);
  }

  async addAlertAction(action) {
    const { rows } = await this.pool.query(
      `INSERT INTO alert_actions (alert_id, actor_user_id, action_type, notes)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [action.alertId, action.actorUserId, action.actionType, action.notes]
    );
    return rows[0];
  }

  async listAlertActions(alertId) {
    const { rows } = await this.pool.query('SELECT * FROM alert_actions WHERE alert_id = $1 ORDER BY created_at ASC', [alertId]);
    return rows.map((r) => ({
      id: r.id,
      alertId: r.alert_id,
      actorUserId: r.actor_user_id,
      actionType: r.action_type,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  async addAuditLog(log) {
    const { rows } = await this.pool.query(
      `INSERT INTO audit_logs (event_type, actor_user_id, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [log.eventType, log.actorUserId || null, log.targetType, log.targetId ? String(log.targetId) : null, log.details]
    );
    return rows[0];
  }

  async listAuditLogs(limit = 30) {
    const { rows } = await this.pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      actorUserId: r.actor_user_id,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.details,
      createdAt: r.created_at,
    }));
  }

  async addNotification(notification) {
    const { rows } = await this.pool.query(
      `INSERT INTO notifications (channel, severity, message, payload)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [notification.channel, notification.severity, notification.message, notification.payload]
    );
    return rows[0];
  }

  async dashboardSummary() {
    const [activeAlerts, openRoutes, users, geolock, recentActivity, routeStatuses] = await Promise.all([
      this.pool.query("SELECT COUNT(*)::int AS count FROM alerts WHERE status NOT IN ('Resolved','Closed')"),
      this.pool.query('SELECT COUNT(*)::int AS count FROM mesh_routes WHERE active = true'),
      this.pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE suspended = true)::int AS suspended FROM users'),
      this.pool.query('SELECT COUNT(*)::int AS count FROM users WHERE requires_geolock = true'),
      this.pool.query('SELECT event_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10'),
      this.pool.query('SELECT route_id, status, node_count FROM mesh_routes ORDER BY id'),
    ]);

    return {
      activeAlerts: activeAlerts.rows[0].count,
      openRoutes: openRoutes.rows[0].count,
      totalUsers: users.rows[0].total,
      suspendedUsers: users.rows[0].suspended,
      geolockEnabledUsers: geolock.rows[0].count,
      recentActivity: recentActivity.rows,
      routeStatuses: routeStatuses.rows,
    };
  }
}

module.exports = { PostgresStore };
