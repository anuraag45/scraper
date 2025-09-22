// backend/scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const USER_AGENT = 'WTProjectBot/1.0 (+student project)';

async function fetchHtml(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': USER_AGENT } });
      return res.data;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Parsers for supported sites
const parsers = {
  books: {
    match: url => url.includes('books.toscrape.com'),
    parsePage: (html, baseUrl) => {
      const $ = cheerio.load(html);
      const items = [];
      $('.product_pod').each((_, el) => {
        const title = $(el).find('h3 a').attr('title') || $(el).find('h3 a').text().trim();
        const price = $(el).find('.price_color').text().trim();
        const price_num = parseFloat((price || '').replace(/[^0-9.]/g, '')) || null;
        const availability = $(el).find('.availability').text().trim();
        const category = $('ul.breadcrumb li').eq(2).text().trim() || 'Books';
        const formatted_html = `<strong>${title}</strong><br>${price}<br><em>${availability}</em>`;
        items.push({ title, price, price_num, availability, category, formatted_html });
      });
      const nextRel = $('li.next a').attr('href') || null;
      const next = nextRel ? new URL(nextRel, baseUrl).toString() : null;
      return { items, next };
    }
  },
  quotes: {
    match: url => url.includes('quotes.toscrape.com'),
    parsePage: (html, baseUrl) => {
      const $ = cheerio.load(html);
      const items = [];
      $('.quote').each((_, el) => {
        const text = $(el).find('.text').text().trim();
        const author = $(el).find('.author').text().trim();
        const tags = $(el).find('.tags .tag').map((i, t) => $(t).text().trim()).get().join(', ');
        const title = text;
        items.push({ title, price: '', price_num: null, availability: author, category: tags || 'Quotes', formatted_html: `<q>${text}</q>` });
      });
      const nextRel = $('li.next a').attr('href') || null;
      const next = nextRel ? new URL(nextRel, baseUrl).toString() : null;
      return { items, next };
    }
  }
};

function chooseParser(url) {
  for (const key of Object.keys(parsers)) {
    if (parsers[key].match(url)) return parsers[key];
  }
  return null;
}

/**
 * scrape(url, pages, progressCallback)
 * progressCallback({message, pct})
 */
async function scrape(url, pages = 1, progressCallback = null) {
  const parser = chooseParser(url);
  if (!parser) throw new Error('No parser available for this site');

  const items = [];
  let current = url;
  let pageCount = 0;

  function emit(message, pct) {
    if (typeof progressCallback === 'function') {
      try { progressCallback({ message, pct }); } catch (e) { /* ignore */ }
    }
  }

  while (current && pageCount < (pages || 1)) {
    pageCount++;
    emit(`Fetching page ${pageCount}...`, Math.round(((pageCount - 1) / (pages || 1)) * 40));
    let html;
    try {
      html = await fetchHtml(current);
    } catch (e) {
      emit(`Fetch failed: ${e.message}`, 0);
      throw e;
    }
    const { items: pageItems, next } = parser.parsePage(html, current);
    if (Array.isArray(pageItems) && pageItems.length) items.push(...pageItems);
    emit(`Fetched ${Array.isArray(pageItems) ? pageItems.length : 0} items`, Math.min(95, Math.round((pageCount / (pages || 1)) * 90)));
    current = next;
    if (!current) break;
    await new Promise(r => setTimeout(r, 150)); // polite delay
  }

  return { items };
}

module.exports = { scrape };
