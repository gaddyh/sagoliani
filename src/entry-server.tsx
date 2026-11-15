import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'
import { artists, products } from './data/products'

export function render(): string {
  return renderToString(<StrictMode><App /></StrictMode>)
}

export function structuredData(siteUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'ART IN CLAY',
    description: 'כשהחומר פוגש את המכחול — קרמיקה בעבודת יד וציורי מים מקוריים של עירית סגל ואפרת ליאני.',
    url: siteUrl,
    image: `${siteUrl}og-image.jpg`,
    telephone: artists.map((artist) => `+${artist.whatsapp}`),
    founder: artists.map((artist) => ({ '@type': 'Person', name: artist.name })),
    priceRange: '₪50–₪165',
    makesOffer: products.map((product) => ({
      '@type': 'Offer',
      priceCurrency: 'ILS',
      price: Math.min(...product.sizes.map((size) => size.price)),
      itemOffered: { '@type': 'Product', name: product.name, description: product.detail, image: `${siteUrl}${product.image.slice(1)}` },
    })),
  }
}
