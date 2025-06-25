const express = require('express');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;
const cron = require('node-cron');
const db = require('./db');
const methodOverride = require('method-override');
const axios = require('axios');
require('dotenv').config();

app.use(methodOverride('_method'));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'grpelhdbrn',
    resave: false,
    saveUninitialized: true
}));
app.use((req, res, next) => {
    res.locals.isAdmin = req.session && req.session.isAdmin;
    next();
});


app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.redirect('/text');
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

const adminUser = { username: process.env.USER, password: process.env.PASS };

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUser.username && password === adminUser.password) {
        req.session.isAdmin = true;
        res.redirect('/text');
    } else {
        res.render('login', { error: 'Invalid username or password' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.use('/text', require('./routes/text')(db));

cron.schedule('0 0 * * *', () => {
    db.archiveAndDeleteExpiredTexts();
});

(async () => {
    try {
        await db.archiveAndDeleteExpiredTexts();
        console.log('Expired events have been archived and deleted.');
    } catch (error) {
        console.error('Error during manual cleanup:', error);
    }
})();

setInterval(() => {
    axios.get('https://grupelah.onrender.com/text')
        .then(() => console.log('Server preheated'))
        .catch(err => console.error('Preheat error:', err));
}, 600000);
app.listen(PORT);
