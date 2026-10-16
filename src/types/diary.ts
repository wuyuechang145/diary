export type DiaryEmotion = 'calm' | 'gentle' | 'longing' | 'courage' | 'tension' | 'sadness' | 'unspecified'
export type DiaryVisibility = 'private' | 'friends' | 'anonymous' | 'public'
export type DiaryStatus = 'draft' | 'published'
export type DiaryPerspective = 'teen' | 'parent' | 'family' | 'unspecified'
export type DiaryCategory =
  | 'daily-life'
  | 'growth-conflict'
  | 'pressure'
  | 'communication'
  | 'expectation-responsibility'
  | 'understanding-gratitude'
  | 'unspecified'

export type DiarySummary = {
  id: string
  authorId?: string
  authorName: string
  date: string
  title: string
  summary: string
  emotion: DiaryEmotion
  perspective: DiaryPerspective
  category: DiaryCategory
  visibility: DiaryVisibility
  status: DiaryStatus
  location?: string
  createdAt: string
  updatedAt: string
  publishedAt?: string
  isOwner: boolean
}

export type DiaryDetail = DiarySummary & {
  content: string
  attachments: Array<{
    id: string
    type: 'image' | 'audio'
    name: string
  }>
}

export type SavedDraftPreview = {
  id: string
  title: string
  date: string
  updatedAt: string
}

export type DiaryListResponse = {
  scope: 'mine' | 'public'
  items: DiarySummary[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
}

export const emotionMeta: Record<DiaryEmotion, { label: string; sentence: string; symbol: string }> = {
  calm: { label: '平静', sentence: '像一片慢慢恢复清澈的水面。', symbol: '○' },
  gentle: { label: '温柔', sentence: '有一束暖光留在文字里面。', symbol: '◐' },
  longing: { label: '想念', sentence: '一条轨道正向很远的地方延伸。', symbol: '⌒' },
  courage: { label: '勇气', sentence: '核心正在稳定地向外发光。', symbol: '✦' },
  tension: { label: '压力', sentence: '紧绷的表面正在寻找可以呼吸的缝隙。', symbol: '◇' },
  sadness: { label: '难过', sentence: '运动慢了下来，为此刻留出空间。', symbol: '◒' },
  unspecified: { label: '未选择', sentence: '你还没有为此刻选择一种情绪。', symbol: '·' },
}

export const perspectiveMeta: Record<DiaryPerspective, { label: string; description: string }> = {
  teen: { label: '青少年', description: '从成长中的自己出发' },
  parent: { label: '父母', description: '说说养育、工作与生活' },
  family: { label: '其他家人', description: '来自家中另一种位置' },
  unspecified: { label: '不透露', description: '只让文字自己说话' },
}

export const categoryMeta: Record<DiaryCategory, { label: string; description: string }> = {
  'daily-life': { label: '写实日常', description: '生活片段与真实感受' },
  'growth-conflict': { label: '成长与矛盾', description: '变化、边界与彼此冲突' },
  pressure: { label: '压力与情绪', description: '学业、工作或内心负担' },
  communication: { label: '沟通与误解', description: '没说出口或没有被听懂的话' },
  'expectation-responsibility': { label: '期待与责任', description: '被期待与承担责任的重量' },
  'understanding-gratitude': { label: '理解与感谢', description: '看见彼此的不易与付出' },
  unspecified: { label: '暂不分类', description: '以后仍可随时补充' },
}
