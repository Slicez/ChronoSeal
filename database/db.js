const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'verifications.db'), { 
  verbose: console.log 
});

// Initialize database
db.pragma('journal_mode = WAL');
db.prepare(`
  CREATE TABLE IF NOT EXISTS verifications (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    birthdate TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 1,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).run();

module.exports = {
  storeVerification(data) {
    const stmt = db.prepare(`
      INSERT INTO verifications (user_id, username, birthdate)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        birthdate = excluded.birthdate,
        attempts = attempts + 1
    `);
    stmt.run(data.userId, data.username, data.birthdate);
  },

  getVerification(userId) {
    return db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(userId);
  },

  approveUser(userId) {
    db.prepare("UPDATE verifications SET status = 'approved' WHERE user_id = ?").run(userId);
  },

  denyUser(userId) {
    db.prepare("UPDATE verifications SET status = 'denied' WHERE user_id = ?").run(userId);
  },

  isBlocked(userId) {
    const row = db.prepare("SELECT status FROM verifications WHERE user_id = ?").get(userId);
    return row && row.status === 'denied';
  },

  close: () => db.close()
};