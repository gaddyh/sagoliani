// Row types mirroring supabase/migrations/0001_init.sql.

export type OrderStatus =
  | 'request' | 'awaiting_confirmation' | 'confirmed' | 'in_production'
  | 'ready' | 'completed' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'refunded'
export type DeliveryType = 'binyamina' | 'sde-nehemia' | 'delivery'
export type Material = 'smooth' | 'speckled'
export type PrintStatus = 'not_needed' | 'pending_mapping' | 'ready_to_print' | 'printed' | 'print_failed'
export type UnitQuality = 'pending' | 'passed' | 'attention'
export type UnitLifecycle = 'active' | 'delivered' | 'scrapped'

export const orderStatusLabel: Record<OrderStatus, string> = {
  request: 'בקשה חדשה',
  awaiting_confirmation: 'ממתין לאישור הלקוח',
  confirmed: 'מאושר',
  in_production: 'בייצור',
  ready: 'מוכן למסירה',
  completed: 'הושלם',
  cancelled: 'בוטל',
}

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  unpaid: 'טרם שולם', deposit: 'מקדמה', paid: 'שולם', refunded: 'הוחזר',
}

export const deliveryTypeLabel: Record<DeliveryType, string> = {
  binyamina: 'איסוף עצמי מבנימינה',
  'sde-nehemia': 'איסוף עצמי משדה נחמיה',
  delivery: 'משלוח בתיאום לפי איזור מגורים',
}

export const materialLabel: Record<Material, string> = { smooth: 'חלק', speckled: 'מנוקד' }

export const printStatusLabel: Record<PrintStatus, string> = {
  not_needed: 'אין צורך בהדפסה',
  pending_mapping: 'ממתין להכנת שילוב',
  ready_to_print: 'מוכן להדפסה',
  printed: 'הודפס',
  print_failed: 'הדפסה נכשלה',
}

export const qualityLabel: Record<UnitQuality, string> = {
  pending: 'בתהליך', passed: 'עבר בקרה', attention: 'דורש טיפול',
}

export const lifecycleLabel: Record<UnitLifecycle, string> = {
  active: 'פעיל', delivered: 'נמסר', scrapped: 'פסול',
}

export interface OrderRow {
  id: string
  number: string
  source: string
  status: OrderStatus
  needs_attention: boolean
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  delivery_type: DeliveryType
  city: string | null
  street: string | null
  expected_delivery_date: string | null
  discount_ils: number
  payment_status: PaymentStatus
  customer_notes: string | null
  internal_notes: string | null
  captured_at: string
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

export interface OrderItemRow {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  size_label: string
  material: Material
  artwork_id: string | null
  product_name_snapshot: string
  artwork_name_snapshot: string | null
  unit_price_ils: number
  quantity: number
  created_at: string
}

export interface AllocationRow {
  id: string
  order_item_id: string
  ceramic_unit_id: string
  print_status: PrintStatus | null
  printed_mapping_version_id: string | null
  printed_at: string | null
  allocated_at: string
  released_at: string | null
  release_reason: string | null
  ceramic_units?: UnitRow | null
}

export interface UnitRow {
  id: string
  product_id: string
  size_label: string
  material: Material
  stage_id: number
  applied_artwork_id: string | null
  applied_mapping_version_id: string | null
  quality: UnitQuality
  lifecycle: UnitLifecycle
  notes: string | null
  created_at: string
}

export interface ProductRow {
  id: string
  name: string
  description: string | null
  category: string | null
  uses: string | null
  min_desired_inventory: number
  is_active: boolean
  sort_order: number
}

export interface SizeRow {
  product_id: string
  label: string
  price_ils: number
  print_width_cm: number | null
  print_height_cm: number | null
}

export interface VariantRow {
  id: string
  product_id: string
  material: Material
  artwork_id: string | null
  display_name: string
  images: string[]
  image_artwork_names: string[] | null
  is_published: boolean
}

export interface ArtworkRow {
  id: string
  name: string
  artist: string | null
  description: string | null
  preview_path: string | null
  original_path: string | null
  is_active: boolean
  show_in_gallery: boolean
  notes: string | null
}

export interface StageRow {
  id: number
  name_he: string
  kind: string
  requires_kiln: boolean
  sort_order: number
}

export interface OrderEventRow {
  id: string
  order_id: string
  type: string
  from_status: string | null
  to_status: string | null
  actor: string | null
  notes: string | null
  at: string
}
