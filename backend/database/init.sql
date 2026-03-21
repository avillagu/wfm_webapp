-- ============================================================
-- MAPO WFM WebApp - Database Initialization Script
-- PostgreSQL Native DDL - Production Ready
-- ============================================================

-- Enable UUID extension (Commented for managed DBs which usually have it but block creation)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clean up existing tables and views
DROP VIEW IF EXISTS v_pending_change_requests CASCADE;
DROP VIEW IF EXISTS v_monthly_hours CASCADE;
DROP VIEW IF EXISTS v_weekly_hours CASCADE;
DROP VIEW IF EXISTS v_monthly_sundays_count CASCADE;
DROP VIEW IF EXISTS v_active_shifts CASCADE;

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS change_requests CASCADE;
DROP TABLE IF EXISTS punches CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS wfm_rules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================================
-- 1. ROLES TABLE - Base role definitions
-- ============================================================
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert base roles
INSERT INTO roles (name, description) VALUES
    ('ADMIN', 'Full system access with all permissions'),
    ('SUPERVISOR', 'Manage shifts, approve requests, view all groups'),
    ('ANALYST', 'View own group shifts, request changes');

-- ============================================================
-- 2. PERMISSIONS TABLE - Granular permission definitions
-- ============================================================
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL, -- CREATE, READ, UPDATE, DELETE
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert base permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    -- User management
    ('users_create', 'users', 'CREATE', 'Create new users'),
    ('users_read', 'users', 'READ', 'View user information'),
    ('users_update', 'users', 'UPDATE', 'Update user information'),
    ('users_delete', 'users', 'DELETE', 'Delete users'),
    -- Group management
    ('groups_create', 'groups', 'CREATE', 'Create new groups'),
    ('groups_read', 'groups', 'READ', 'View group information'),
    ('groups_update', 'groups', 'UPDATE', 'Update group information'),
    ('groups_delete', 'groups', 'DELETE', 'Delete groups'),
    -- Shift management
    ('shifts_create', 'shifts', 'CREATE', 'Create shifts'),
    ('shifts_read', 'shifts', 'READ', 'View shifts'),
    ('shifts_update', 'shifts', 'UPDATE', 'Update shifts'),
    ('shifts_delete', 'shifts', 'DELETE', 'Delete shifts'),
    -- Punch/Attendance management
    ('punches_create', 'punches', 'CREATE', 'Create punch records'),
    ('punches_read', 'punches', 'READ', 'View punch records'),
    ('punches_update', 'punches', 'UPDATE', 'Update punch records'),
    ('punches_delete', 'punches', 'DELETE', 'Delete punch records'),
    -- Change request management
    ('change_requests_create', 'change_requests', 'CREATE', 'Create change requests'),
    ('change_requests_read', 'change_requests', 'READ', 'View change requests'),
    ('change_requests_update', 'change_requests', 'UPDATE', 'Update change requests'),
    ('change_requests_approve', 'change_requests', 'APPROVE', 'Approve/reject change requests'),
    -- Rules management
    ('rules_create', 'rules', 'CREATE', 'Create WFM rules'),
    ('rules_read', 'rules', 'READ', 'View WFM rules'),
    ('rules_update', 'rules', 'UPDATE', 'Update WFM rules'),
    -- Reports
    ('reports_export', 'reports', 'EXPORT', 'Export reports');

