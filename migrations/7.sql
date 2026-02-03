-- Empleados por tenant
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_employees_tenant_id ON employees(tenant_id);

-- Servicios que puede realizar cada empleado (N:N)
CREATE TABLE employee_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE(employee_id, service_id)
);

CREATE INDEX idx_employee_services_employee_id ON employee_services(employee_id);
CREATE INDEX idx_employee_services_service_id ON employee_services(service_id);

-- Horarios de trabajo por empleado (por día de la semana)
CREATE TABLE employee_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_employee_schedules_employee_id ON employee_schedules(employee_id);

-- Días no disponibles (vacaciones, ausencias)
CREATE TABLE employee_time_off (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_employee_time_off_employee_id ON employee_time_off(employee_id);
CREATE INDEX idx_employee_time_off_dates ON employee_time_off(date_from, date_to);

-- Asignar cita a un empleado (opcional; null = sin asignar / lógica legacy)
ALTER TABLE appointments ADD COLUMN employee_id INTEGER;

CREATE INDEX idx_appointments_employee_id ON appointments(employee_id);
