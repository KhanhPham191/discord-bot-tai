const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  try {
    const res = await axios.get('https://wherewindsmeet.wiki.fextralife.com/Martial+Arts+Weapons', {
      headers: {'User-Agent': 'Mozilla/5.0'}
    });
    const $ = cheerio.load(res.data);
    
    // Tìm các wiki links
    const links = new Set();
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('wherewindsmeet.wiki.fextralife.com')) {
        links.add(href);
      }
    });
    
    console.log('Available pages on wiki:');
    Array.from(links)
      .sort()
      .forEach(link => {
        if (link.match(/(NPC|Boss|Enemy|Item|Loot|Character|Drop|Oddity|Sect)/i)) {
          console.log('  ✅ ' + link);
        }
      });
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
