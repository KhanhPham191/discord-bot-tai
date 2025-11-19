const movies = require('./movies.js');

(async () => {
  try {
    const detail = await movies.getMovieDetail('hai-phuong');
    console.log('Keys:', Object.keys(detail));
    console.log('\nCategory field:', detail.category);
    console.log('\nAll data:');
    console.log(JSON.stringify(detail, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
