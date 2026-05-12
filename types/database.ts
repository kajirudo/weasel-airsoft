export type GameStatus   = 'lobby' | 'active' | 'finished'
export type QrCodeId    = 'player_1' | 'player_2' | 'player_3' | 'player_4' | 'player_5' | 'player_6'
export type Team        = 'none' | 'red' | 'blue'
export type MarkerMode  = 'qr' | 'aruco'
export type GameMode    = 'battle' | 'survival' | 'tactics'
export type PlayerRole  = 'survivor' | 'hunter'
export type ObjectiveType = 'medkit' | 'damage_boost' | 'generator' | 'control_point'

export interface Game {
  id:               string
  status:           GameStatus
  created_at:       string
  started_at:       string | null
  finished_at:      string | null
  winner_id:        string | null
  winner_team:      string | null   // 'red'|'blue'|'hunter'|'survivor'|null
  hit_damage:       number
  shoot_cooldown:   number
  short_code:       string | null
  duration_minutes: number
  next_game_id:     string | null
  team_mode:        boolean
  marker_mode:      MarkerMode
  // ── 3モード ──────────────────────────────────────────────────────────────
  game_mode:        GameMode
  // バトルモード（ストーム）
  storm_center_lat: number | null
  storm_center_lng: number | null
  storm_radius_m:   number           // 初期安全圏半径（m）
  storm_final_m:    number           // 最終安全圏半径（m）
  // タクティクスモード（スコア）
  score_red:        number
  score_blue:       number
}

export interface Player {
  id:           string
  game_id:      string
  name:         string
  hp:           number
  qr_code_id:   QrCodeId
  device_id:    string
  is_alive:     boolean
  joined_at:    string
  last_seen:    string
  last_shot_at: string | null
  kills:        number
  team:         Team
  killer_name:  string | null
  killcam_url:  string | null
  lat:          number | null
  lng:          number | null
  heading:      number | null
  // 3モード追加
  role:         PlayerRole
  damage_boost: boolean
}

export interface GameObjective {
  id:             string
  game_id:        string
  lat:            number
  lng:            number
  type:           ObjectiveType
  // アイテム
  is_claimed:     boolean
  claimed_by:     string | null
  // 発電機
  is_activated:   boolean
  activate_start: string | null
  activating_by:  string | null
  // 拠点
  controlled_by:  'red' | 'blue' | 'none'
  control_since:  string | null
  capture_start:  string | null
  capturing_team: 'red' | 'blue' | null
  created_at:     string
}
