export type Material = 'smooth' | 'speckled'
export type ProductId = 'cake-pan' | 'speckled-platter' | 'round-platter' | 'deep-bowl' | 'flat-bowl' | 'english-platter-straight' | 'english-platter-oval' | 'river-stones-large' | 'river-stones-medium' | 'river-stones-small' | 'vase' | 'shay-bowl'

export interface ProductSize {
  label: string
  price: number
}

export interface Product {
  id: ProductId
  name: string
  detail: string
  sizes: ProductSize[]
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
  { id: 'river-stones-large', name: 'צלחת הגשה ״אבני נחל״ · גדול', detail: 'גודל גדול', sizes: [{ label: 'גדול', price: 100 }] },
  { id: 'river-stones-medium', name: 'צלחת הגשה ״אבני נחל״ · בינוני', detail: 'גודל בינוני', sizes: [{ label: 'בינוני', price: 75 }] },
  { id: 'river-stones-small', name: 'צלחת הגשה ״אבני נחל״ · קטן', detail: 'גודל קטן', sizes: [{ label: 'קטן', price: 50 }] },
  { id: 'vase', name: 'אגרטל', detail: 'גובה 13–20 ס״מ', sizes: [{ label: 'גובה 13–20', price: 110 }] },
  { id: 'shay-bowl', name: 'קערת שי', detail: 'קערה בעבודת יד', sizes: [{ label: 'קוטר 17', price: 75 }, { label: 'קוטר 20', price: 85 }] },
]

export const finishedVariants: ProductVariant[] = [
  { id: 'shay-bowl-smooth-pink-dance', productId: 'shay-bowl', material: 'smooth', artworkId: 'pink-dance', artworkName: 'ריקוד ורוד', images: ['/assets/products/shay-bowl/smooth/pink-dance.webp'] },
  { id: 'shay-bowl-speckled-pink-dance', productId: 'shay-bowl', material: 'speckled', artworkId: 'pink-dance', artworkName: 'ריקוד ורוד', images: ['/assets/products/shay-bowl/speckled/pink-dance.webp'] },
  { id: 'shay-bowl-smooth-spring', productId: 'shay-bowl', material: 'smooth', artworkId: 'spring', artworkName: 'פריחת אביב', images: ['/assets/products/shay-bowl/smooth/shay-bowl-smooth-spring.webp'] },
]

export const availableVariants = finishedVariants.filter((variant) => variant.images.length > 0)
export const publishedProducts = products.filter((product) => availableVariants.some((variant) => variant.productId === product.id))

export const artists = [
  { name: 'עירית סגל', phone: '052-2486836', whatsapp: '972522486836' },
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
