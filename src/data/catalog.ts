export type VesselId = 'shay-clean' | 'shay-dots' | 'omer-clean' | 'omer-dots' | 'yael-clean' | 'yael-dots' | 'mika-clean' | 'mika-dots' | 'ella-clean' | 'ella-dots' | 'irit-clean' | 'irit-dots' | 'pebbles-clean' | 'pebbles-dots' | 'efrat-clean' | 'efrat-dots' | 'gaddy-clean' | 'gaddy-dots' | 'ari-clean' | 'ari-dots'
export type ArtworkId = 'pink-dance' | 'snapdragon-pink' | 'snapdragon-red' | 'soft-strength'
export type PresetId = 'center' | 'small' | 'offset'

export interface Placement {
  x: number
  y: number
  width: number
}

export interface Credit {
  author: string
  sourceUrl: string
  license: string
  licenseUrl: string
}

export interface Vessel {
  id: VesselId
  name: string
  detail: string
  image: string
  mask: string
  material: 'light' | 'dark'
  curve: number
  perspective: number
  wrap?: number
  placements: Record<PresetId, Placement>
  external?: boolean
  credit?: Credit
}

export interface Artwork {
  id: ArtworkId
  name: string
  detail: string
  image: string
  source: string
  scale?: number
  external?: boolean
  credit?: Credit
}

export const vessels: Vessel[] = [
  {
    id: 'shay-clean', name: 'קערת שי · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/shay-clean.webp', mask: '/assets/vessels/shay-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.500, y: 0.496, width: 0.177 },
      small: { x: 0.500, y: 0.496, width: 0.132 },
      offset: { x: 0.531, y: 0.475, width: 0.157 },
    },
  },
  {
    id: 'shay-dots', name: 'קערת שי · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/shay-dots.webp', mask: '/assets/vessels/shay-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.501, y: 0.496, width: 0.178 },
      small: { x: 0.501, y: 0.496, width: 0.132 },
      offset: { x: 0.532, y: 0.471, width: 0.157 },
    },
  },
  {
    id: 'omer-clean', name: 'קערת עומר · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/omer-clean.webp', mask: '/assets/vessels/omer-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.500, y: 0.501, width: 0.177 },
      small: { x: 0.500, y: 0.501, width: 0.132 },
      offset: { x: 0.531, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'omer-dots', name: 'קערת עומר · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/omer-dots.webp', mask: '/assets/vessels/omer-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.500, y: 0.502, width: 0.177 },
      small: { x: 0.500, y: 0.502, width: 0.132 },
      offset: { x: 0.531, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'yael-clean', name: 'קערת יעל · חלק', detail: 'חומר שמנת חלק עם ציור "דק מן הדק"',
    image: '/assets/vessels/yael-clean.webp', mask: '/assets/vessels/yael-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.500, y: 0.498, width: 0.177 },
      small: { x: 0.500, y: 0.498, width: 0.132 },
      offset: { x: 0.531, y: 0.477, width: 0.157 },
    },
  },
  {
    id: 'yael-dots', name: 'קערת יעל · מנוקד', detail: 'חומר שמנת מנוקד עם ציור "דק מן הדק"',
    image: '/assets/vessels/yael-dots.webp', mask: '/assets/vessels/yael-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.499, y: 0.496, width: 0.177 },
      small: { x: 0.499, y: 0.496, width: 0.132 },
      offset: { x: 0.530, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'mika-clean', name: 'קערת מיקה · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/mika-clean.webp', mask: '/assets/vessels/mika-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.499, y: 0.503, width: 0.177 },
      small: { x: 0.499, y: 0.503, width: 0.132 },
      offset: { x: 0.530, y: 0.485, width: 0.157 },
    },
  },
  {
    id: 'mika-dots', name: 'קערת מיקה · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/mika-dots.webp', mask: '/assets/vessels/mika-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.497, y: 0.505, width: 0.178 },
      small: { x: 0.497, y: 0.505, width: 0.132 },
      offset: { x: 0.529, y: 0.487, width: 0.157 },
    },
  },
  {
    id: 'ella-clean', name: 'צלחת אלה · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/ella-clean.webp', mask: '/assets/vessels/ella-clean-mask.png',
    material: 'light', curve: 0.01, perspective: 0.04, wrap: 0.35,
    placements: {
      center: { x: 0.499, y: 0.500, width: 0.206 },
      small: { x: 0.499, y: 0.500, width: 0.153 },
      offset: { x: 0.535, y: 0.490, width: 0.182 },
    },
  },
  {
    id: 'ella-dots', name: 'צלחת אלה · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/ella-dots.webp', mask: '/assets/vessels/ella-dots-mask.png',
    material: 'light', curve: 0.01, perspective: 0.04, wrap: 0.35,
    placements: {
      center: { x: 0.499, y: 0.500, width: 0.206 },
      small: { x: 0.499, y: 0.500, width: 0.153 },
      offset: { x: 0.535, y: 0.490, width: 0.182 },
    },
  },
  {
    id: 'irit-clean', name: 'קערת עירית · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/irit-clean.webp', mask: '/assets/vessels/irit-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.496, y: 0.498, width: 0.178 },
      small: { x: 0.496, y: 0.498, width: 0.132 },
      offset: { x: 0.527, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'irit-dots', name: 'קערת עירית · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/irit-dots.webp', mask: '/assets/vessels/irit-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.499, y: 0.497, width: 0.177 },
      small: { x: 0.499, y: 0.497, width: 0.132 },
      offset: { x: 0.530, y: 0.476, width: 0.157 },
    },
  },
  {
    id: 'pebbles-clean', name: 'קערת חלוקים · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/pebbles-clean.webp', mask: '/assets/vessels/pebbles-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.497, y: 0.499, width: 0.178 },
      small: { x: 0.497, y: 0.499, width: 0.132 },
      offset: { x: 0.528, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'pebbles-dots', name: 'קערת חלוקים · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/pebbles-dots.webp', mask: '/assets/vessels/pebbles-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.502, y: 0.495, width: 0.178 },
      small: { x: 0.502, y: 0.495, width: 0.132 },
      offset: { x: 0.533, y: 0.474, width: 0.157 },
    },
  },
  {
    id: 'efrat-clean', name: 'קערת אפרת · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/efrat-clean.webp', mask: '/assets/vessels/efrat-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.502, y: 0.497, width: 0.176 },
      small: { x: 0.502, y: 0.497, width: 0.130 },
      offset: { x: 0.533, y: 0.473, width: 0.155 },
    },
  },
  {
    id: 'efrat-dots', name: 'קערת אפרת · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/efrat-dots.webp', mask: '/assets/vessels/efrat-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.506, y: 0.498, width: 0.178 },
      small: { x: 0.506, y: 0.498, width: 0.132 },
      offset: { x: 0.537, y: 0.474, width: 0.157 },
    },
  },
  {
    id: 'gaddy-clean', name: 'קערת גדי · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/gaddy-clean.webp', mask: '/assets/vessels/gaddy-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.501, y: 0.498, width: 0.178 },
      small: { x: 0.501, y: 0.498, width: 0.132 },
      offset: { x: 0.532, y: 0.479, width: 0.157 },
    },
  },
  {
    id: 'gaddy-dots', name: 'קערת גדי · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/gaddy-dots.webp', mask: '/assets/vessels/gaddy-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.502, y: 0.501, width: 0.178 },
      small: { x: 0.502, y: 0.501, width: 0.132 },
      offset: { x: 0.533, y: 0.482, width: 0.157 },
    },
  },
  {
    id: 'ari-clean', name: 'קערת ארי · חלק', detail: 'חומר שמנת חלק',
    image: '/assets/vessels/ari-clean.webp', mask: '/assets/vessels/ari-clean-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.499, y: 0.502, width: 0.177 },
      small: { x: 0.499, y: 0.502, width: 0.132 },
      offset: { x: 0.530, y: 0.478, width: 0.157 },
    },
  },
  {
    id: 'ari-dots', name: 'קערת ארי · מנוקד', detail: 'חומר שמנת מנוקד',
    image: '/assets/vessels/ari-dots.webp', mask: '/assets/vessels/ari-dots-mask.png',
    material: 'light', curve: 0.02, perspective: 0.08, wrap: 1,
    placements: {
      center: { x: 0.499, y: 0.498, width: 0.177 },
      small: { x: 0.499, y: 0.498, width: 0.132 },
      offset: { x: 0.530, y: 0.475, width: 0.157 },
    },
  },
]

