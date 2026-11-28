// Parses WhatsApp order-request messages pasted by the artists.
//
// The storefront generates this exact format (src/App.tsx orderMessage), so
// parsing is deterministic. Older messages may lack the order-number and
// address lines — both are optional. Anything unrecognised is surfaced in
// `problems` so nothing is silently dropped; the artist fixes it in the form.

export interface ParsedItem {
  variantId: string
  sizeLabel: string | null // null = single-size product, resolved from catalog
  quantity: number
  customArtworkId?: string
}

export interface ParsedOrder {
  number: string | null
  name: string
  phone: string
  deliveryType: 'binyamina' | 'sde-nehemia' | 'delivery'
  city: string
  street: string
  notes: string
  items: ParsedItem[]
  problems: string[]
}

const DELIVERY_MAP: Record<string, ParsedOrder['deliveryType']> = {
  'איסוף עצמי מבנימינה': 'binyamina',
  'איסוף עצמי משדה נחמיה': 'sde-nehemia',
  'משלוח בתיאור לפי איזור מגורים': 'delivery',
}

export function parseWhatsAppOrder(raw: string): ParsedOrder {
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  const parsed: ParsedOrder = {
    number: null, name: '', phone: '', deliveryType: 'binyamina',
    city: '', street: '', notes: '', items: [], problems: [],
  }
  let inNotes = false

  for (const line of lines) {
    if (!line) { if (inNotes) parsed.notes += '\n'; continue }

    if (line.startsWith('אבקש אישור')) { inNotes = false; continue }
    if (inNotes) { parsed.notes += (parsed.notes ? '\n' : '') + line; continue }

    if (line.startsWith('שלום, אשמח לבדוק הזמנה')) continue

    const numberMatch = line.match(/^מספר הזמנה:\s*(.+)$/)
    if (numberMatch) { parsed.number = numberMatch[1].trim(); continue }

    const nameMatch = line.match(/^שם:\s*(.+)$/)
    if (nameMatch) { parsed.name = nameMatch[1].trim(); continue }

    const phoneMatch = line.match(/^טלפון:\s*(.+)$/)
    if (phoneMatch) { parsed.phone = phoneMatch[1].trim(); continue }

    const addressMatch = line.match(/^כתובת למשלוח:\s*עיר\s*(.+?),\s*רחוב\s*(.+)$/)
    if (addressMatch) { parsed.city = addressMatch[1].trim(); parsed.street = addressMatch[2].trim(); continue }

    const deliveryMatch = line.match(/^אספקה:\s*(.+)$/)
    if (deliveryMatch) {
      const delivery = DELIVERY_MAP[deliveryMatch[1].trim()]
      if (delivery) parsed.deliveryType = delivery
      else parsed.problems.push(`שיטת אספקה לא מוכרת: ${line}`)
      continue
    }

    const notesMatch = line.match(/^הערות:\s*(.*)$/m)
    if (notesMatch) { inNotes = true; if (notesMatch[1].trim()) parsed.notes = notesMatch[1].trim(); continue }

    if (line.startsWith('סכום מוצרים:')) continue

    // Item lines end with a code and a quantity×price pattern.
    if (line.includes(' | ') && /קוד/.test(line)) {
      const item = parseItemLine(line)
      if (item) { parsed.items.push(item); continue }
    }

    parsed.problems.push(line)
  }

  if (!parsed.name) parsed.problems.unshift('לא זוהה שם לקוח בהודעה.')
  if (!parsed.items.length) parsed.problems.unshift('לא זוהו פריטים בהודעה.')
  return parsed
}

function parseItemLine(line: string): ParsedItem | null {
  const custom = line.match(/קוד כלי:\s*([a-z0-9_-]+)\s*\|\s*קוד ציור:\s*([a-z0-9_-]+)/)
  const plain = custom ? null : line.match(/קוד:\s*([a-z0-9_-]+)/)
  const variantId = custom?.[1] ?? plain?.[1]
  if (!variantId) return null

  const quantity = line.match(/\|\s*(\d+)\s*×\s*\d+\s*₪/)
  if (!quantity) return null

  const size = line.match(/\|\s*מידה:\s*([^|]+?)\s*\|/)

  return {
    variantId,
    sizeLabel: size ? size[1].trim() : null,
    quantity: Number(quantity[1]),
    ...(custom?.[2] ? { customArtworkId: custom[2] } : {}),
  }
}
