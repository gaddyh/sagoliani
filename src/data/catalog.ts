export type VesselId = 'turquoise' | 'blue' | 'white-study' | 'rim-study'
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
    id: 'white-study', name: 'קערת לבן לבדיקה', detail: 'נכס בדיקה חיצוני · רקע בהיר',
    image: '/assets/vessels/white-study.webp', mask: '/assets/vessels/white-study-mask.png',
    material: 'light', curve: 0.028, perspective: 0.12,
    placements: {
      center: { x: .50, y: .50, width: .40 },
      small: { x: .50, y: .50, width: .30 },
      offset: { x: .57, y: .47, width: .36 },
    },
    external: true,
    credit: {
      author: 'Wikimedia Commons · צילום קערה לבנה',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Empty_white_bowl.png',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'rim-study', name: 'קערה עם שפה כחולה לבדיקה', detail: 'נכס בדיקה חיצוני · שפה מורכבת',
    image: '/assets/vessels/rim-study.webp', mask: '/assets/vessels/rim-study-mask.png',
    material: 'light', curve: 0.05, perspective: 0.26,
    placements: {
      center: { x: .455, y: .432, width: .26 },
      small: { x: .455, y: .432, width: .19 },
      offset: { x: .52, y: .41, width: .23 },
    },
    external: true,
    credit: {
      author: 'Wikimedia Commons · קערת קרמיקה פשוטה עם שפה כחולה',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Simple-ceramic-bowl.jpg',
      license: 'CC BY 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
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
