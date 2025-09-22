// backend/parsers/books.js
const cheerio = require('cheerio');

function parseBooks(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('.product_pod').each((_, el) => {
    const title = $(el).find('h3 a').attr('title') || '';
    const price = $(el).find('.price_color').text().trim();
    const availability = $(el).find('.instock.availability').text().trim();
    const category = $('ul.breadcrumb li:nth-child(3) a').text().trim() || 'Unknown';

    items.push({
      title,
      price,
      price_num: parseFloat(price.replace(/[^\d.]/g, '')) || 0,
      availability,
      category
    });
  });

  return items;
}

module.exports = parseBooks;
