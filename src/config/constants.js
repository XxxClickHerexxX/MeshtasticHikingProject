const ROLES = {
  ADMINISTRATOR: 'Administrator',
  COORDINATOR: 'Coordinator',
  HIKER: 'Hiker',
  VIEWER: 'Viewer',
};

const ALERT_TYPES = ['Injury', 'Lost', 'Off track', 'Bad weather', 'Emergency', 'Other'];
const ALERT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const ALERT_STATUS = ['Open', 'Acknowledged', 'Resolved', 'Closed'];
const OUTSIDE_ZONE_BEHAVIOR = ['warn', 'restrict', 'alert'];

module.exports = {
  ROLES,
  ALERT_TYPES,
  ALERT_PRIORITIES,
  ALERT_STATUS,
  OUTSIDE_ZONE_BEHAVIOR,
};
