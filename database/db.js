const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'verifications.db'));

// Create the table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS verifications (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    birthdate TEXT,
    id_image TEXT,
    selfie_image TEXT,
    canvas_image TEXT,
    status TEXT,
    attempts INTEGER DEFAULT 0
  )
`).run();

module.exports = {
  storeVerification(data) {
    const { userId, username, birthdate, idImage, selfieImage, canvasImage } = data;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO verifications 
      (user_id, username, birthdate, id_image, selfie_image, canvas_image, status, attempts)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', COALESCE((SELECT attempts FROM verifications WHERE user_id = ?), 0) + 1)
    `);
    stmt.run(userId, username, birthdate, idImage, selfieImage, canvasImage, userId);
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

  blockUser(userId) {
    const existing = db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare("UPDATE verifications SET status = 'denied' WHERE user_id = ?").run(userId);
    } else {
      db.prepare("INSERT INTO verifications (user_id, status) VALUES (?, 'denied')").run(userId);
    }
    console.log(`User ${userId} has been denied and blocked from verifying again.`);
  },

  unblockUser(userId) {
    db.prepare("UPDATE verifications SET status = 'pending' WHERE user_id = ?").run(userId);
  },

  isBlocked(userId) {
    const row = db.prepare("SELECT status FROM verifications WHERE user_id = ?").get(userId);
    return row && row.status === 'denied';
  },

  logAttempt(userId) {
    db.prepare(`
      UPDATE verifications 
      SET attempts = attempts + 1 
      WHERE user_id = ?
    `).run(userId);
  }
};
