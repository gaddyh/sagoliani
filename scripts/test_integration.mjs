// Mandatory integration tests for the studio admin (run against the local
// Supabase stack). Covers the v3 hardening requirements end to end:
// atomic/idempotent capture, concurrent submissions, anonymous denials,
// allocation priority and concurrency, kiln batch idempotency, readiness
// calculation, replacement, and public-signup lockdown.
//
// Requires: `supabase start`, `node scripts/seed_catalog.mjs`.

import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
    }
  } catch { /* optional */ }
}
loadEnvLocal()

const BASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY
if (!ANON || !SERVICE) {
  console.error('Missing VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const PHONE = '0529990001'
const OTHER_PHONE = '0529990002'
let artistToken = ''
let passed = 0
let failed = 0

function ok(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`✔ ${name}`) }
  else { failed += 1; console.error(`✘ ${name} ${detail}`) }
}

async function api(path, { method = 'GET', token, body, service = false } = {}) {
  const bearer = service ? SERVICE : (token || artistToken || ANON)
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { apikey: bearer, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  let json = null
  try { json = await response.json() } catch { /* empty body */ }
  return { status: response.status, json }
}

async function rpc(name, params, token = artistToken) {
  return api(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: params })
}

const ANY = 'id=neq.00000000-0000-0000-0000-000000000000'

async function cleanup() {
  // Orders cascade to items and allocations; batches cascade to their items.
  // Only TEST artifacts are deleted: imported real inventory (import_ref is
  // not null) is never touched. PostgREST requires a WHERE clause on DELETE;
  // failures are loud on purpose.
  const deletions = [
    `/rest/v1/orders?customer_phone=eq.${PHONE}`,
    `/rest/v1/orders?customer_phone=eq.${OTHER_PHONE}`,
    '/rest/v1/orders?customer_phone=eq.0508675084',
    '/rest/v1/orders?customer_phone=eq.0520000001',
    '/rest/v1/orders?customer_phone=eq.0520000002',
    '/rest/v1/orders?customer_phone=eq.0501234567',
    '/rest/v1/production_events?kiln_batch_id=not.is.null',
    `/rest/v1/kiln_batches?${ANY}`,
    '/rest/v1/ceramic_units?import_ref=is.null',
    `/rest/v1/artwork_mapping_versions?product_id=eq.yael-bowl&artwork_id=eq.gallery-12`,
    `/rest/v1/customers?phone=eq.${PHONE}`,
    `/rest/v1/customers?phone=eq.${OTHER_PHONE}`,
  ]
  for (const path of deletions) {
    const { status } = await api(path, { method: 'DELETE', service: true })
    if (status >= 400) throw new Error(`cleanup failed (${status}): ${path}`)
  }
}

const payload = (overrides = {}) => ({
  name: 'מבחן אינטגרציה',
  phone: PHONE,
  delivery_type: 'binyamina',
  items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 1 }],
  ...overrides,
})

// ---------------------------------------------------------------------------
async function signIn() {
  const response = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'irit@sagoliani.art', password: 'studio-dev-2026' }),
  })
  artistToken = (await response.json()).access_token
  ok('artist signs in with email + password', Boolean(artistToken))
}

