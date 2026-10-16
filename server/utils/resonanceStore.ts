import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { canReadDiary, getDiary, isDiaryOwner } from './diaryStore'
import type { SessionActor } from './session'
import { database, toMysqlDate } from './database'

export type ResonanceType = 'glow' | 'hug' | 'together' | 'same-experience'

interface ResonanceStateRow extends RowDataPacket {
  total: number | string
  selected_type: ResonanceType | null
}

const types = new Set<ResonanceType>(['glow', 'hug', 'together', 'same-experience'])

function actorUserId(actor: SessionActor) {
  return actor.isAuthenticated && actor.id.startsWith('user:') ? actor.id.slice(5) : undefined
}

function summaryFor(total: number) {
  if (total === 0) return '还没有人留下共鸣。你可以成为第一束微光。'
  if (total === 1) return '一束微光曾停在这里。'
  if (total <= 4) return '几束微光曾停在这里。'
  return '许多束微光曾在这里相遇。'
}

async function readableDiary(diaryId: string, actor: SessionActor) {
  const diary = await getDiary(diaryId)
  if (!diary) throw createError({ statusCode: 404, statusMessage: '没有找到这篇星笺' })
  if (!canReadDiary(diary, actor)) {
    throw createError({ statusCode: 403, statusMessage: '无法为不可见的星笺留下共鸣' })
  }
  return diary
}

export async function getResonanceState(diaryId: string, actor: SessionActor) {
  const diary = await readableDiary(diaryId, actor)
  const userId = actorUserId(actor)
  const [rows] = await database().execute<ResonanceStateRow[]>(
    `SELECT COUNT(*) AS total,
      MAX(CASE WHEN user_id = ? THEN type ELSE NULL END) AS selected_type
     FROM resonances WHERE diary_id = ?`,
    [userId ?? '', diaryId],
  )
  const total = Number(rows[0]?.total ?? 0)
  return {
    summary: summaryFor(total),
    selectedType: rows[0]?.selected_type ?? null,
    canResonate: Boolean(userId) && !isDiaryOwner(diary, actor),
    requiresLogin: !actor.isAuthenticated,
  }
}

export async function setResonance(diaryId: string, value: unknown, actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再留下共鸣' })
  const diary = await readableDiary(diaryId, actor)
  if (isDiaryOwner(diary, actor)) {
    throw createError({ statusCode: 403, statusMessage: '自己的星笺不需要由自己点亮' })
  }
  if (!types.has(value as ResonanceType)) {
    throw createError({ statusCode: 422, statusMessage: '请选择一种共鸣方式' })
  }

  const now = toMysqlDate(new Date().toISOString())
  await database().execute<ResultSetHeader>(
    `INSERT INTO resonances (id, diary_id, user_id, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE type = VALUES(type), updated_at = VALUES(updated_at)`,
    [randomUUID(), diaryId, userId, value as ResonanceType, now, now],
  )
  return await getResonanceState(diaryId, actor)
}

export async function removeResonance(diaryId: string, actor: SessionActor) {
  const userId = actorUserId(actor)
  if (!userId) throw createError({ statusCode: 401, statusMessage: '请先登录，再管理共鸣' })
  await readableDiary(diaryId, actor)
  await database().execute<ResultSetHeader>(
    'DELETE FROM resonances WHERE diary_id = ? AND user_id = ?',
    [diaryId, userId],
  )
  return await getResonanceState(diaryId, actor)
}
