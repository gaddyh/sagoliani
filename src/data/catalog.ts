export type VesselId = 'turquoise' | 'blue' | 'ai-round-plate' | 'ai-oval-plate' | 'ai-rect-platter'
export type ArtworkId = 'meadow' | 'spring' | 'garden' | 'wildflowers' | 'monkey-flower' | 'gentian' | 'poppy'
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
    id: 'turquoise', name: 'קערת תכלת אורגנית', detail: 'גלזורה תכולה · שפה חופשית',
    image: '/assets/vessels/turquoise.webp', mask: '/assets/vessels/turquoise-mask.png',
    material: 'light', curve: 0.032, perspective: 0.15,
    placements: {
      center: { x: .51, y: .575, width: .255 },
      small: { x: .51, y: .575, width: .19 },
      offset: { x: .58, y: .54, width: .225 },
    },
  },
  {
    id: 'blue', name: 'קערת כחול עמוק', detail: 'גלזורה כחולה · שפה בהירה',
    image: '/assets/vessels/blue.webp', mask: '/assets/vessels/blue-mask.png',
    material: 'dark', curve: 0.058, perspective: 0.22,
    placements: {
      center: { x: .50, y: .55, width: .27 },
      small: { x: .50, y: .55, width: .20 },
      offset: { x: .57, y: .515, width: .23 },
    },
  },
  {
    id: 'ai-round-plate', name: 'צלחת שוליים גליים · AI', detail: 'נכס בדיקה חיצוני · תמונת AI',
    image: '/assets/vessels/ai-round-plate.webp', mask: '/assets/vessels/ai-round-plate-mask.png',
    material: 'light', curve: 0.012, perspective: 0.04,
    placements: {
      center: { x: 0.490, y: 0.492, width: 0.281 },
      small: { x: 0.490, y: 0.492, width: 0.208 },
      offset: { x: 0.539, y: 0.463, width: 0.248 },
    },
    external: true,
    credit: {
      author: 'תמונה שנוצרה בבינה מלאכותית, סופקה לצורך ההדמיה',
      sourceUrl: '',
      license: 'תמונה שנוצרה ב-AI · להמחשה בלבד',
      licenseUrl: '',
    },
  },
  {
    id: 'ai-oval-plate', name: 'צלחת אובאלית גלית · AI', detail: 'נכס בדיקה חיצוני · תמונת AI',
    image: '/assets/vessels/ai-oval-plate.webp', mask: '/assets/vessels/ai-oval-plate-mask.png',
    material: 'light', curve: 0.012, perspective: 0.04,
    placements: {
      center: { x: 0.500, y: 0.500, width: 0.306 },
      small: { x: 0.500, y: 0.500, width: 0.227 },
      offset: { x: 0.554, y: 0.481, width: 0.270 },
    },
    external: true,
    credit: {
      author: 'תמונה שנוצרה בבינה מלאכותית, סופקה לצורך ההדמיה',
      sourceUrl: '',
      license: 'תמונה שנוצרה ב-AI · להמחשה בלבד',
      licenseUrl: '',
    },
  },
  {
    id: 'ai-rect-platter', name: 'מגש מלבני גלי · AI', detail: 'נכס בדיקה חיצוני · תמונת AI',
    image: '/assets/vessels/ai-rect-platter.webp', mask: '/assets/vessels/ai-rect-platter-mask.png',
    material: 'light', curve: 0.008, perspective: 0.03,
    placements: {
      center: { x: 0.502, y: 0.491, width: 0.317 },
      small: { x: 0.502, y: 0.491, width: 0.235 },
      offset: { x: 0.558, y: 0.470, width: 0.279 },
    },
    external: true,
    credit: {
      author: 'תמונה שנוצרה בבינה מלאכותית, סופקה לצורך ההדמיה',
      sourceUrl: '',
      license: 'תמונה שנוצרה ב-AI · להמחשה בלבד',
      licenseUrl: '',
    },
  },
]

export const artworks: Artwork[] = [
  {
    id: 'meadow', name: 'פרחי שדה', detail: 'פרחים עליזים בגוני תכלת וצהוב',
    image: '/assets/artwork/meadow.png', source: 'צילום צבעי המים: מקטע עליון',
  },
  {
    id: 'spring', name: 'פריחת אביב', detail: 'שכבות של פרחים ועלים עדינים',
    image: '/assets/artwork/spring.png', source: 'צילום צבעי המים: מקטע תחתון',
  },
  {
    id: 'garden', name: 'פריחת גן', detail: 'נגיעות תכלת וצהוב בין העלים',
    image: '/assets/artwork/garden.png', source: 'צילום צבעי המים: מקטע מרכזי',
  },
  {
    id: 'wildflowers', name: 'לבנדר פראי', detail: 'ענף בוטני בגוני סגול וורוד',
    image: '/assets/artwork/wildflowers.png', source: 'צילום האיור הממוסגר', scale: 1.3,
  },
  {
    id: 'monkey-flower', name: 'פרח קוף (בדיקה)', detail: 'נכס בדיקה חיצוני · צבעי מים CC0',
    image: '/assets/artwork/monkey-flower.png', source: 'Mary Vaux Walcott, 1920s',
    external: true,
    credit: {
      author: 'Mary Vaux Walcott — Lewis Monkey Flower (Mimulus lewisii)',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lewis_Monkey_Flower_(Mimulus_lewisii)_by_Mary_Vaux_Walcott-saam1970.355.711.jpg',
      license: 'CC0 1.0 (נחלת הכלל)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
  },
  {
    id: 'gentian', name: 'גנציאן (בדיקה)', detail: 'נכס בדיקה חיצוני · צבעי מים CC0',
    image: '/assets/artwork/gentian.png', source: 'Mary Vaux Walcott, 1920s',
    external: true,
    credit: {
      author: 'Mary Vaux Walcott — Gentian (Gentiana newberri)',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gentian_(Gentiana_newberri)_by_Mary_Vaux_Walcott-saam1970.355.243.jpg',
      license: 'CC0 1.0 (נחלת הכלל)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
  },
  {
    id: 'poppy', name: 'פרג קליפורני (בדיקה)', detail: 'נכס בדיקה חיצוני · צבעי מים CC0',
    image: '/assets/artwork/poppy.png', source: 'Mary Vaux Walcott, 1920s',
    external: true,
    credit: {
      author: 'Mary Vaux Walcott — California Poppy (Eschscholtzia californica)',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:California_Poppy_(Eschscholtzia_californica)_by_Mary_Vaux_Walcott-saam1970.355.303.jpg',
      license: 'CC0 1.0 (נחלת הכלל)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
  },
]

export const presets: { id: PresetId; name: string; detail: string }[] = [
  { id: 'center', name: 'במרכז', detail: 'נוכחות רכה' },
  { id: 'small', name: 'קטן ועדין', detail: 'מרחב לנשימה' },
  { id: 'offset', name: 'מעט הצידה', detail: 'תנועה טבעית' },
]

export const assetVersion = 'photo-crops-v3'
