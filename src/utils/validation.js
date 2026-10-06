const { z } = require('zod');
const { ALERT_TYPES, ALERT_PRIORITIES, OUTSIDE_ZONE_BEHAVIOR, ROLES } = require('../config/constants');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2),
  password: z.string().min(10),
  role: z.enum([ROLES.ADMINISTRATOR, ROLES.COORDINATOR, ROLES.HIKER, ROLES.VIEWER]),
  requiresGeolock: z.boolean().default(false),
});

const updateUserSchema = z.object({
  displayName: z.string().min(2).optional(),
  role: z.enum([ROLES.ADMINISTRATOR, ROLES.COORDINATOR, ROLES.HIKER, ROLES.VIEWER]).optional(),
  requiresGeolock: z.boolean().optional(),
  suspended: z.boolean().optional(),
});

const routeSchema = z.object({
  name: z.string().min(2),
  routeId: z.string().min(3),
  channelTopic: z.string().min(3),
  nodeCount: z.number().int().nonnegative(),
  status: z.string().min(2),
  approvedNodes: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

const geofenceSchema = z.object({
  name: z.string().min(2),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  radiusMeters: z.number().positive(),
  enabled: z.boolean(),
  outsideBehavior: z.enum(OUTSIDE_ZONE_BEHAVIOR),
  minAccuracyMeters: z.number().positive(),
  maxAgeSeconds: z.number().int().positive(),
});

const geolockCheckSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive(),
  timestamp: z.string(),
});

const alertSchema = z.object({
  type: z.enum(ALERT_TYPES),
  priority: z.enum(ALERT_PRIORITIES),
  locationDescription: z.string().min(2),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  message: z.string().min(2),
  confirmation: z.boolean().optional(),
});

const alertActionSchema = z.object({
  actionType: z.string().min(2),
  notes: z.string().min(2),
});

module.exports = {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  routeSchema,
  geofenceSchema,
  geolockCheckSchema,
  alertSchema,
  alertActionSchema,
};
