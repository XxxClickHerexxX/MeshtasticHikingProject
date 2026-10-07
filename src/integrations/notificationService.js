class LocalNotificationService {
  constructor(store) {
    this.store = store;
  }

  async send({ severity, message, payload }) {
    return this.store.addNotification({ channel: 'local', severity, message, payload });
  }
}

class NotificationService {
  constructor(store) {
    this.store = store;
    this.local = new LocalNotificationService(store);
  }

  async sendAlert(alert) {
    const severity = alert.priority === 'Critical' || alert.type === 'Emergency' ? 'critical' : 'normal';
    const message = `Alert ${alert.type} reported by user ${alert.reporterUserId}`;
    return this.local.send({ severity, message, payload: alert });
  }

  async sendEscalation(alert) {
    return this.local.send({
      severity: 'critical',
      message: `Escalation (development-safe): Emergency alert #${alert.id}`,
      payload: {
        alertId: alert.id,
        extensionPoints: ['web-push', 'email', 'sms'],
      },
    });
  }
}

module.exports = { NotificationService };
