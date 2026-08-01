import './globals.css';

export const metadata = {
  title: 'Plumo CS Console',
  description: 'plumo customer support — agent console',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-cs-theme="light" data-cs-soft="balanced" data-cs-nav="on" data-cs-rail="on" data-cs-filters="on" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
