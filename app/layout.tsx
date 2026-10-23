import type { Metadata } from 'next';
export const metadata: Metadata={title:'Hildon Farm',description:'The farm map and local livestock briefing.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