async function publicSignupDisabled() {
  const response = await fetch(`${BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'intruder@example.com', password: 'password123' }),
  })
  const body = await response.json()
  ok('public signup is disabled', response.status >= 400 || body.error, JSON.stringify(body))
}

async function captureTests() {
  const key1 = crypto.randomUUID()
  const first = await rpc('submit_order_request', { p_payload: payload(), p_key: key1 }, ANON)
  ok('atomic capture creates one order with server number', first.status === 200 && /^R-\d+$/.test(first.json.number))

  const { json: orderRows } = await api(`/rest/v1/orders?idempotency_key=eq.${key1}&select=*`)
  const { json: itemRows } = await api(`/rest/v1/order_items?order_id=eq.${orderRows[0].id}&select=*`)
  const order = orderRows[0]
  ok('order + items stored atomically with canonical price', order && itemRows.length === 1 && Number(itemRows[0].unit_price_ils) === 165)
  ok('order items snapshot the artwork print dimensions', Number(itemRows[0].print_width_cm) === 12 && Number(itemRows[0].print_height_cm) === 15)
  ok('items without an explicit artwork get the vessel default', itemRows[0].artwork_id === 'gallery-12')

  const replay = await rpc('submit_order_request', { p_payload: payload(), p_key: key1 }, ANON)
  ok('idempotent replay returns the same order', replay.status === 200 && replay.json.replayed === true && replay.json.number === first.json.number)

  const mismatch = await rpc('submit_order_request', { p_payload: payload({ name: 'מישהו אחר' }), p_key: key1 }, ANON)
  ok('key reuse with different payload is rejected', mismatch.status !== 200)

  // Four concurrent submissions with the same key must converge on one order.
  const key2 = crypto.randomUUID()
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    rpc('submit_order_request', { p_payload: payload(), p_key: key2 }, ANON)))
  const ids = new Set(results.map((result) => result.json?.order_id))
  const { json: withKey2 } = await api(`/rest/v1/orders?idempotency_key=eq.${key2}&select=id`)
  ok('concurrent same-key submissions converge on one order', ids.size === 1 && withKey2?.length === 1)

  // Fill the per-phone hourly limit, then verify replays are never blocked.
  for (let i = 0; i < 3; i += 1) {
    await rpc('submit_order_request', { p_payload: payload(), p_key: crypto.randomUUID() }, ANON)
  }
  const limited = await rpc('submit_order_request', { p_payload: payload(), p_key: crypto.randomUUID() }, ANON)
  ok('per-phone rate limit trips after 3 submissions/hour', limited.status !== 200)
  const replayAfterLimit = await rpc('submit_order_request', { p_payload: payload(), p_key: key1 }, ANON)
  ok('idempotent replay is never blocked by rate limits', replayAfterLimit.status === 200 && replayAfterLimit.json.replayed === true)
  const other = await rpc('submit_order_request', {
    p_payload: payload({ phone: OTHER_PHONE }), p_key: crypto.randomUUID(),
  }, ANON)
  ok('rate limits are per-phone only (no global lockout)', other.status === 200)

  // Anonymous submissions never overwrite existing customer records.
  const { json: customerBefore } = await api(`/rest/v1/customers?phone=eq.${PHONE}&select=name`)
  await rpc('submit_order_request', {
    p_payload: payload({ name: 'שם מזויף' }), p_key: crypto.randomUUID(),
  }, ANON)
  const { json: customerAfter } = await api(`/rest/v1/customers?phone=eq.${PHONE}&select=name`)
  ok('anonymous submissions never mutate customer records', customerBefore[0].name === customerAfter[0].name)

  // Invalid payloads are rejected with clear errors and nothing stored.
  const badVariant = await rpc('submit_order_request', {
    p_payload: payload({ items: [{ variant_id: 'nope', size_label: 'קוטר 16', quantity: 1 }] }),
    p_key: crypto.randomUUID(),
  }, ANON)
  ok('unknown variant is rejected', badVariant.status !== 200 && /קיים בקטלוג/.test(badVariant.json?.message ?? ''))
  const badQuantity = await rpc('submit_order_request', {
    p_payload: payload({ items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 500 }] }),
    p_key: crypto.randomUUID(),
  }, ANON)
  ok('invalid quantity is rejected', badQuantity.status !== 200)
  const badPhone = await rpc('submit_order_request', {
    p_payload: payload({ phone: '1234' }), p_key: crypto.randomUUID(),
  }, ANON)
  ok('invalid phone is rejected', badPhone.status !== 200)
}

async function denialTests() {
  const select = await api('/rest/v1/orders?select=id', { token: ANON })
  ok('anonymous cannot read orders', (select.status === 200 && Array.isArray(select.json) && select.json.length === 0)
    || select.status === 401 || select.status === 403)
  const insert = await api('/rest/v1/orders', { method: 'POST', body: { number: 'X-1', source: 'manual', status: 'request', customer_name: 'x' } })
  ok('anonymous cannot insert orders directly', insert.status >= 400)
  const confirmAsAnon = await rpc('confirm_order', { p_order_id: crypto.randomUUID() }, ANON)
  ok('anonymous cannot execute artist RPCs', confirmAsAnon.status === 200 ? false : /אין הרשאה/.test(confirmAsAnon.json?.message ?? '') || confirmAsAnon.status === 403 || confirmAsAnon.status === 404)

  const patch = await api('/rest/v1/orders?number=eq.R-1042', { method: 'PATCH', body: { status: 'completed' } })
  ok('artists cannot update orders directly (RPC only)', patch.status >= 400)
  const unitInsert = await api('/rest/v1/ceramic_units', {
    method: 'POST',
    body: { product_id: 'yael-bowl', size_label: 'קוטר כ-25 ס״מ', material: 'speckled', stage_id: 1 },
  })
  ok('artists cannot insert ceramic units directly (RPC only)', unitInsert.status >= 400)
  const helpers = await rpc('resolve_mapping_version', { p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_artwork_id: 'gallery-12' })
  ok('internal helper functions are not callable', helpers.status === 404 || helpers.status === 403)
}

async function allocationTests() {
  // One finished artwork-specific unit, one generic at stage 5, one at stage 2.
  const finished = await rpc('create_units', { p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_quantity: 1, p_stage_id: 5, p_notes: 'integration finished' })
  const finishedIds = finished.json.unit_ids
  const artworkUnit = finishedIds[0]
  await rpc('apply_artwork', { p_unit_id: artworkUnit, p_artwork_id: 'gallery-12' })
  for (let stage = 6; stage <= 7; stage += 1) await rpc('advance_units_stage', { p_unit_ids: [artworkUnit], p_result: 'completed' })
  const { json: mapping } = await api('/rest/v1/ceramic_units?id=eq.' + artworkUnit + '&select=stage_id,quality,applied_artwork_id')
  ok('artwork application pins the artwork and advances the unit', mapping[0].stage_id === 8 && mapping[0].applied_artwork_id === 'gallery-12')

  const generic = await rpc('create_units', { p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_quantity: 2, p_stage_id: 5, p_notes: 'integration generic advanced' })
  const advancedIds = generic.json.unit_ids
  const early = await rpc('create_units', { p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_quantity: 1, p_stage_id: 2, p_notes: 'integration generic early' })
  const earlyIds = early.json.unit_ids

  // Mapping for the combination (wildcard size + exact material).
  const savedMapping = await rpc('save_mapping_version', {
    p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_artwork_id: 'gallery-12',
    p_print_width_cm: 12, p_print_height_cm: 15, p_rotation_deg: 0,
  })
  ok('mapping version is saved', savedMapping.status === 200)

  // Order A: 2 units — expects finished stock first, then the most advanced generic.
  const orderA = await rpc('create_order', { p_payload: {
    name: 'מבחן א', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 2, artwork_id: 'gallery-12' }],
  } })
  await rpc('confirm_order', { p_order_id: orderA.json.order_id })
  const { json: allocationsA } = await api(`/rest/v1/order_item_allocations?order_item_id=eq.${(await firstItemId(orderA.json.order_id))}&select=*,ceramic_units(stage_id,applied_artwork_id)`)
  const allocatedIds = allocationsA.map((row) => row.ceramic_unit_id)
  const finishedAlloc = allocationsA.find((row) => row.ceramic_unit_id === artworkUnit)
  const genericAlloc = allocationsA.find((row) => row.ceramic_unit_id !== artworkUnit)
  ok('finished artwork-specific stock is allocated first', allocatedIds.includes(artworkUnit))
  ok('most advanced generic stock is next', genericAlloc?.ceramic_units?.stage_id === 5)
  ok('finished stock needs no print', finishedAlloc?.print_status === 'not_needed')
  ok('mapping reuse marks the generic unit ready to print', genericAlloc?.print_status === 'ready_to_print')

  // Order B (1 unit) — parallel confirm against remaining stock.
  const orderB = await rpc('create_order', { p_payload: {
    name: 'מבחן ב', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 1, artwork_id: 'gallery-12' }],
  } })
  const orderC = await rpc('create_order', { p_payload: {
    name: 'מבחן ג', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 1, artwork_id: 'gallery-12' }],
  } })
  await Promise.all([
    rpc('confirm_order', { p_order_id: orderB.json.order_id }),
    rpc('confirm_order', { p_order_id: orderC.json.order_id }),
  ])
  const { json: duplicates } = await api('/rest/v1/order_item_allocations?released_at=is.null&select=ceramic_unit_id')
  const counts = new Map()
  for (const row of duplicates) counts.set(row.ceramic_unit_id, (counts.get(row.ceramic_unit_id) ?? 0) + 1)
  ok('concurrent confirmation never double-allocates a unit', [...counts.values()].every((count) => count === 1))
  ok('all existing stock is allocated before new units', duplicates.length === 4)

  // Missing mapping -> pending_mapping for a different artwork.
  const orderD = await rpc('create_order', { p_payload: {
    name: 'מבחן ד', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 1, artwork_id: 'gallery-09' }],
  } })
  await rpc('confirm_order', { p_order_id: orderD.json.order_id })
  const { json: allocationsD } = await api(`/rest/v1/order_item_allocations?order_item_id=eq.${(await firstItemId(orderD.json.order_id))}&select=print_status,ceramic_units(stage_id)`)
  ok('shortfall creates a new unit at stage 1', allocationsD[0]?.ceramic_units?.stage_id === 1)
  ok('missing mapping leaves the print pending', allocationsD[0]?.print_status === 'pending_mapping')

  // Printing pins the mapping version.
  const printTarget = genericAlloc ?? allocationsA.find((row) => row.print_status === 'ready_to_print')
  await rpc('mark_printed', { p_allocation_ids: [printTarget.id] })
  const { json: printed } = await api(`/rest/v1/order_item_allocations?id=eq.${printTarget.id}&select=print_status,printed_mapping_version_id`)
  ok('printing pins the mapping version at print time', printed[0].print_status === 'printed' && printed[0].printed_mapping_version_id)

  // Cancelling order B releases its unit back to the pool.
  await rpc('cancel_order', { p_order_id: orderB.json.order_id, p_reason: 'integration' })
  const { json: afterCancel } = await api('/rest/v1/order_item_allocations?released_at=is.null&select=ceramic_unit_id')
  ok('cancellation releases reserved inventory', afterCancel.length === 4)

  return { orderA, orderC, orderD, earlyIds }
}

async function kilnTests(context) {
  // Two fresh units waiting for their first firing.
  const units = await rpc('create_units', { p_product_id: 'yael-bowl', p_size_label: 'קוטר כ-25 ס״מ', p_material: 'speckled', p_quantity: 2, p_stage_id: 2, p_notes: 'integration kiln' })
  const [k1, k2] = units.json.unit_ids

  const batch = await rpc('create_kiln_batch', { p_stage_id: 2, p_unit_ids: [k1, k2] })
  ok('kiln batch is created for waiting units', batch.status === 200)
  const doubleBooked = await rpc('create_kiln_batch', { p_stage_id: 2, p_unit_ids: [k1] })
  ok('a unit cannot join two active batches', doubleBooked.status !== 200)

  await rpc('start_kiln_batch', { p_batch_id: batch.json })
  const first = await rpc('complete_kiln_batch', { p_batch_id: batch.json, p_results: { [k2]: 'rejected' } })
  ok('batch completion reports per-unit results', first.status === 200 && first.json.ok === 1 && first.json.rejected === 1)
  const { json: after } = await api(`/rest/v1/ceramic_units?id=in.(${k1},${k2})&select=id,stage_id,lifecycle,quality`)
  ok('successful unit advances automatically', after.find((unit) => unit.id === k1).stage_id === 3)
  ok('rejected unit is scrapped', after.find((unit) => unit.id === k2).lifecycle === 'scrapped')

  const again = await rpc('complete_kiln_batch', { p_batch_id: batch.json, p_results: { [k1]: 'ok' } })
  const { json: afterAgain } = await api(`/rest/v1/ceramic_units?id=eq.${k1}&select=stage_id`)
  ok('repeated batch completion is a safe no-op', again.json?.already_completed === true && afterAgain[0].stage_id === 3)

  // Rejected unit tied to an order flags it and supports replacement.
  const orderE = await rpc('create_order', { p_payload: {
    name: 'מבחן ה', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 1, artwork_id: 'gallery-12' }],
  } })
  await rpc('confirm_order', { p_order_id: orderE.json.order_id })
  const { json: eAlloc } = await api(`/rest/v1/order_item_allocations?order_item_id=eq.${(await firstItemId(orderE.json.order_id))}&select=ceramic_unit_id`)
  const eUnit = eAlloc[0].ceramic_unit_id
  await rpc('reject_unit', { p_unit_id: eUnit, p_notes: 'נסדק' })
  const { json: flagged } = await api(`/rest/v1/orders?id=eq.${orderE.json.order_id}&select=needs_attention,status`)
  ok('a rejected unit flags its order', flagged[0].needs_attention === true)
  const replacement = await rpc('replace_unit', { p_unit_id: eUnit })
  ok('replacement allocates a substitute unit', replacement.status === 200 && Boolean(replacement.json))
  const { json: resolved } = await api(`/rest/v1/orders?id=eq.${orderE.json.order_id}&select=needs_attention`)
  ok('replacement clears the attention flag', resolved[0].needs_attention === false)

  // Readiness: order E's replacement must reach stage 8 + QC passed to be ready.
  for (let stage = 1; stage <= 7; stage += 1) {
    const { json: current } = await api(`/rest/v1/ceramic_units?select=stage_id&id=eq.${replacement.json}`)
    if (current[0].stage_id === 5) await rpc('apply_artwork', { p_unit_id: replacement.json })
    else await rpc('advance_units_stage', { p_unit_ids: [replacement.json], p_result: 'completed' })
  }
  const { json: finalOrder } = await api(`/rest/v1/orders?id=eq.${orderE.json.order_id}&select=status`)
  ok('order becomes ready only when the full quantity passes QC', finalOrder[0].status === 'ready')

  // A short order (more quantity than ready units) is never ready.
  const orderF = await rpc('create_order', { p_payload: {
    name: 'מבחן ו', phone: OTHER_PHONE, delivery_type: 'binyamina',
    items: [{ variant_id: 'yael-bowl-speckled-lions-maw', size_label: 'קוטר כ-25 ס״מ', quantity: 3, artwork_id: 'gallery-12' }],
  } })
  await rpc('confirm_order', { p_order_id: orderF.json.order_id })
  const { json: fOrder } = await api(`/rest/v1/orders?id=eq.${orderF.json.order_id}&select=status`)
  ok('shortage keeps the order in production', fOrder[0].status === 'in_production')

  await rpc('complete_order', { p_order_id: orderE.json.order_id })
  const { json: completed } = await api(`/rest/v1/orders?id=eq.${orderE.json.order_id}&select=status`)
  const { json: deliveredUnits } = await api(`/rest/v1/ceramic_units?lifecycle=eq.delivered&select=id`)
  ok('completing an order marks its units delivered', completed[0].status === 'completed' && deliveredUnits.length >= 1)
}

async function firstItemId(orderId) {
  const { json } = await api(`/rest/v1/order_items?order_id=eq.${orderId}&select=id`).then((r) => r)
  return json[0].id
}

// ---------------------------------------------------------------------------
await cleanup()
await signIn()
await publicSignupDisabled()
await captureTests()
await denialTests()
const context = await allocationTests()
await kilnTests(context)

console.log(`\nIntegration tests: ${passed} passed, ${failed} failed.`)
process.exit(failed ? 1 : 0)
