export type ProductId = 'cake-pan' | 'speckled-platter' | 'round-platter' | 'deep-bowl' | 'flat-bowl' | 'english-platter' | 'river-stones' | 'vase'

export interface ProductSize {
  label: string
  price: number
}

export interface Product {
  id: ProductId
  name: string
  detail: string
  image: string
  sizes: ProductSize[]
}

export const products: Product[] = [
  { id: 'cake-pan', name: 'תבנית לעוגה / קיש / פשטידה', detail: 'קוטר 26 · עומק 5 ס״מ', image: '/assets/brochure/cake-pan.webp', sizes: [{ label: 'קוטר 26', price: 165 }] },
  { id: 'speckled-platter', name: 'צלחת הגשה מעוגלת ענקית', detail: 'קוטר 30 ס״מ', image: '/assets/brochure/speckled-platter.webp', sizes: [{ label: 'קוטר 30', price: 145 }] },
  { id: 'round-platter', name: 'צלחת הגשה גדולה עגולה', detail: 'קוטר 30 ס״מ', image: '/assets/brochure/round-platter.webp', sizes: [{ label: 'קוטר 30', price: 150 }] },
  { id: 'deep-bowl', name: 'קערה עמוקה', detail: 'קוטר 17–20 · למרק או לסלטים', image: '/assets/brochure/deep-bowl.webp', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'flat-bowl', name: 'קערה שטוחה', detail: 'קוטר 17–20 · למרק או לסלטים', image: '/assets/brochure/flat-bowl.webp', sizes: [{ label: 'קוטר 17–20', price: 75 }] },
  { id: 'english-platter', name: 'צלחת הגשה אינגליש', detail: 'ישר או אובאלי · 35×15 ס״מ', image: '/assets/brochure/english-platter.webp', sizes: [{ label: 'ישר', price: 140 }, { label: 'אובאלי', price: 140 }] },
  { id: 'river-stones', name: 'צלחות הגשה ״אבני נחל״', detail: 'שלושה גדלים', image: '/assets/brochure/river-stones.webp', sizes: [{ label: 'גדול', price: 100 }, { label: 'בינוני', price: 75 }, { label: 'קטן', price: 50 }] },
  { id: 'vase', name: 'אגרטל', detail: 'גובה 13–20 ס״מ', image: '/assets/brochure/vase.webp', sizes: [{ label: 'גובה 13–20', price: 110 }] },
]

export const artists = [
  { name: 'עירית סגל', phone: '052-2486836', whatsapp: '972522486836' },
  { name: 'אפרת ליאני', phone: '052-3894291', whatsapp: '972523894291' },
]

export function priceLabel(product: Product): string {
  const prices = product.sizes.map((size) => size.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? `${min} ₪` : `${min}–${max} ₪`
}
