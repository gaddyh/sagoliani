export type Material = 'smooth' | 'speckled'
export type ProductId = 'cake-pan' | 'speckled-platter' | 'round-platter' | 'deep-bowl' | 'flat-bowl' | 'english-platter-straight' | 'english-platter-oval' | 'river-stones' | 'vase' | 'shay-bowl' | 'irit-platter' | 'yael-bowl' | 'omer-bowl' | 'ella-platter' | 'mika-plate'

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
}

export interface ProductVariant {
  id: string
  productId: ProductId
  material: Material
  artworkId: string
  artworkName: string
  images: [string, ...string[]]
}

export const products: Product[] = [
  { id: 'cake-pan', name: 'תבנית לעוגה / קיש / פשטידה', detail: 'קוטר 26 · עומק 5 ס״מ', sizes: [{ label: 'קוטר 26', price: 165 }] },
  { id: 'speckled-platter', name: 'צלחת הגשה מעוגלת ענקית', detail: 'קוטר 30 ס״מ', sizes: [{ label: 'קוטר 30', price: 145 }] },
  { id: 'round-platter', name: 'צלחת הגשה גדולה עגולה', detail: 'קוטר 30 ס״מ', sizes: [{ label: 'קוטר 30', price: 150 }] },
  { id: 'deep-bowl', name: 'קערה עמוקה', detail: 'קוטר 17–20 · למרק או לסלטים', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'flat-bowl', name: 'קערה שטוחה', detail: 'קוטר 17–20 · למרק או לסלטים', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'english-platter-straight', name: 'צלחת הגשה אינגליש · ישר', detail: '35×15 ס״מ', sizes: [{ label: 'ישר', price: 140 }] },
  { id: 'english-platter-oval', name: 'צלחת הגשה אינגליש · אובאלי', detail: '35×15 ס״מ', sizes: [{ label: 'אובאלי', price: 140 }] },
  { id: 'river-stones', name: 'צלחת הגשה ״אבני נחל״', detail: 'בגדלים שונים', sizes: [{ label: 'גדול', price: 100 }, { label: 'בינוני', price: 75 }, { label: 'קטן', price: 50 }] },
  { id: 'vase', name: 'אגרטל', detail: 'גובה 13–20 ס״מ', sizes: [{ label: 'גובה 13–20', price: 110 }] },
  { id: 'shay-bowl', name: 'קערת שי', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 17', price: 75 }, { label: 'קוטר 20', price: 85 }] },
  { id: 'irit-platter', name: 'מגש עירית', detail: 'מגש הגשה בעבודת יד', sizes: [{ label: 'מגש', price: 145 }] },
  { id: 'yael-bowl', name: 'קערת יעל', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 17', price: 75 }, { label: 'קוטר 20', price: 85 }] },
  { id: 'omer-bowl', name: 'קערת עומר', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 17', price: 75 }, { label: 'קוטר 20', price: 85 }] },
  { id: 'ella-platter', name: 'מגש אלה', detail: 'מגש הגשה בעבודת יד', sizes: [{ label: 'מגש', price: 140 }] },
  { id: 'mika-plate', name: 'צלחת מיקה', detail: 'צלחת הגשה בעבודת יד', sizes: [{ label: 'צלחת', price: 145 }] },
]

export const finishedVariants: ProductVariant[] = [
  { id: 'shay-bowl-smooth-pink-dance', productId: 'shay-bowl', material: 'smooth', artworkId: 'pink-dance', artworkName: 'ריקוד ורוד', images: ['/assets/products/shay-bowl/smooth/pink-dance.webp'] },
  { id: 'shay-bowl-speckled-pink-dance', productId: 'shay-bowl', material: 'speckled', artworkId: 'pink-dance', artworkName: 'ריקוד ורוד', images: ['/assets/products/shay-bowl/speckled/pink-dance.webp'] },
  { id: 'shay-bowl-smooth-spring', productId: 'shay-bowl', material: 'smooth', artworkId: 'spring', artworkName: 'פריחת אביב', images: ['/assets/products/shay-bowl/smooth/shay-bowl-smooth-spring.webp'] },
  { id: 'shay-bowl-smooth-purple-embrace', productId: 'shay-bowl', material: 'smooth', artworkId: 'purple-embrace', artworkName: 'חיבוק סגול', images: ['/assets/products/shay-bowl/smooth/purple-embrace-01.webp', '/assets/products/shay-bowl/smooth/purple-embrace-02.webp', '/assets/products/shay-bowl/smooth/purple-embrace-03.webp', '/assets/products/shay-bowl/smooth/purple-embrace-04.webp'] },
  { id: 'shay-bowl-speckled-purple-embrace', productId: 'shay-bowl', material: 'speckled', artworkId: 'purple-embrace', artworkName: 'חיבוק סגול', images: ['/assets/products/shay-bowl/speckled/purple-embrace-01.webp', '/assets/products/shay-bowl/speckled/purple-embrace-02.webp', '/assets/products/shay-bowl/speckled/purple-embrace-03.webp'] },
  { id: 'irit-platter-smooth-wildflower-field', productId: 'irit-platter', material: 'smooth', artworkId: 'wildflower-field', artworkName: 'שדה פרחי בר', images: ['/assets/products/irit-platter/smooth/wildflower-field.webp'] },
  { id: 'irit-platter-speckled-wildflower-field', productId: 'irit-platter', material: 'speckled', artworkId: 'wildflower-field', artworkName: 'שדה פרחי בר', images: ['/assets/products/irit-platter/speckled/wildflower-field.webp'] },
  { id: 'yael-bowl-smooth-lions-maw', productId: 'yael-bowl', material: 'smooth', artworkId: 'lions-maw', artworkName: 'לוע הארי', images: ['/assets/products/yael-bowl/smooth/lions-maw.webp'] },
  { id: 'yael-bowl-speckled-lions-maw', productId: 'yael-bowl', material: 'speckled', artworkId: 'lions-maw', artworkName: 'לוע הארי', images: ['/assets/products/yael-bowl/speckled/lions-maw.webp'] },
  { id: 'omer-bowl-smooth-field-whisper', productId: 'omer-bowl', material: 'smooth', artworkId: 'field-whisper', artworkName: 'לחישת השדה', images: ['/assets/products/omer-bowl/smooth/field-whisper-01.webp', '/assets/products/omer-bowl/smooth/field-whisper-02.webp'] },
  { id: 'omer-bowl-speckled-field-whisper', productId: 'omer-bowl', material: 'speckled', artworkId: 'field-whisper', artworkName: 'לחישת השדה', images: ['/assets/products/omer-bowl/speckled/field-whisper-01.webp', '/assets/products/omer-bowl/speckled/field-whisper-02.webp'] },
  { id: 'river-stones-smooth-wild-magic', productId: 'river-stones', material: 'smooth', artworkId: 'wild-magic', artworkName: 'קסם בר', images: ['/assets/products/river-stones/smooth/wild-magic-01.webp', '/assets/products/river-stones/smooth/wild-magic-02.webp'] },
  { id: 'ella-platter-smooth-field-dance', productId: 'ella-platter', material: 'smooth', artworkId: 'field-dance', artworkName: 'ריקוד בשדה', images: ['/assets/products/ella-platter/smooth/field-dance-01.webp', '/assets/products/ella-platter/smooth/field-dance-02.webp', '/assets/products/ella-platter/smooth/field-dance-03.webp'] },
  { id: 'mika-plate-smooth-purple-touch', productId: 'mika-plate', material: 'smooth', artworkId: 'purple-touch', artworkName: 'נגיעה סגולה', images: ['/assets/products/mika-plate/smooth/purple-touch-01.webp', '/assets/products/mika-plate/smooth/purple-touch-02.webp', '/assets/products/mika-plate/smooth/purple-touch-03.webp', '/assets/products/mika-plate/smooth/purple-touch-04.webp', '/assets/products/mika-plate/smooth/purple-touch-05.webp'] },
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
