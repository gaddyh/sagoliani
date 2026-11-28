import { deliveryTypeLabel, type OrderRow, type OrderItemRow, type PaymentStatus } from './types'

// Prefilled WhatsApp message templates. The artists review and edit the text
// inside WhatsApp before sending — nothing is sent automatically.

export function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return digits
  return '972' + digits.replace(/^0/, '')
}

export function waLink(phone: string | null | undefined, text: string): string {
  const target = phone ? waPhone(phone) : '972522486836' // fallback: Efrat
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`
}

export function orderTotal(order: OrderRow, items: OrderItemRow[]): number {
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price_ils) * item.quantity, 0)
  return subtotal - Number(order.discount_ils)
}

function itemsText(items: OrderItemRow[]): string {
  return items
    .map((item) => `• ${item.product_name_snapshot}${item.size_label ? ` (${item.size_label})` : ''}${item.artwork_name_snapshot ? ` · ציור ${item.artwork_name_snapshot}` : ''} × ${item.quantity}`)
    .join('\n')
}

export function confirmationMessage(order: OrderRow, items: OrderItemRow[]): string {
  return [
    `שלום ${order.customer_name}! אישרנו את הזמנתך ${order.number} 🌿`,
    '',
    itemsText(items),
    '',
    `סה״כ לתשלום: ${orderTotal(order, items)} ₪ (לא כולל משלוח)`,
    `אופן קבלה: ${deliveryTypeLabel[order.delivery_type]}`,
    order.expected_delivery_date ? `מסירה צפויה: ${new Date(order.expected_delivery_date).toLocaleDateString('he-IL')}` : '',
    '',
    'להשלמת התשלום נשלח לך קישור PayBox. אחרי התשלום נתחיל בהכנה 🎨',
    'עירית ואפרת · ART IN CLAY',
  ].filter(Boolean).join('\n')
}

export function readyMessage(order: OrderRow, items: OrderItemRow[]): string {
  return [
    `שלום ${order.customer_name}! ההזמנה ${order.number} מוכנה 🎉`,
    '',
    itemsText(items),
    '',
    order.delivery_type === 'delivery'
      ? 'נתאם משלוח בהקדם — מתי מתאים לך?'
      : `אפשר לאסוף מאיתנו: ${deliveryTypeLabel[order.delivery_type]}`,
    'תודה ושיהיה בתיאבון!',
    'עירית ואפרת · ART IN CLAY',
  ].join('\n')
}

export function paymentReminderMessage(order: OrderRow): string {
  return [
    `שלום ${order.customer_name}, תזכורת קטנה 😊`,
    `הזמנה ${order.number} ממתינה להשלמת תשלום (${orderTotal(order, [])} ₪) כדי שנתחיל בהכנה.`,
    'נשמח לעדכון. תודה!',
    'עירית ואפרת · ART IN CLAY',
  ].join('\n')
}

export const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'טרם שולם' },
  { value: 'deposit', label: 'מקדמה' },
  { value: 'paid', label: 'שולם' },
  { value: 'refunded', label: 'הוחזר' },
]
