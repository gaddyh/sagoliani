// Runs after `vite build`: renders the page to static HTML so search engines and link previews see real content.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const siteUrl = (process.env.SITE_URL || 'https://sagoliani.onrender.com').replace(/\/?$/, '/')
const dist = new URL('../dist/', import.meta.url)

// The studio reads the query string while rendering; Node has no `location`, so provide the empty home-page one.
globalThis.location = new URL(siteUrl)

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } })
try {
  const { render, structuredData } = await vite.ssrLoadModule('/src/entry-server.tsx')
  const template = await readFile(new URL('index.html', dist), 'utf8')
  if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty root to fill')
  const jsonLd = JSON.stringify(structuredData(siteUrl)).replace(/</g, '\\u003c')
  const html = template
    .replaceAll('__SITE_URL__', siteUrl)
    .replace('</head>', `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${render()}</div>`)
  await writeFile(new URL('index.html', dist), html)
  // /admin/studio renders on the client; a static copy of the shell makes the deep link work on any host.
  const studioHtml = template
    .replaceAll('__SITE_URL__', siteUrl)
    .replace(/<title>.*?<\/title>/, '<title>ART IN CLAY | הסטודיו</title>')
    .replace('<meta name="viewport"', '<meta name="robots" content="noindex" />\n    <meta name="viewport"')
  await mkdir(new URL('admin/studio/', dist), { recursive: true })
  await writeFile(new URL('admin/studio/index.html', dist), studioHtml)
  await writeFile(new URL('robots.txt', dist), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${siteUrl}sitemap.xml\n`)
  await writeFile(new URL('sitemap.xml', dist), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}</loc></url>\n</urlset>\n`)
  console.log(`Prerendered dist/index.html (${Math.round(html.length / 1024)} KB) for ${siteUrl}`)
} finally {
  await vite.close()
}
