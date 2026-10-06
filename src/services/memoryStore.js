const fs = require('fs');
const path = require('path');
const { buildSeedData } = require('./seedData');

class MemoryStore {
  constructor({ persistPath }) {
    this.persistPath = persistPath;
    this.state = null;
  }

  async initialize() {
    if (this.persistPath && fs.existsSync(this.persistPath)) {
      this.state = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
      return;
    }

    this.state = await buildSeedData();
    await this.persist();
  }

  async persist() {
    if (!this.persistPath) return;
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.persistPath, JSON.stringify(this.state, null, 2));
  }

  nextId(collection) {
    const max = this.state[collection].reduce((acc, item) => Math.max(acc, item.id), 0);
    return max + 1;
  }

  sanitizeUser(user) {
    const safeUser = { ...user };
    delete safeUser.passwordHash;
    return safeUser;
  }

  async findUserByEmail(email) {
    return this.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findUserById(id) {
    return this.state.users.find((u) => u.id === Number(id)) || null;
  }

  async listUsers() {
    return this.state.users.map((u) => this.sanitizeUser(u));
  }

  async createUser(user) {
    const newUser = { id: this.nextId('users'), createdAt: new Date().toISOString(), ...user };
    this.state.users.push(newUser);
    await this.persist();
    return this.sanitizeUser(newUser);
  }

  async updateUser(id, updates) {
    const idx = this.state.users.findIndex((u) => u.id === Number(id));
    if (idx < 0) return null;
    this.state.users[idx] = { ...this.state.users[idx], ...updates };
    await this.persist();
    return this.sanitizeUser(this.state.users[idx]);
  }

  async listRoutes() {
    return this.state.meshRoutes;
  }

  async createRoute(route) {
    const newRoute = { id: this.nextId('meshRoutes'), createdAt: new Date().toISOString(), ...route };
    this.state.meshRoutes.push(newRoute);
    await this.persist();
    return newRoute;
  }

  async updateRoute(id, updates) {
    const idx = this.state.meshRoutes.findIndex((r) => r.id === Number(id));
    if (idx < 0) return null;
    this.state.meshRoutes[idx] = { ...this.state.meshRoutes[idx], ...updates };
    await this.persist();
    return this.state.meshRoutes[idx];
  }

  async deleteRoute(id) {
    const idx = this.state.meshRoutes.findIndex((r) => r.id === Number(id));
    if (idx < 0) return false;
    this.state.meshRoutes.splice(idx, 1);
    await this.persist();
    return true;
  }

  async listGeofences() {
    return this.state.geofences;
  }

  async createGeofence(geofence) {
    const newGeofence = { id: this.nextId('geofences'), createdAt: new Date().toISOString(), ...geofence };
    this.state.geofences.push(newGeofence);
    await this.persist();
    return newGeofence;
  }

  async updateGeofence(id, updates) {
    const idx = this.state.geofences.findIndex((g) => g.id === Number(id));
    if (idx < 0) return null;
    this.state.geofences[idx] = { ...this.state.geofences[idx], ...updates };
    await this.persist();
    return this.state.geofences[idx];
  }

  async listAlerts() {
    return this.state.alerts;
  }

  async findAlertById(id) {
    return this.state.alerts.find((a) => a.id === Number(id)) || null;
  }

  async createAlert(alert) {
    const now = new Date().toISOString();
    const newAlert = {
      id: this.nextId('alerts'),
      acknowledgedBy: null,
      resolvedBy: null,
      createdAt: now,
      updatedAt: now,
      ...alert,
    };
    this.state.alerts.push(newAlert);
    await this.persist();
    return newAlert;
  }

  async updateAlert(id, updates) {
    const idx = this.state.alerts.findIndex((a) => a.id === Number(id));
    if (idx < 0) return null;
    this.state.alerts[idx] = { ...this.state.alerts[idx], ...updates, updatedAt: new Date().toISOString() };
    await this.persist();
    return this.state.alerts[idx];
  }

  async addAlertAction(action) {
    const newAction = { id: this.nextId('alertActions'), createdAt: new Date().toISOString(), ...action };
    this.state.alertActions.push(newAction);
    await this.persist();
    return newAction;
  }

  async listAlertActions(alertId) {
    return this.state.alertActions.filter((a) => a.alertId === Number(alertId));
  }

  async addAuditLog(log) {
    const newLog = { id: this.nextId('auditLogs'), createdAt: new Date().toISOString(), ...log };
    this.state.auditLogs.push(newLog);
    await this.persist();
    return newLog;
  }

  async listAuditLogs(limit = 30) {
    return this.state.auditLogs.slice(-limit).reverse();
  }

  async addNotification(notification) {
    const newNotification = { id: this.nextId('notifications'), createdAt: new Date().toISOString(), ...notification };
    this.state.notifications.push(newNotification);
    await this.persist();
    return newNotification;
  }

  async dashboardSummary() {
    const activeAlerts = this.state.alerts.filter((a) => a.status !== 'Resolved' && a.status !== 'Closed').length;
    const openRoutes = this.state.meshRoutes.filter((r) => r.active).length;
    const suspendedUsers = this.state.users.filter((u) => u.suspended).length;
    const geolockEnabledUsers = this.state.users.filter((u) => u.requiresGeolock).length;

    return {
      activeAlerts,
      openRoutes,
      totalUsers: this.state.users.length,
      suspendedUsers,
      geolockEnabledUsers,
      recentActivity: this.state.auditLogs.slice(-10).reverse(),
      routeStatuses: this.state.meshRoutes.map((r) => ({ routeId: r.routeId, status: r.status, nodeCount: r.nodeCount })),
    };
  }
}

module.exports = { MemoryStore };
