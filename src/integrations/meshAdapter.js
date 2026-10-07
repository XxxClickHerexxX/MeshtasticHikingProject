const mqtt = require('mqtt');

class MockMeshAdapter {
  constructor() {
    this.connected = true;
    this.lastPublished = null;
  }

  async connect() {
    this.connected = true;
  }

  status() {
    return { connected: this.connected, adapter: 'mock', lastPublished: this.lastPublished };
  }

  async publishAlert(alert) {
    this.lastPublished = { topic: 'mock/meshtastic/alerts', alert, at: new Date().toISOString() };
    return this.lastPublished;
  }
}

class MqttMeshAdapter {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    this.client = mqtt.connect(this.config.url, {
      username: this.config.username,
      password: this.config.password,
      clientId: this.config.clientId,
    });
    await new Promise((resolve, reject) => {
      this.client.on('connect', () => {
        this.connected = true;
        resolve();
      });
      this.client.on('error', reject);
    });
  }

  status() {
    return { connected: this.connected, adapter: 'mqtt', topicPrefix: this.config.topicPrefix };
  }

  async publishAlert(alert) {
    const topic = `${this.config.topicPrefix}/alerts`;
    const payload = JSON.stringify({
      type: alert.type,
      priority: alert.priority,
      message: alert.message,
      createdAt: alert.createdAt,
    });

    await new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    return { topic, payload };
  }
}

function createMeshAdapter() {
  if (process.env.MQTT_ENABLED === 'true') {
    return new MqttMeshAdapter({
      url: process.env.MQTT_URL,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: process.env.MQTT_CLIENT_ID || 'hiking-with-confidence',
      topicPrefix: process.env.MQTT_TOPIC_PREFIX || 'meshtastic/hwc',
    });
  }

  return new MockMeshAdapter();
}

module.exports = { createMeshAdapter };