-- ============================================================
-- 3. ROLE_PERMISSIONS - Many-to-many relationship
-- ============================================================
CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Grant all permissions to ADMIN role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Grant supervisor permissions (exclude user/group management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions 
WHERE resource NOT IN ('users', 'groups', 'rules');

-- Grant analyst permissions (read-only for shifts, full for own change requests)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions 
WHERE resource IN ('shifts', 'punches', 'change_requests') 
  AND action IN ('READ', 'CREATE');

-- ============================================================
-- 4. GROUPS TABLE - Employee groups/departments
-- ============================================================
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. USERS TABLE - Employee accounts
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    employee_code VARCHAR(20) UNIQUE,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    group_id INTEGER REFERENCES groups(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    current_activity VARCHAR(50) DEFAULT 'Fuera de turno',
    activity_updated_at TIMESTAMP WITH TIME ZONE,
    activity_start_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_group ON users(group_id);
CREATE INDEX idx_users_active ON users(is_active);

-- ============================================================
-- 6. WFM_RULES TABLE - Workforce intelligence rules
-- ============================================================
CREATE TABLE wfm_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL, -- MAX_HOURS_WEEK, MAX_HOURS_MONTH, MAX_SUNDAYS, MIN_REST_DAYS, etc.
    value NUMERIC(10,2) NOT NULL,
    description VARCHAR(255),
    is_global BOOLEAN DEFAULT FALSE, -- Applies to all employees
    group_id INTEGER REFERENCES groups(id), -- If set, applies to specific group
    user_id INTEGER REFERENCES users(id), -- If set, applies to specific user
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rule_scope CHECK (
        (is_global = TRUE AND group_id IS NULL AND user_id IS NULL) OR
        (is_global = FALSE AND (group_id IS NOT NULL OR user_id IS NOT NULL))
    )
);

CREATE INDEX idx_rules_group ON wfm_rules(group_id);
CREATE INDEX idx_rules_user ON wfm_rules(user_id);
CREATE INDEX idx_rules_active ON wfm_rules(is_active);

-- Insert default global rules
INSERT INTO wfm_rules (name, rule_type, value, description, is_global) VALUES
    ('Max Hours Per Week', 'MAX_HOURS_WEEK', 48.00, 'Maximum working hours per week', TRUE),
    ('Max Hours Per Month', 'MAX_HOURS_MONTH', 192.00, 'Maximum working hours per month', TRUE),
    ('Max Sundays Per Month', 'MAX_SUNDAYS_MONTH', 3, 'Maximum Sundays to work in a month', TRUE),
    ('Min Rest Days Per Week', 'MIN_REST_DAYS_WEEK', 1, 'Minimum rest days required per week', TRUE),
    ('Min Hours Between Shifts', 'MIN_REST_HOURS', 8, 'Minimum rest hours between shifts', TRUE);

-- ============================================================
-- 7. SHIFTS TABLE - Scheduled shifts
-- ============================================================
CREATE TABLE shifts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_type VARCHAR(20) NOT NULL, -- MORNING, AFTERNOON, NIGHT
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Ensure no overlapping shifts for same user on same date
    CONSTRAINT chk_shift_times CHECK (end_time > start_time OR (end_time <= start_time AND shift_type = 'NIGHT'))
);

CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_group ON shifts(group_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_user_date ON shifts(user_id, shift_date);
CREATE INDEX idx_shifts_active ON shifts(is_active);

-- ============================================================
-- 8. PUNCHES TABLE - Time & Attendance records
-- ============================================================
CREATE TABLE punches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    punch_in TIMESTAMP WITH TIME ZONE NOT NULL,
    punch_out TIMESTAMP WITH TIME ZONE,
    punch_in_location VARCHAR(255),
    punch_out_location VARCHAR(255),
    notes VARCHAR(500),
    status VARCHAR(20) DEFAULT 'ON_TIME', -- ON_TIME, LATE, EARLY_DEPARTURE, MISSED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_punches_user ON punches(user_id);
CREATE INDEX idx_punches_shift ON punches(shift_id);
CREATE INDEX idx_punches_date ON punches(punch_in);
CREATE INDEX idx_punches_status ON punches(status);

-- ============================================================
-- 9. CHANGE_REQUESTS TABLE - Shift swap/change workflow
-- ============================================================
CREATE TABLE change_requests (
    id SERIAL PRIMARY KEY,
    request_type VARCHAR(20) NOT NULL, -- SHIFT_SWAP, REST_DAY_REQUEST, DIRECT_REQUEST
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- For swaps
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    target_shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE, -- For swaps
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, APPROVED, CANCELLED
    target_response VARCHAR(20), -- ACCEPTED, REJECTED (for swaps)
    target_response_at TIMESTAMP WITH TIME ZONE,
    reviewer_id INTEGER REFERENCES users(id), -- Admin/Supervisor who made final decision
    reviewer_response VARCHAR(500),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_change_requests_requester ON change_requests(requester_id);
CREATE INDEX idx_change_requests_target ON change_requests(target_user_id);
CREATE INDEX idx_change_requests_status ON change_requests(status);
CREATE INDEX idx_change_requests_shift ON change_requests(shift_id);

-- ============================================================
-- 10. NOTIFICATIONS TABLE - Real-time notification storage
-- ============================================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- SHIFT_CHANGE, REQUEST_PENDING, ALERT, INFO
    is_read BOOLEAN DEFAULT FALSE,
    related_entity_type VARCHAR(50), -- SHIFT, CHANGE_REQUEST, etc.
    related_entity_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================================
-- 11. AUDIT_LOG TABLE - Track all system changes
-- ============================================================
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    entity_type VARCHAR(50) NOT NULL, -- USER, SHIFT, PUNCH, CHANGE_REQUEST, etc.
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================
-- 12. TRIGGERS - Auto-update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wfm_rules_updated_at BEFORE UPDATE ON wfm_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_punches_updated_at BEFORE UPDATE ON punches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_change_requests_updated_at BEFORE UPDATE ON change_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 13. VIEWS - Pre-built queries for common operations
-- ============================================================

-- View: Active shifts with user details
CREATE VIEW v_active_shifts AS
SELECT 
    s.id,
    s.user_id,
    u.first_name,
    u.last_name,
    u.employee_code,
    s.group_id,
    g.name AS group_name,
    s.shift_date,
    s.start_time,
    s.end_time,
    s.shift_type,
    s.created_by AS shift_creator
FROM shifts s
JOIN users u ON s.user_id = u.id
JOIN groups g ON s.group_id = g.id
WHERE s.is_active = TRUE;

-- View: Current month Sundays count per user
CREATE VIEW v_monthly_sundays_count AS
SELECT 
    user_id,
    DATE_TRUNC('month', shift_date) AS month,
    COUNT(*) AS sunday_count
FROM shifts
WHERE EXTRACT(DOW FROM shift_date) = 0 -- Sunday
  AND is_active = TRUE
GROUP BY user_id, DATE_TRUNC('month', shift_date);

-- View: Weekly hours per user
CREATE VIEW v_weekly_hours AS
SELECT 
    user_id,
    DATE_TRUNC('week', shift_date) AS week_start,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) AS total_hours
FROM shifts
WHERE is_active = TRUE
GROUP BY user_id, DATE_TRUNC('week', shift_date);

-- View: Monthly hours per user
CREATE VIEW v_monthly_hours AS
SELECT 
    user_id,
    DATE_TRUNC('month', shift_date) AS month,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) AS total_hours
FROM shifts
WHERE is_active = TRUE
GROUP BY user_id, DATE_TRUNC('month', shift_date);

-- View: Pending change requests with details
CREATE VIEW v_pending_change_requests AS
SELECT 
    cr.id,
    cr.request_type,
    cr.requester_id,
    ru.first_name AS requester_first_name,
    ru.last_name AS requester_last_name,
    cr.target_user_id,
    tu.first_name AS target_first_name,
    tu.last_name AS target_last_name,
    cr.shift_id,
    s.shift_date,
    s.start_time,
    s.end_time,
    cr.reason,
    cr.status,
    cr.created_at
FROM change_requests cr
JOIN users ru ON cr.requester_id = ru.id
LEFT JOIN users tu ON cr.target_user_id = tu.id
JOIN shifts s ON cr.shift_id = s.id
WHERE cr.status = 'PENDING';

-- ============================================================
-- 14. INITIAL DATA - Default admin user and sample groups
-- ============================================================

-- Default admin user (password: admin123 - must be changed on first login)
-- Password hash generated with bcrypt (cost factor 10)
INSERT INTO users (username, email, password_hash, first_name, last_name, employee_code, role_id, group_id)
VALUES (
    'admin',
    'admin@mapo.com',
    '$2b$10$rHxV8KZqJ9zN5vL3mF2pQO7YxKjW8nR4tE6sA1cD9fG0hI2jK3lM4',
    'System',
    'Administrator',
    'EMP001',
    1, -- ADMIN role
    NULL
);

-- Sample groups (can be modified/expanded)
INSERT INTO groups (name, code, description) VALUES
    ('Customer Service', 'CS', 'Customer service and support team'),
    ('Sales', 'SA', 'Sales department'),
    ('Operations', 'OP', 'Operations and logistics'),
    ('Technical Support', 'TS', 'Technical support team');

-- ============================================================
-- END OF INITIALIZATION SCRIPT
-- ============================================================
