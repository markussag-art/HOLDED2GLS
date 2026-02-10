require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { runMigrations } = require('./migrations/run');
const shipmentsRouter = require('./routes/shipments');
const settingsRouter = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Run migrations on startup
runMigrations();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// EJS setup with layout support
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Layout middleware: wrap rendered HTML in layout
const origRender = app.response.render;
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  res.render = function (view, options = {}, callback) {
    originalRender(view, options, (err, html) => {
      if (err) {
        if (callback) return callback(err);
        return next(err);
      }
      originalRender('layout', { ...options, body: html }, callback || ((err2, fullHtml) => {
        if (err2) return next(err2);
        res.send(fullHtml);
      }));
    });
  };
  next();
});

// Routes
app.get('/', (req, res) => res.redirect('/shipments'));
app.use('/shipments', shipmentsRouter);
app.use('/settings', settingsRouter);

// Start server (only if not in test)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Holded→GLS running on http://localhost:${PORT}`);
  });
}

module.exports = app;
