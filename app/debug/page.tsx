/**
 * Debug page — server component wrapper.
 * Production では 404 を返す。開発時のみ DebugClient を描画する。
 */
import { notFound } from 'next/navigation'
import { DebugClient } from './DebugClient'

export default function DebugPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <DebugClient />
}
