'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Game, Player, TraitorVote } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface MeetingState {
  /** 集会が進行中か */
  isActive:      boolean
  /** 集会 UUID */
  meetingId:     string | null
  /** 集会終了時刻 (ISO) */
  until:         string | null
  /** 残り秒数 */
  secondsLeft:   number
  /** 投票一覧 */
  votes:         TraitorVote[]
  /** 自分の投票（未投票なら null）*/
  myVote:        TraitorVote | null
  /** 全員投票済みか */
  allVoted:      boolean
}

interface Props {
  game:          Game | null
  selfPlayer:    Player | undefined
  /** 投票結果が確定したときに呼ばれる */
  onResolved?:   (result: { exileId: string | null; exileRole: string | null; gameOver: boolean; winner: string | null }) => void
}

export function useMeeting({ game, selfPlayer, onResolved }: Props): MeetingState {
  const supabaseRef  = useRef(createClient())
  const channelRef   = useRef<RealtimeChannel | null>(null)
  const onResolvedRef = useRef(onResolved)
  useEffect(() => { onResolvedRef.current = onResolved }, [onResolved])

  const [votes, setVotes]           = useState<TraitorVote[]>([])
  const [secondsLeft, setSecondsLeft] = useState(0)

  const meetingId  = game?.meeting_id    ?? null
  const until      = game?.meeting_until ?? null
  const isActive   = meetingId !== null
  const myVote     = votes.find(v => v.voter_id === selfPlayer?.id) ?? null

  // ── 残り時間カウントダウン ────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !until) { setSecondsLeft(0); return }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000))
      setSecondsLeft(diff)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [isActive, until])

  // ── 投票 Realtime 購読 ────────────────────────────────────────────────
  useEffect(() => {
    if (!game?.id || !isActive || !meetingId) {
      setVotes([])
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
        channelRef.current = null
      }
      return
    }

    // 既存の投票を初期ロード
    supabaseRef.current
      .from('traitor_votes')
      .select('*')
      .eq('meeting_id', meetingId)
      .then(({ data }: { data: TraitorVote[] | null }) => { if (data) setVotes(data) })

    const ch = supabaseRef.current
      .channel(`meeting:${meetingId}:votes`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'traitor_votes', filter: `meeting_id=eq.${meetingId}` },
        (payload: { new: TraitorVote }) => {
          setVotes(prev => {
            const exists = prev.some(v => v.id === payload.new.id)
            return exists ? prev : [...prev, payload.new]
          })
        },
      )
      .subscribe()

    channelRef.current = ch
    return () => {
      supabaseRef.current.removeChannel(ch)
      channelRef.current = null
    }
  }, [game?.id, meetingId, isActive])

  // ── 集会終了（meeting_id が null に変わった）を検知してコールバック ─────
  // game は useGameRealtime で購読済みなので、ここでは game.meeting_id の変化を監視するだけ
  const prevMeetingIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevMeetingIdRef.current !== null && meetingId === null) {
      // 集会が終わった → 親から onResolved で結果を受け取るのでここでは何もしない
      setVotes([])
    }
    prevMeetingIdRef.current = meetingId
  }, [meetingId])

  // ── 全員投票済み判定 ─────────────────────────────────────────────────
  // 実際の total 人数は game 自体に持っていないので votes が game player 数に達したら全員とみなす
  // ここでは parent が submitVote の返り値で判断する設計なのでシンプルに votes 配列の長さ返し
  const allVoted = votes.length > 0 && isActive

  return { isActive, meetingId, until, secondsLeft, votes, myVote, allVoted }
}
