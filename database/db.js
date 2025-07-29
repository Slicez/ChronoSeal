const Database = require('better-sqlite3');
const path = require('path');

// Database path now correctly points to project root
const db = new Database(path.join(__dirname, '../verifications.db'), { verbose: console.log });

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables with improved schema
db.transaction(() => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS verifications (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      birthdate TEXT NOT NULL,
      id_image TEXT,
      selfie_image TEXT,
      canvas_image TEXT,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 1,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      processed_by TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      user_id TEXT PRIMARY KEY,
      reason TEXT,
      blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      blocked_by TEXT,
      FOREIGN KEY(user_id) REFERENCES verifications(user_id)
    )
  `).run();
})();

module.exports = {
  // Store verification with transaction
  storeVerification(data) {
    const stmt = db.prepare(`
      INSERT INTO verifications 
      (user_id, username, birthdate, id_image, selfie_image, canvas_image)
      VALUES (@userId, @username, @birthdate, @idImage, @selfieImage, @canvasImage)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        birthdate = excluded.birthdate,
        id_image = excluded.id_image,
        selfie_image = excluded.selfie_image,
        canvas_image = excluded.canvas_image,
        attempts = attempts + 1
    `);
    stmt.run({
      userId: data.userId,
      username: data.username,
      birthdate: data.birthdate,
      idImage: data.idImage || null,
      selfieImage: data.selfieImage || null,
      canvasImage: data.canvasImage || null
    });
  },

  // Get verification with prepared statement
  getVerification: db.prepare('SELECT * FROM verifications WHERE user_id = ?').pluck(),

  // Approve user with timestamp
  approveUser(userId, moderatorId) {
    db.prepare(`
      UPDATE verifications 
      SET status = 'approved',
          processed_at = CURRENT_TIMESTAMP,
          processed_by = ?
      WHERE user_id = ?
    `).run(moderatorId, userId);
  },

  // Deny user with timestamp
  denyUser(userId, moderatorId) {
    db.prepare(`
      UPDATE verifications 
      SET status = 'denied',
          processed_at = CURRENT_TIMESTAMP,
          processed_by = ?
      WHERE user_id = ?
    `).run(moderatorId, userId);
  },

  // Block user with reason
  blockUser(userId, moderatorId, reason = '') {
    db.transaction(() => {
      this.denyUser(userId, moderatorId);
      db.prepare(`
        INSERT OR REPLACE INTO blocked_users 
        (user_id, blocked_by, reason)
        VALUES (?, ?, ?)
      `).run(userId, moderatorId, reason);
    })();
  },

  // Check if blocked (separate table)
  isBlocked(userId) {
    return !!db.prepare('SELECT 1 FROM blocked_users WHERE user_id = ?').get(userId);
  },

  // Unblock user
  unblockUser(userId) {
    db.prepare('DELETE FROM blocked_users WHERE user_id = ?').run(userId);
  },

  // Log attempt
  logAttempt: db.prepare('UPDATE verifications SET attempts = attempts + 1 WHERE user_id = ?'),

  // Close connection
  close: () => db.close(),

  // Direct access for complex queries
  get db() { return db; }
};