export const artworks: Artwork[] = [
  {
    id: 'pink-dance', name: 'ריקוד ורוד', detail: 'פרחים ורודים בתנועה',
    image: '/assets/artwork/pink-dance.png', source: 'ציור מקורי של היוצרות',
  },
  {
    id: 'snapdragon-pink', name: 'לוע ארי', detail: 'פרחי לוע ארי בגווני ורוד',
    image: '/assets/artwork/snapdragon-pink.png', source: 'ציור מקורי של היוצרות',
  },
  {
    id: 'snapdragon-red', name: 'לוע ארי אדום', detail: 'פרחי לוע ארי בגווני אדום',
    image: '/assets/artwork/snapdragon-red.png', source: 'ציור מקורי של היוצרות',
  },
  {
    id: 'soft-strength', name: 'עוצמת הרכות', detail: 'ציור מקורי בגוונים חמים',
    image: '/assets/artwork/soft-strength.png', source: 'ציור מקורי של היוצרות',
  },
]

export const presets: { id: PresetId; name: string; detail: string }[] = [
  { id: 'center', name: 'במרכז', detail: 'נוכחות רכה' },
  { id: 'small', name: 'קטן ועדין', detail: 'מרחב לנשימה' },
  { id: 'offset', name: 'מעט הצידה', detail: 'תנועה טבעית' },
]

export const assetVersion = 'full-surface-v1'
