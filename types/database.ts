export type GameStatus    = 'lobby' | 'active' | 'finished'
export type QrCodeId     =
  | 'player_1' | 'player_2' | 'player_3' | 'player_4' | 'player_5' | 'player_6'
  | 'bot_1'    | 'bot_2'    | 'bot_3'    | 'bot_4'    | 'bot_5'    | 'bot_6'    | 'bot_7' | 'bot_8'
export type Team         = 'none' | 'red' | 'blue'
export type MarkerMode   = 'qr' | 'aruco'
export type GameMode     = 'battle' | 'survival' | 'tactics' | 'traitor' | 'hunting'
export type PlayerRole   = 'survivor' | 'hunter'
export type PlayerRole2  = 'crew' | 'traitor' | 'sheriff'
export type ObjectiveType = 'medkit' | 'damage_boost' | 'generator' | 'control_point' | 'seal'
export type SabotageType = 'comms'
/** ソロプレイ用ボットの行動パターン */
export type BotBehavior  = 'roamer' | 'defender' | 'rusher' | 'crew_bot' | 'spy_bot'

export interface Game {
  id:               string
  status:           GameStatus
  created_at:       string
  started_at:       string | null
  finished_at:      string | null
  winner_id:        string | null
  winner_team:      string | null   // 'red'|'blue'|'hunter'|'survivor'|'crew'|'traitor'|null
  hit_damage:       number
  shoot_cooldown:   number
  short_code:       string | null
  duration_minutes: number
  next_game_id:     string | null
  team_mode:        boolean
  marker_mode:      MarkerMode
  // ── ゲームモード ──────────────────────────────────────────────────────────
  game_mode:        GameMode
  // バトルモード（ストーム）
  storm_center_lat: number | null
  storm_center_lng: number | null
  storm_radius_m:   number
  storm_final_m:    number
  // タクティクスモード（スコア）
  score_red:        number
  score_blue:       number
  // Traitor モード
  traitor_count:    number
  sheriff_enabled:  boolean
  task_goal:        number
  task_done:        number
  meeting_id:       string | null   // 進行中の集会UUID
  meeting_until:    string | null   // 集会終了 ISO 文字列
  sabotage_type:    SabotageType | null
  sabotage_until:   string | null
}

export interface Player {
  id:               string
  game_id:          string
  name:             string
  hp:               number
  qr_code_id:       QrCodeId
  device_id:        string
  is_alive:         boolean
  joined_at:        string
  last_seen:        string
  last_shot_at:     string | null
  kills:            number
  team:             Team
  killer_name:      string | null
  killcam_url:      string | null
  lat:              number | null
  lng:              number | null
  heading:          number | null
  // 3モード
  role:             PlayerRole
  damage_boost:     boolean
  // Traitor モード
  role2:            PlayerRole2
  tasks_done:       number
  meeting_uses:     number
  investigate_uses: number
  // ハンティング（hunting）モード
  npc_attack_last_at: string | null
  // ソロプレイ用ボット
  is_bot:        boolean
  bot_behavior:  BotBehavior | null
}

export interface TraitorVote {
  id:         string
  game_id:    string
  meeting_id: string
  voter_id:   string
  target_id:  string | null   // null = スキップ
  created_at: string
}

export interface GameObjective {
  id:             string
  game_id:        string
  lat:            number
  lng:            number
  type:           ObjectiveType
  // アイテム / 封印QR
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
  // 封印QR（hunting モード）
  seal_index:     number | null
  created_at:     string
}

/** ハンティングモード NPC レコード */
export interface GameNpc {
  id:                   string
  game_id:              string
  hp:                   number
  max_hp:               number
  lat:                  number | null
  lng:                  number | null
  heading:              number
  speed_mps:            number
  lockon_target_id:     string | null
  lockon_start_at:      string | null
  lockon_seconds:       number
  catch_range_m:        number
  lunge_armed_at:       string | null
  lunge_fire_at:        string | null
  last_lunge_at:        string | null
  lunge_interval_s:     number
  lunge_radius_m:       number
  stun_until:           string | null
  confused_until:       string | null
  controller_id:        string | null
  controller_heartbeat: string | null
}
