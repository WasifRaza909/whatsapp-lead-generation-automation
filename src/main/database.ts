import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

export interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  ai_message: string
}

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'whatsmaps.db')
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      phone      TEXT,
      address    TEXT,
      website    TEXT,
      ai_message TEXT
    )
  `)
}

export function saveLead(lead: Omit<Lead, 'id'>): Lead {
  const stmt = db.prepare(
    'INSERT INTO leads (name, phone, address, website, ai_message) VALUES (@name, @phone, @address, @website, @ai_message)'
  )
  const result = stmt.run(lead)
  return { id: result.lastInsertRowid as number, ...lead }
}

/**
 * Insert the lead only if no row with the same name+phone already exists.
 * Returns the saved lead (with id) if inserted, or null if it was a duplicate.
 * A missing phone is stored as an empty string — two leads with the same name
 * and no phone are treated as the same business.
 */
export function saveLeadIfNew(lead: Omit<Lead, 'id'>): Lead | null {
  const normalizedPhone = (lead.phone ?? '').trim()
  const existing = db
    .prepare('SELECT id FROM leads WHERE name = @name AND phone = @phone')
    .get({ name: lead.name, phone: normalizedPhone })
  if (existing) return null
  const toInsert = { ...lead, phone: normalizedPhone }
  return saveLead(toInsert)
}

export function getLeads(): Lead[] {
  return db.prepare('SELECT * FROM leads ORDER BY id DESC').all() as Lead[]
}

export function deleteLead(id: number): void {
  db.prepare('DELETE FROM leads WHERE id = ?').run(id)
}

export function getLeadsWithoutAiMessage(): Lead[] {
  return db
    .prepare("SELECT * FROM leads WHERE ai_message IS NULL OR ai_message = '' ORDER BY id ASC")
    .all() as Lead[]
}

export function updateLeadAiMessage(id: number, aiMessage: string): void {
  db.prepare('UPDATE leads SET ai_message = ? WHERE id = ?').run(aiMessage, id)
}
