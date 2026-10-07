INSERT INTO users (email, display_name, password_hash, role, requires_geolock, suspended)
VALUES
('admin@hikingwithconfidence.local', 'System Administrator', '$2b$10$/nKzwyoiLuWAh4bXPhpWLOxRIvR.S4Lr/CA3MOWy5Ctfts6yDt4XS', 'Administrator', FALSE, FALSE),
('coordinator@hikingwithconfidence.local', 'Route Coordinator', '$2b$10$/nKzwyoiLuWAh4bXPhpWLOxRIvR.S4Lr/CA3MOWy5Ctfts6yDt4XS', 'Coordinator', TRUE, FALSE),
('hiker@hikingwithconfidence.local', 'Demo Hiker', '$2b$10$/nKzwyoiLuWAh4bXPhpWLOxRIvR.S4Lr/CA3MOWy5Ctfts6yDt4XS', 'Hiker', TRUE, FALSE),
('viewer@hikingwithconfidence.local', 'Viewer User', '$2b$10$/nKzwyoiLuWAh4bXPhpWLOxRIvR.S4Lr/CA3MOWy5Ctfts6yDt4XS', 'Viewer', FALSE, FALSE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO mesh_routes (name, route_id, channel_topic, node_count, status, approved_nodes, active)
VALUES ('Hiking with Confidence Demo Route', 'HWC-DEMO-ROUTE-01', 'meshtastic/hwc/demo', 12, 'Nominal', '["!abcd1234", "!efgh5678"]'::jsonb, TRUE)
ON CONFLICT (route_id) DO NOTHING;

INSERT INTO geofences (name, center_latitude, center_longitude, radius_meters, enabled, outside_behavior, min_accuracy_meters, max_age_seconds)
VALUES ('Demo Trail Safety Zone', 37.8651, -119.5383, 3500, TRUE, 'warn', 75, 300)
ON CONFLICT DO NOTHING;
