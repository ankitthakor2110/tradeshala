import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/config/landing";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [{ name: siteConfig.author }],
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.querySelectorAll('[contenteditable],[fdprocessedid]').forEach(function(el) {
                  el.removeAttribute('contenteditable');
                  el.removeAttribute('fdprocessedid');
                  el.removeAttribute('style');
                });
                new MutationObserver(function(mutations) {
                  mutations.forEach(function(m) {
                    if (m.type === 'attributes') {
                      var attr = m.attributeName;
                      if (attr === 'contenteditable' || attr === 'fdprocessedid') {
                        m.target.removeAttribute(attr);
                      }
                    }
                  });
                }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['contenteditable', 'fdprocessedid'] });
              } catch(e) {}
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
