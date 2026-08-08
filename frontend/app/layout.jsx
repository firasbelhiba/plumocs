import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import RootLayoutClient from '@/components/layout/RootLayoutClient';

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
  /* `data-cs-nav` survives because `[data-cs-nav="off"]{--cs-navw:64px}` still
     drives the rail's animated width. `data-cs-rail` and `data-cs-filters` went
     with the selectors that read them (item 42): those two panes now answer to a
     breakpoint as well as a toggle, which a rule on <html> cannot express, so
     they take `railOn` / `filtersOn` as props instead. */
  return (
    <html lang="en" data-cs-nav="on" suppressHydrationWarning>
      <body>
        <script id="cs-theme-boot" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SNIPPET }} />
        <ThemeProvider>
          <RootLayoutClient>{children}</RootLayoutClient>
        </ThemeProvider>
      </body>
    </html>
  );
}
