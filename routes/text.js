const express = require('express');
const router = express.Router();
const { format } = require('date-fns');
const { ro } = require('date-fns/locale');
const cache = require('memory-cache');

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

module.exports = (db) => {
    router.post('/', async (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).send('Unauthorized');
        }
    
        const { text, date, details } = req.body;
    
        try {
            if (text && date && details) {
                await db.createText(text, date, details);
            } else {
                res.status(400).send('Missing required fields');
            }
    
            res.redirect('/text');
        } catch (err) {
            console.error('Error adding text:', err);
            res.status(500).send('Internal Server Error');
        }
    });        

router.get('/', async (req, res) => {
    try {
        let cachedTexts = cache.get('events');
        if (!cachedTexts) {
            const texts = await db.selectAllTexts();
            texts.forEach(text => {
                const formattedDate = format(new Date(text.date), 'dd MMMM yyyy', { locale: ro });
                
                const [day, month, year] = formattedDate.split(' ');
                text.formattedDate = `${day} ${capitalizeFirstLetter(month)} ${year}`;
            });

            cache.put('events', texts, 60000);
            cachedTexts = texts;
        }

        res.render('index', { list: cachedTexts });
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
        const { text, date, details } = req.body;
    
        try {
            await db.updateText(id, text, date, details);
            res.redirect('/text');
        } catch (err) {
            console.error('Error updating text:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    return router;
};