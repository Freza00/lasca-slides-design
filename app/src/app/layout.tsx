import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ToastContainer } from '@/components/ui/Toast';
import { DebugPanel } from '@/components/ui/DebugPanel';
import { LanguageToggle, HtmlLangSetter } from '@/components/ui/LanguageToggle';
import {
  Poppins,
  Noto_Sans_SC,
  Noto_Serif_SC,
  Fraunces,
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Lora,
  Instrument_Serif,
  Familjen_Grotesk,
  Caveat,
  Inter,
  Source_Serif_4,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Cormorant_Garamond,
  Work_Sans,
  Libre_Caslon_Text,
} from 'next/font/google';
import { AuthProvider } from '@/lib/authContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { GlobalFileDropGuard } from '@/components/ui/GlobalFileDropGuard';
import './globals.css';

// ----- 既有：fallback 路径用，renderSlide.ts §5 不动条款 -----
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sans-sc',
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
});

// bilingual-report preset 用：Kai 系统字体的 web fallback（当用户系统无 Kai 时）
const notoSerifSC = Noto_Serif_SC({
  variable: '--font-noto-serif-sc',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

// ----- frontend-design 审美底座 (AI prompt 路径用) -----
// 见 lib/ai/harness/designPrinciples.ts → DESIGN_FONT_PAIRS
// AI 在 slide JSON 的 style override 里通过 var(--font-display-*) / var(--font-body-*) 引用

// Variable mode required for SOFT/WONK/opsz axes. Browser interpolates any
// weight from 100..900 via the variable axis — drops `weight` array entirely.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: '--font-bricolage-grotesque',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// ----- Theme typography (theme switcher 路径用) -----
// themes.ts 的 cool/dark 直接引用 "Instrument Serif" / "Familjen Grotesk" 字面值，
// next/font 在 <html className> 注入后，inline style 字符串可以解析到 subset。

// 冰川 — display: high-contrast didone serif (italic on cover)
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// 冰川 — body: Nordic grotesque
const familjenGrotesk = Familjen_Grotesk({
  variable: '--font-familjen-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// ----- Brand logotype (壁画手写体) -----
const caveat = Caveat({
  variable: '--font-brand',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// ----- Analyst-scene layered fonts (2026-04-16) -----
// Three institutional archetypes — IB / consulting / PE — get distinct type stacks.
// See themes.ts `ANALYST_*_BASE` for which theme consumes which stack.

// analyst-light (investment-bank-esque): neutral geometric sans for body/label
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// analyst-mist (consulting-firm-esque): slim newsprint serif for display
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// analyst-mist (consulting-firm-esque): data sans for body/label
const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// analyst-mist: monospaced numerics (consulting deck DNA)
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

// analyst-dark (PE-esque): garalde display serif
const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

// analyst-dark: humanist sans for body/label
const workSans = Work_Sans({
  variable: '--font-work-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// analyst-dark: old-style lining numerals for ledgers
const libreCaslon = Libre_Caslon_Text({
  variable: '--font-libre-caslon',
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Lasca — AI Slide Editor',
  description: 'Create beautiful presentations with AI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = [
    poppins.variable,
    notoSansSC.variable,
    notoSerifSC.variable,
    fraunces.variable,
    bricolageGrotesque.variable,
    plusJakartaSans.variable,
    lora.variable,
    instrumentSerif.variable,
    familjenGrotesk.variable,
    caveat.variable,
    inter.variable,
    sourceSerif.variable,
    ibmPlexSans.variable,
    ibmPlexMono.variable,
    cormorant.variable,
    workSans.variable,
    libreCaslon.variable,
  ].join(' ');

  return (
    <html lang="en" className={`${fontVars} h-full`}>
      <body className="h-full overflow-hidden font-sans">
        <GlobalFileDropGuard />
        <ErrorBoundary>
          <AuthProvider>
            {children}
            <FeedbackButton />
          </AuthProvider>
        </ErrorBoundary>
        <ToastContainer />
        <DebugPanel />
        <HtmlLangSetter />
        <LanguageToggle />
        <Analytics />
        <SpeedInsights />
        {/* Google Identity Services — used by RegisterFlow when feature_flags.auth_mode='google_only' */}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      </body>
    </html>
  );
}
