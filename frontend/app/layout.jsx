import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import RootLayoutClient from '@/components/layout/RootLayoutClient';

// Self-hosted, same two faces and same CSS variable names as PM
// (src/app/layout.tsx:17-18), so a file ported from either side resolves
// `--font-geist-sans` / `--font-geist-mono` identically. Replaces the
// render-blocking `@import` of fonts.googleapis.com that used to sit at the top
// of globals.css, which also loaded only weights 400/500/600 — anything at
// `font-bold` was synthesized faux-bold. Variable Inter covers 100–900.
const sans = Inter({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata = {
  title: 'Plumo CS Console',
  description: 'plumo customer support — agent console',
};

// Inline script that runs BEFORE React hydrates, so the stored theme and
// density are on <html> for the first paint rather than a frame of light.
// Mirrors ThemeProvider's own bootstrap exactly. PM uses `next/script`
// beforeInteractive for its equivalent (src/app/layout.tsx:120) but on Next 15
// an inline beforeInteractive script is emitted into the RSC flight payload
// rather than the document, so it would run after first paint — a raw script
// tag is the only form that still executes during parse.
const THEME_BOOT_SNIPPET = `
(function(){try{
  var r=document.documentElement;
  var t=localStorage.getItem('theme');
  if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
  r.classList.remove('light','dark','terminal');
  r.classList.add(t);
  var d=localStorage.getItem('plumo_density');
  if(d==='compact'||d==='relaxed'){r.dataset.density=d;}else{r.removeAttribute('data-density');}
}catch(e){}})();
`;

export default function RootLayout({ children }) {
  /* No `data-cs-*` attributes left. `data-cs-rail` / `data-cs-filters` went
     with the selectors that read them (item 42), and `data-cs-nav` went with
     `--cs-navw`: the sidebar now writes both of its widths as classes, the way
     PM's does, so nothing on <html> decides how wide a pane is. */
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <script id="cs-theme-boot" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SNIPPET }} />
        <ThemeProvider>
          <RootLayoutClient>{children}</RootLayoutClient>
        </ThemeProvider>
      </body>
    </html>
  );
}
