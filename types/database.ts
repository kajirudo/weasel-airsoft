export type GameStatus = 'lobby' | 'active' | 'finished'
export type QrCodeId = 'player_1' | 'player_2' | 'player_3' | 'player_4' | 'player_5' | 'player_6'

export interface Game {
  id: string
  status: GameStatus
  created_at: string
  started_at: string | null
  finished_at: string | null
  winner_id: string | null
  hit_damage: number
  shoot_cooldown: number
  short_code: string | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  hp: number
  qr_code_id: QrCodeId
  device_id: string
  is_alive: boolean
  joined_at: string
  last_seen: string
}
