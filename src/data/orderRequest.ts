// Reliable storefront -> studio order-request capture.
//
// Design (v3):
//  - Plain fetch against the single public RPC; supabase-js is never part of
//    the public bundle.
//  - The caller supplies a stable idempotency key (persisted with the cart)
//    so retries, double clicks and page reloads never create duplicates.
//  - When Supabase env vars are absent (site not yet wired), the caller falls
//    back to the legacy WhatsApp-only flow with no error UI.

export interface OrderRequestItem {
  variant_id: string
  size_label: string
  quantity: number
  artwork_id?: string
}

export interface OrderRequestPayload {
  name: string
  phone: string
  delivery_type: string
  city?: string
  street?: string
  notes?: string
  items: OrderRequestItem[]
}

export interface OrderCaptureResult {
  order_id: string
  number: string
  replayed: boolean
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isCaptureConfigured(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY)
}

export async function captureOrderRequest(
  payload: OrderRequestPayload,
  idempotencyKey: string,
): Promise<OrderCaptureResult> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_order_request`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_payload: payload, p_key: idempotencyKey }),
  })
  if (!response.ok) {
    // Server-side validation errors arrive as {message}; network failures throw
    // before this point. Both surfaces are handled by the caller's retry UI.
    let message = 'שגיאה לא צפויה בשמירת הבקשה.'
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') message = body.message
    } catch { /* not JSON — keep the generic message */ }
    throw new Error(message)
  }
  return response.json() as Promise<OrderCaptureResult>
}
