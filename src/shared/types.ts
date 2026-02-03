export interface Tenant {
  id: number;
  slug: string;
  owner_user_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessConfig {
  id: number;
  tenant_id: number;
  business_name: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  google_maps_url: string | null;
  profile_image_url: string | null;
  header_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceVariant {
  id: number;
  service_id: number;
  name: string;
  price: number;
  duration_minutes: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: number;
  tenant_id: number;
  title: string;
  description: string | null;
  price: number | null;
  duration_minutes: number | null;
  max_simultaneous_bookings: number;
  is_active: boolean;
  main_image_url: string | null;
  created_at: string;
  updated_at: string;
  images?: ServiceImage[]; // Optional: images array when fetching with images
  variants?: ServiceVariant[]; // Optional: variantes cuando el servicio tiene opciones (ej. mujer/hombre/niño)
}

export interface ServiceImage {
  id: number;
  service_id: number;
  image_url: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SocialNetwork {
  id: number;
  tenant_id: number;
  platform: string;
  url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: number;
  tenant_id: number;
  method_type: string;
  account_number: string | null;
  clabe: string | null;
  card_number: string | null;
  account_holder_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySchedule {
  id: number;
  service_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleException {
  id: number;
  tenant_id: number;
  service_id: number | null; // null = aplica a todos los servicios
  exception_date: string; // DATE format YYYY-MM-DD
  start_time: string | null; // null = todo el día
  end_time: string | null; // null = solo la hora específica
  is_blocked: boolean; // true = bloqueado, false = permitido
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  tenant_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeService {
  id: number;
  employee_id: number;
  service_id: number;
  created_at: string;
}

export interface EmployeeSchedule {
  id: number;
  employee_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeTimeOff {
  id: number;
  employee_id: number;
  date_from: string;
  date_to: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  tenant_id: number;
  service_id: number;
  service_variant_id: number | null;
  employee_id: number | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisualCustomization {
  id: number;
  tenant_id: number;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  background_type: string;
  background_color: string;
  background_gradient_start: string | null;
  background_gradient_end: string | null;
  background_image_url: string | null;
  card_background_color: string | null;
  card_border_color: string | null;
  service_title_color: string | null;
  time_text_color: string | null;
  price_color: string | null;
  created_at: string;
  updated_at: string;
}
