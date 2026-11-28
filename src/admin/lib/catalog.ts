import { supabase } from './supabase'
import type { ArtworkRow, ProductRow, SizeRow, StageRow, VariantRow } from './types'

export interface Catalog {
  products: ProductRow[]
  sizes: SizeRow[]
  variants: VariantRow[]
  artworks: ArtworkRow[]
  stages: StageRow[]
}

export async function fetchCatalog(): Promise<Catalog> {
  const [products, sizes, variants, artworks, stages] = await Promise.all([
    supabase.from('ceramic_products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('product_sizes').select('*'),
    supabase.from('catalog_variants').select('*').eq('is_published', true),
    supabase.from('artworks').select('*').eq('is_active', true).order('name'),
    supabase.from('production_stages').select('*').order('sort_order'),
  ])
  return {
    products: products.data ?? [],
    sizes: sizes.data ?? [],
    variants: variants.data ?? [],
    artworks: artworks.data ?? [],
    stages: stages.data ?? [],
  }
}

export function sizesOf(catalog: Catalog, productId: string): SizeRow[] {
  return catalog.sizes.filter((size) => size.product_id === productId)
}

export function variantsOf(catalog: Catalog, productId: string): VariantRow[] {
  return catalog.variants.filter((variant) => variant.product_id === productId)
}

export function stageName(catalog: Catalog, stageId: number): string {
  return catalog.stages.find((stage) => stage.id === stageId)?.name_he ?? `שלב ${stageId}`
}
