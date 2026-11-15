import { questions } from './questions'
import type { Question } from './data/answer-data'

export type HistoryEntry = { key: string; id: Question['id']; label: string }

export function newEntry(question: Question): HistoryEntry {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, id: question.id, label: question.title }
}

export function addEntry(entries: HistoryEntry[], entry: HistoryEntry) {
  if (entries.some((item) => item.key === entry.key)) return entries
  const repeats = entries.filter((item) => item.id === entry.id).length
  const title = questions.find((item) => item.id === entry.id)!.title
  return [{ ...entry, label: repeats ? `${title} ${repeats + 1}` : title }, ...entries]
}
