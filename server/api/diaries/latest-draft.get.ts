import { defineEventHandler } from 'h3'
import { getLatestSavedDraft } from '../../utils/diaryStore'
import { getSessionActor } from '../../utils/session'

export default defineEventHandler((event) => getLatestSavedDraft(getSessionActor(event)))
