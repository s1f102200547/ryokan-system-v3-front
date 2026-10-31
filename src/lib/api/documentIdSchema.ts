import { z } from 'zod'

// Firestore のドキュメント ID の制約（https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields）。
// 満たさない ID を Firestore に渡すと例外になり、障害（503 + 通知）に分類されていた（BugHunting.md #5）
const MAX_DOCUMENT_ID_BYTES = 1500

export const DocumentIdSchema = z
  .string()
  .min(1)
  .refine((v) => new TextEncoder().encode(v).length <= MAX_DOCUMENT_ID_BYTES, 'ID が長すぎます')
  .refine((v) => !v.includes('/'), 'ID に / は使えません')
  .refine((v) => v !== '.' && v !== '..', 'ID に . と .. は使えません')
  .refine((v) => !/^__.*__$/.test(v), '__ で囲んだ ID は使えません')
