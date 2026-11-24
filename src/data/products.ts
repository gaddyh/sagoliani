export type Material = 'smooth' | 'speckled'
export type ProductId = 'cake-pan' | 'speckled-platter' | 'round-platter' | 'deep-bowl' | 'flat-bowl' | 'english-platter-straight' | 'english-platter-oval' | 'river-stones' | 'vase' | 'shay-bowl' | 'irit-platter' | 'yael-bowl' | 'omer-bowl' | 'ella-platter' | 'mika-plate' | 'gaddy-plate'

export interface ProductSize {
  label: string
  price: number
}

export interface Product {
  id: ProductId
  name: string
  detail: string
  sizes: ProductSize[]
  coverVariantId?: string
  uses?: string
}

export interface ProductVariant {
  id: string
  productId: ProductId
  material: Material
  artworkId: string
  artworkName: string
  images: [string, ...string[]]
  imageArtworkNames?: string[]
}

export const products: Product[] = [
  { id: 'cake-pan', name: 'תבנית לעוגה / קיש / פשטידה', detail: 'קוטר 26 · עומק 5 ס״מ', sizes: [{ label: 'קוטר 26', price: 165 }] },
  { id: 'speckled-platter', name: 'צלחת הגשה מעוגלת ענקית', detail: 'קוטר 30 ס״מ', sizes: [{ label: 'קוטר 30', price: 145 }] },
  { id: 'round-platter', name: 'צלחת הגשה גדולה עגולה', detail: 'קוטר 30 ס״מ', sizes: [{ label: 'קוטר 30', price: 150 }] },
  { id: 'deep-bowl', name: 'קערה עמוקה', detail: 'קוטר 17–20 · למרק או לסלטים', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'flat-bowl', name: 'קערה שטוחה', detail: 'קוטר 17–20 · למרק או לסלטים', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'english-platter-straight', name: 'צלחת הגשה אינגליש · ישר', detail: '35×15 ס״מ', sizes: [{ label: 'ישר', price: 140 }] },
  { id: 'english-platter-oval', name: 'צלחת הגשה אינגליש · אובאלי', detail: '35×15 ס״מ', sizes: [{ label: 'אובאלי', price: 140 }] },
  { id: 'river-stones', name: 'סט צלחות להגשה ״אבני נחל״', detail: 'בגדלים שונים', sizes: [{ label: 'גדול', price: 100 }, { label: 'בינוני', price: 75 }, { label: 'קטן', price: 50 }], uses: 'פיצוחים | דבש | רטבים | פירות | סלט פירות | סלטים | טאפסים | מטבלים' },
  { id: 'vase', name: 'אגרטל', detail: 'גובה 13–20 ס״מ', sizes: [{ label: 'גובה 13–20', price: 110 }] },
  { id: 'shay-bowl', name: 'קערת שי', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 16', price: 78 }, { label: 'קוטר 20', price: 88 }], uses: 'מרק | סלטים | קורנפלקס | פיצוחים | מטבלים | גלידה | רטבים וממרחים | קינוחים | לשולחנות חג' },
  { id: 'irit-platter', name: 'מגש עירית', detail: 'מגש אינגליש אובלי בעבודת יד · כ־35×15 ס״מ', sizes: [{ label: 'מגש', price: 155 }], uses: 'הגשת עוגות | פירות | גבינות | חציל בטחינה | נתחי בשר | נקניקים' },
  { id: 'yael-bowl', name: 'תבנית יעל', detail: 'תבנית בעבודת יד · קוטר 25', sizes: [{ label: 'קוטר 25', price: 165 }], uses: 'עוגה | קיש | פשטידה | קדרה פתוחה' },
  { id: 'omer-bowl', name: 'קערת עומר', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 16', price: 78 }, { label: 'קוטר 20', price: 88 }], coverVariantId: 'omer-bowl-speckled-field-whisper', uses: 'מרק | סלטים | קורנפלקס | פיצוחים | מטבלים | גלידה | רטבים וממרחים | קינוחים | לשולחנות חג' },
  { id: 'ella-platter', name: 'מגש אלה', detail: 'מגש הגשה בעבודת יד · כ־35×15 ס״מ', sizes: [{ label: 'מגש', price: 155 }], uses: 'הגשת עוגות | פירות | גבינות | חציל בטחינה | נתחי בשר | נקניקים' },
  { id: 'mika-plate', name: 'צלחת מיקה', detail: 'צלחת הגשה בעבודת יד · קוטר כ־30 ס״מ', sizes: [{ label: 'צלחת', price: 165 }], uses: 'הגשת עוגה | סופגניות | דונט ספינג׳ | פירות | גבינות' },
  { id: 'gaddy-plate', name: 'צלחת גדי', detail: 'צלחת הגשה קדרות · קוטר 25', sizes: [{ label: 'קוטר 25', price: 145 }], uses: 'פירות | גבינות | חומס | נתחי בשר | נקניקים' },
]

export const finishedVariants: ProductVariant[] = [
  { id: 'shay-bowl-smooth', productId: 'shay-bowl', material: 'smooth', artworkId: 'assorted', artworkName: 'מודה אני', images: ['/assets/products/shay-bowl/smooth/purple-embrace-01.webp', '/assets/products/shay-bowl/smooth/purple-embrace-02.webp', '/assets/products/shay-bowl/smooth/purple-embrace-03.webp', '/assets/products/shay-bowl/smooth/purple-embrace-04.webp'] },
  { id: 'shay-bowl-speckled', productId: 'shay-bowl', material: 'speckled', artworkId: 'assorted', artworkName: 'מודה אני', images: ['/assets/products/shay-bowl/speckled/purple-embrace-01.webp', '/assets/products/shay-bowl/speckled/purple-embrace-02.webp', '/assets/products/shay-bowl/speckled/purple-embrace-03.webp'] },
  { id: 'irit-platter-smooth', productId: 'irit-platter', material: 'smooth', artworkId: 'assorted', artworkName: 'מגוון ציורים', images: ['/assets/products/irit-platter/smooth/pink_whisper.webp'], imageArtworkNames: ['נוגה'] },
  { id: 'irit-platter-speckled', productId: 'irit-platter', material: 'speckled', artworkId: 'assorted', artworkName: 'מגוון ציורים', images: ['/assets/products/irit-platter/speckled/wildflower-field.webp', '/assets/products/irit-platter/speckled/wildflower-field-02.webp', '/assets/products/irit-platter/speckled/pink_whisper.webp'], imageArtworkNames: ['שיר געגועים', 'שיר געגועים', 'נוגה'] },
  { id: 'yael-bowl-speckled-lions-maw', productId: 'yael-bowl', material: 'speckled', artworkId: 'lions-maw', artworkName: 'דק מן הדק', images: ['/assets/products/yael-bowl/speckled/lions-maw.webp', '/assets/products/yael-bowl/speckled/lions-maw-02.webp'] },
  { id: 'omer-bowl-speckled-field-whisper', productId: 'omer-bowl', material: 'speckled', artworkId: 'field-whisper', artworkName: 'בצהרי היום', images: ['/assets/products/omer-bowl/speckled/field-whisper-01.webp', '/assets/products/omer-bowl/speckled/field-whisper-02.webp', '/assets/products/omer-bowl/speckled/field-whisper-03.webp', '/assets/products/omer-bowl/speckled/field-whisper-04.webp'] },
  { id: 'river-stones-smooth-wild-magic', productId: 'river-stones', material: 'smooth', artworkId: 'wild-magic', artworkName: 'שיר געגועים', images: ['/assets/products/river-stones/smooth/wild-magic-01.webp', '/assets/products/river-stones/smooth/wild-magic-02.webp'] },
  { id: 'ella-platter-smooth-field-dance', productId: 'ella-platter', material: 'smooth', artworkId: 'field-dance', artworkName: 'נישאים ברוח', images: ['/assets/products/ella-platter/smooth/field-dance-01.webp', '/assets/products/ella-platter/smooth/field-dance-02.webp'] },
  { id: 'mika-plate-smooth-purple-touch', productId: 'mika-plate', material: 'smooth', artworkId: 'purple-touch', artworkName: 'אגדת דשא', images: ['/assets/products/mika-plate/smooth/purple-touch-01.webp', '/assets/products/mika-plate/smooth/purple-touch-02.webp', '/assets/products/mika-plate/smooth/purple-touch-03.webp', '/assets/products/mika-plate/smooth/purple-touch-04.webp', '/assets/products/mika-plate/smooth/purple-touch-05.webp'] },
  { id: 'gaddy-plate-speckled-green-field', productId: 'gaddy-plate', material: 'speckled', artworkId: 'green-field', artworkName: 'בשדה ירוק', images: ['/assets/products/gaddy-plate/speckled/green-field-01.webp', '/assets/products/gaddy-plate/speckled/green-field-02.webp', '/assets/products/gaddy-plate/speckled/green-field-03.webp', '/assets/products/gaddy-plate/speckled/green-field-04.webp', '/assets/products/gaddy-plate/speckled/green-field-05.webp'] },
]

export const availableVariants = finishedVariants.filter((variant) => variant.images.length > 0)
export const publishedProducts = products.filter((product) => availableVariants.some((variant) => variant.productId === product.id))

export function displayVariant(product: Product): ProductVariant | undefined {
  return availableVariants.find((variant) => variant.id === product.coverVariantId && variant.productId === product.id)
    ?? availableVariants.find((variant) => variant.productId === product.id)
}

export const artists = [
  { name: 'עירית סגול', phone: '052-2486836', whatsapp: '972522486836' },
  { name: 'אפרת ליאני', phone: '052-3894291', whatsapp: '972523894291' },
]

export function sizeOf(product: Product, label: string): ProductSize {
  return product.sizes.find((size) => size.label === label) ?? product.sizes[0]
}

export function priceLabel(product: Product): string {
  const prices = product.sizes.map((size) => size.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? `${min} ₪` : `${min}–${max} ₪`
}
