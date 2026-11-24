export interface GalleryArtwork {
  id: string
  image: string
  name: string
}

export const galleryArtworks: GalleryArtwork[] = [
  { id: 'gallery-09', image: '/assets/gallery/gallery-09.webp', name: 'שלל שרב' },
  { id: 'gallery-11', image: '/assets/gallery/gallery-11.webp', name: 'שיר געגועים' },
  { id: 'gallery-03', image: '/assets/gallery/gallery-03.webp', name: 'עכשיו להתאהב' },
  { id: 'gallery-13', image: '/assets/gallery/gallery-13.webp', name: 'נישאים ברוח' },
  { id: 'gallery-05', image: '/assets/gallery/gallery-05.webp', name: 'השדה המוזהב' },
  { id: 'gallery-22', image: '/assets/gallery/gallery-22.webp', name: 'כמה כחול הערב' },
  { id: 'gallery-07', image: '/assets/gallery/gallery-07.webp', name: 'ילדתי שלי' },
  { id: 'gallery-08', image: '/assets/gallery/gallery-08.webp', name: 'אגדת דשא' },
  { id: 'gallery-01', image: '/assets/gallery/gallery-01.webp', name: 'קסמי הפשטות' },
  { id: 'gallery-10', image: '/assets/gallery/gallery-10.webp', name: 'שחר עולה' },
  { id: 'gallery-02', image: '/assets/gallery/gallery-02.webp', name: 'ערב כחול עמוק' },
  { id: 'gallery-12', image: '/assets/gallery/gallery-12.webp', name: 'דק מן הדק' },
  { id: 'gallery-04', image: '/assets/gallery/gallery-04.webp', name: 'גלגול צחוקה' },
  { id: 'gallery-21', image: '/assets/gallery/gallery-21.webp', name: 'מים מתוקים' },
  { id: 'gallery-15', image: '/assets/gallery/gallery-15.webp', name: 'פרדס רימונים' },
  { id: 'gallery-16', image: '/assets/gallery/gallery-16.webp', name: 'נוגה' },
  { id: 'gallery-17', image: '/assets/gallery/gallery-17.webp', name: 'רוח של סוף יום' },
  { id: 'gallery-18', image: '/assets/gallery/gallery-18.webp', name: 'בצהרי היום' },
  { id: 'gallery-19', image: '/assets/gallery/gallery-19.webp', name: 'בשדה הירוק' },
  { id: 'gallery-20', image: '/assets/gallery/gallery-20.webp', name: 'שדות גולדברג' },
  { id: 'gallery-14', image: '/assets/gallery/gallery-14.webp', name: 'לגמרי במקרה' },
  { id: 'gallery-06', image: '/assets/gallery/gallery-06.webp', name: 'זרעי קיץ' },
]

export function galleryArtwork(id: string): GalleryArtwork | undefined {
  return galleryArtworks.find((artwork) => artwork.id === id)
}
