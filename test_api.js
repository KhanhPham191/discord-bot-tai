const axios = require('axios');

(async () => {
  try {
    console.log('Testing API...\n');
    
    const search = await axios.get('https://phim.nguonc.com/api/films/search?keyword=avatar');
    console.log('Search Fields:', Object.keys(search.data.items[0]));
    console.log('\nFirst movie:', search.data.items[0].name, search.data.items[0].slug);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
