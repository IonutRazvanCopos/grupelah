const express = require('express');
const router = express.Router();
const { format } = require('date-fns');
const { ro } = require('date-fns/locale');
const sendWhatsAppMessage = require('../whatsapp');

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}


function generateRecurringDates(startDateStr, endDateStr, type, weekdays = [], monthDays = []) {
    const dates = [];

    const startDate = parseLocalDate(startDateStr);
    const endDate = parseLocalDate(endDateStr);


    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    let current = new Date(startDate);

    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const dayOfMonth = current.getDate();

        if (type === 'daily') {
            dates.push(new Date(current));
        } else if (type === 'weekly') {
            if (weekdays.includes(dayOfWeek)) {
                dates.push(new Date(current));
            }
        } else if (type === 'monthly') {
            if (monthDays.includes(dayOfMonth)) {
                dates.push(new Date(current));
            }
        }

        current.setDate(current.getDate() + 1);
    }

    return dates;
}

module.exports = (db) => {
    router.post('/', async (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).send('Unauthorized');
        }

        const {
            text,
            date,
            details,
            isRecurring,
            recurrenceType,
            recurrenceEndDate,
            weekdays,
            monthDays
        } = req.body;

        try {
            let allDates = [];

            if (isRecurring === 'on' && recurrenceType && recurrenceEndDate) {
                let parsedWeekdays = [];
                if (Array.isArray(weekdays)) {
                    parsedWeekdays = weekdays.map(Number);
                } else if (typeof weekdays === 'string') {
                    parsedWeekdays = [Number(weekdays)];
                }

                let parsedMonthDays = [];
                if (monthDays) {
                    parsedMonthDays = monthDays
                        .split(',')
                        .map(d => parseInt(d.trim()))
                        .filter(n => !isNaN(n));
                }

                allDates = generateRecurringDates(
                    date,
                    recurrenceEndDate,
                    recurrenceType,
                    parsedWeekdays,
                    parsedMonthDays
                );

                console.log("Date recurente generate:", allDates.map(d => d.toISOString().split('T')[0]));

                for (const d of allDates) {
                    await db.createText(
                        text,
                        d.toISOString().split('T')[0],
                        details,
                        true,
                        recurrenceType,
                        recurrenceEndDate
                    );
                }
            } else {
                await db.createText(
                    text,
                    date,
                    details,
                    false,
                    null,
                    null
                );
            }

            res.redirect('/text');
        } catch (err) {
            console.error('Error adding text:', err);
            res.status(500).send('Internal Server Error');
        }
    });
    
    router.get('/', async (req, res) => {
        try {
            const events = await db.selectAllTexts();
            events.forEach(event => {
                const formattedDate = format(new Date(event.date), 'dd MMMM yyyy', { locale: ro });
                const [day, month, year] = formattedDate.split(' ');
                event.formattedDate = `${day} ${capitalizeFirstLetter(month)} ${year}`;
            });
    
            res.render('index', {
                list: events,
                eventDates: events.map(event => event.date.toISOString().split('T')[0]),
                remainingEvents: events.length
            });
        } catch (err) {
            console.error('Error fetching texts:', err);
            res.status(500).send('Internal Server Error');
        }
    });    

    router.get('/', async (req, res) => {
        try {
            const texts = await db.selectAllTexts();
            texts.forEach(text => {
                const formattedDate = format(new Date(text.date), 'dd MMMM yyyy', { locale: ro });
                
                const [day, month, year] = formattedDate.split(' ');
                text.formattedDate = `${day} ${capitalizeFirstLetter(month)} ${year}`;
            });
            res.render('index', { list: texts });
        } catch (err) {
            console.error('Error fetching texts:', err);
            res.status(500).send('Internal Server Error');
        }
    });
        
    router.get('/history', async (req, res) => {
        try {
            const query = 'SELECT * FROM texts_history ORDER BY date DESC';
            const result = await db.pool.query(query);
    
            const totalEvents = result.rows.length;
            res.render('history', { events: result.rows, totalEvents });
        } catch (error) {
            console.error('Error fetching history:', error);
            res.status(500).send('Internal Server Error');
        }
    });    

    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const text = await db.selectTextWithId(id);
            console.log('Fetched text:', text);
            if (!text) {
                return res.status(404).send('Text not found');
            }
            res.render('text_details', { text });
        } catch (err) {
            console.error('Error fetching text details:', err);
            res.status(500).send('Internal Server Error');
        }
    });    

    router.delete('/:id', async (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).send('Unauthorized');
        }
    
        const { id } = req.params;
        try {
            await db.deleteText(id);
            res.redirect('/text');
        } catch (err) {
            console.error('Error deleting text:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    router.get('/edit/:id', async (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).send('Unauthorized');
        }
    
        const { id } = req.params;
        try {
            const text = await db.selectTextWithId(id);
            console.log('Text fetched from DB:', text);
            if (!text) {
                return res.status(404).send('Text not found');
            }
            res.render('edit', { text });
        } catch (err) {
            console.error('Database query error:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    router.post('/edit/:id', async (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).send('Unauthorized');
        }

        const { id } = req.params;
        const {
            text,
            date,
            details,
            isRecurring,
            recurrenceType,
            recurrenceEndDate
        } = req.body;

        try {
            await db.updateText(
            id,
            text,
            date,
            details,
            isRecurring === 'on',
            recurrenceType || null,
            recurrenceEndDate || null
            );
            res.redirect('/text');
        } catch (err) {
            console.error('Error updating text:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    return router;
};
