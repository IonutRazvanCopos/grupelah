const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'likeboss12345',
    port: 5432,
});


async function initializeDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS texts (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                date DATE NOT NULL,
                details TEXT
            );
        `);

        await pool.query(`
            ALTER TABLE texts
            ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS recurrence_type TEXT,
            ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS texts_history (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                date DATE NOT NULL,
                details TEXT,
                deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const columnCheck = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'texts' AND column_name = 'details';
        `);

        if (columnCheck.rows.length === 0) {
            console.log("Adding 'details' column to 'texts' table...");
            await pool.query(`
                ALTER TABLE texts ADD COLUMN details TEXT;
            `);

            await pool.query(`
                UPDATE texts SET details = 'No details available' WHERE details IS NULL;
            `);
        }

        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

initializeDB();

async function createText(content, date, details, isRecurring, recurrenceType, recurrenceEndDate) {
    const query = `
        INSERT INTO texts (content, date, details, is_recurring, recurrence_type, recurrence_end_date)
        VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await pool.query(query, [content, date, details, isRecurring, recurrenceType, recurrenceEndDate]);
}

async function selectAllTexts() {
    const query = 'SELECT * FROM texts ORDER BY date ASC';
    const result = await pool.query(query);
    return result.rows;
}

async function selectTextWithId(id) {
    const query = 'SELECT * FROM texts WHERE id = $1';
    const result = await pool.query(query, [id]);
    if (result.rows[0]) {
        const text = result.rows[0];
        text.date = text.date ? new Date(text.date) : null;
        return text;
    }
    return null;
}

async function deleteText(id) {
    const query = 'DELETE FROM texts WHERE id = $1';
    await pool.query(query, [id]);
}

async function updateText(id, content, date, details, isRecurring, recurrenceType, recurrenceEndDate) {
  const query = `
    UPDATE texts
    SET content = $1,
        date = $2,
        details = $3,
        is_recurring = $4,
        recurrence_type = $5,
        recurrence_end_date = $6
    WHERE id = $7
  `;
  await pool.query(query, [content, date, details, isRecurring, recurrenceType, recurrenceEndDate, id]);
}

async function archiveAndDeleteExpiredTexts() {
    const queryArchive = `
        INSERT INTO texts_history (content, date, details)
        SELECT content, date, details
        FROM texts
        WHERE date < CURRENT_DATE
        RETURNING *;
    `;

    const queryDelete = 'DELETE FROM texts WHERE date < CURRENT_DATE';

    try {
        const archivedEvents = await pool.query(queryArchive);
        console.log('Archived events:', archivedEvents.rows);

        await pool.query(queryDelete);
        console.log('Expired events deleted successfully.');
    } catch (error) {
        console.error('Error archiving and deleting expired events:', error);
    }
}

module.exports = {
    pool,
    createText,
    selectAllTexts,
    selectTextWithId,
    deleteText,
    updateText,
    archiveAndDeleteExpiredTexts,
};
