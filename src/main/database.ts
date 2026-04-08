import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

export interface Lead {
  id?: number
  name: string
  phone: string
  address: string
  website: string
  email: string
  custom_message: string
}

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'whatsmaps.db')
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      phone          TEXT,
      address        TEXT,
      website        TEXT,
      email          TEXT,
      custom_message TEXT
    )
  `)

  // Migrations (silent if column already exists)
  try { db.exec(`ALTER TABLE leads ADD COLUMN custom_message TEXT`) } catch { /* already exists */ }
  try { db.exec(`UPDATE leads SET custom_message = ai_message WHERE custom_message IS NULL AND ai_message IS NOT NULL`) } catch { /* ai_message column may not exist */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN email TEXT DEFAULT ''`) } catch { /* already exists */ }
}

export function saveLead(lead: Omit<Lead, 'id'>): Lead {
  const stmt = db.prepare(
    'INSERT INTO leads (name, phone, address, website, email, custom_message) VALUES (@name, @phone, @address, @website, @email, @custom_message)'
  )
  const result = stmt.run({
    name: lead.name,
    phone: lead.phone,
    address: lead.address,
    website: lead.website,
    email: lead.email ?? '',
    custom_message: lead.custom_message
  })
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

export function getLeadsWithoutCustomMessage(): Lead[] {
  return db
    .prepare("SELECT * FROM leads WHERE custom_message IS NULL OR custom_message = '' ORDER BY id ASC")
    .all() as Lead[]
}

export function updateLeadCustomMessage(id: number, message: string): void {
  db.prepare('UPDATE leads SET custom_message = ? WHERE id = ?').run(message, id)
}

export function deleteAllLeads(): void {
  db.prepare('DELETE FROM leads').run()
}
