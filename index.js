// backend/parsers/index.js
const parseBooks = require('./books');
const parseQuotes = require('./quotes');

const parsers = {
  'books.toscrape.com': parseBooks,
  'quotes.toscrape.com': parseQuotes,
};

function getParser(url) {
  try {
    const host = new URL(url).hostname;
    return parsers[host] || null;
  } catch {
    return null;
  }
}

module.exports = { getParser };
