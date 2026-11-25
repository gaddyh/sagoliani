import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'
import { artists, displayVariant, priceLabel, publishedProducts } from './data/products'

export function render(): string {
  return renderToString(<StrictMode><App /></StrictMode>)
}

export function structuredData(siteUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'ART IN CLAY',
    description: 'כשמכחול פוגש את החומר — קדרות, קרמיקה בעבודת יד וציורי מים מקוריים של עירית סגול ואפרת ליאני.',
    url: siteUrl,
    image: `${siteUrl}og-image-v3.jpg`,
    telephone: artists.map((artist) => `+${artist.whatsapp}`),
    founder: artists.map((artist) => ({ '@type': 'Person', name: artist.name })),
    ...(publishedProducts.length ? { priceRange: `₪${Math.min(...publishedProducts.flatMap((product) => product.sizes.map((size) => size.price)))}–₪${Math.max(...publishedProducts.flatMap((product) => product.sizes.map((size) => size.price)))}` } : {}),
    makesOffer: publishedProducts.map((product) => ({
      '@type': 'Offer',
      priceCurrency: 'ILS',
      price: Math.min(...product.sizes.map((size) => size.price)),
      itemOffered: { '@type': 'Product', name: product.name, description: `${product.detail} · ${priceLabel(product)}`, image: displayVariant(product)!.images.map((image) => `${siteUrl}${image.slice(1)}`) },
    })),
  }
}
