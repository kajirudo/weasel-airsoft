import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Weasel Airsoft',
  description: 'AR Laser Tag Game',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// 必須環境変数
const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

function getMissingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key])
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const missing = getMissingEnv()

  if (missing.length > 0) {
    return (
      <html lang="ja" className="h-full">
        <body className="h-full bg-gray-950 text-white flex items-center justify-center p-8">
          <div className="max-w-md w-full space-y-4">
            <div className="text-center space-y-1">
              <p className="text-red-400 text-xs font-mono uppercase tracking-widest">
                Configuration Error
              </p>
              <h1 className="text-2xl font-black text-white">
                Supabase Configuration Missing
              </h1>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-gray-400 text-sm">
                以下の環境変数が設定されていません。
                プロジェクトルートに <code className="text-green-400">.env.local</code> ファイルを作成してください。
              </p>
              <ul className="space-y-1">
                {missing.map((key) => (
                  <li key={key} className="flex items-center gap-2">
                    <span className="text-red-400 text-xs">✗</span>
                    <code className="text-yellow-400 text-sm">{key}</code>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs font-mono mb-2">.env.local</p>
              <pre className="text-green-400 text-xs leading-relaxed whitespace-pre-wrap">
                {`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...\nSUPABASE_SERVICE_ROLE_KEY=eyJ...`}
              </pre>
            </div>

            <p className="text-gray-600 text-xs text-center">
              設定後に開発サーバーを再起動してください。
            </p>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-black text-white antialiased">{children}</body>
    </html>
  )
}
