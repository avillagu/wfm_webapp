-- =====================================================
-- Migración: Actualizar tabla users con columnas de actividad
-- Ejecutar en la base de datos existente
-- =====================================================

-- Agregar columnas de actividad si no existen
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_activity VARCHAR(50) DEFAULT 'Fuera de turno';
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Actualizar usuarios existentes para que tengan un valor por defecto
UPDATE users SET current_activity = 'Fuera de turno' WHERE current_activity IS NULL;

-- Verificar columnas agregadas
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('current_activity', 'activity_updated_at', 'activity_start_time');
