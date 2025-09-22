// backend/parsers/quotes.js
const cheerio = require('cheerio');

function parseQuotes(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('.quote').each((_, el) => {
    const title = $(el).find('.text').text().trim() || '';
    const author = $(el).find('.author').text().trim() || '';
    const tags = $(el).find('.tags .tag').map((i, t) => $(t).text().trim()).get();

    items.push({
      title,
      price: null,
      price_num: null,
      availability: author,
      category: tags.join(', ')
    });
  });

  return items;
}

module.exports = parseQuotes;
