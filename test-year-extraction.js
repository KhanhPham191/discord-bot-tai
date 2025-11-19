const axios = require('axios');

// Test function to verify year extraction from detail endpoint
async function testYearExtraction() {
  console.log('🧪 Testing year extraction from API...\n');
  
  // Test cases: movies to search for
  const testCases = [
    { keyword: 'bị cáo', expectedYear: 2015 },
    { keyword: 'maisel', expectedYear: 2017 },
    { keyword: 'avatar', expectedYear: 2009 }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📽️ Testing: "${testCase.keyword}" (Expected year: ${testCase.expectedYear})`);
    console.log('='.repeat(60));
    
    try {
      // Step 1: Search for movie
      console.log(`\n1️⃣ Searching for "${testCase.keyword}"...`);
      const searchResponse = await axios.get('https://phim.nguonc.com/api/films/search', {
        params: { keyword: testCase.keyword }
      });
      
      const movies = searchResponse.data.items || [];
      
      if (movies.length === 0) {
        console.log(`❌ No movies found for "${testCase.keyword}"`);
        continue;
      }
      
      const movie = movies[0];
      console.log(`✅ Found: ${movie.name} (${movie.original_name})`);
      console.log(`   Slug: ${movie.slug}`);
      console.log(`   Created: ${movie.created}`);
      
      // Step 2: Fetch detail endpoint
      console.log(`\n2️⃣ Fetching detail from: https://phim.nguonc.com/api/film/${movie.slug}`);
      const detailResponse = await axios.get(`https://phim.nguonc.com/api/film/${movie.slug}`);
      
      const detail = detailResponse.data.movie || {};
      console.log(`✅ Detail fetched`);
      console.log(`   Year field: ${detail.year}`);
      console.log(`   Created: ${detail.created}`);
      console.log(`   Description (first 200 chars): ${detail.description?.substring(0, 200)}...`);
      
      // Step 3: Extract year using the same logic as getMovieDetail()
      console.log(`\n3️⃣ Extracting year using logic...`);
      let extractedYear = detail.year;
      
      if (!extractedYear && detail.description) {
        console.log(`   Year field is null, searching in description...`);
        const allYears = detail.description.match(/(\d{4})/g) || [];
        console.log(`   Found years in description: ${allYears.join(', ')}`);
        
        const reasonableYears = allYears
          .map(y => parseInt(y))
          .filter(y => y >= 1980 && y <= new Date().getFullYear() + 1)
          .sort((a, b) => b - a);
        
        console.log(`   Reasonable years (1980+): ${reasonableYears.join(', ')}`);
        
        if (reasonableYears.length > 0) {
          extractedYear = reasonableYears[0];
        }
      }
      
      if (!extractedYear && detail.created) {
        extractedYear = detail.created.split('-')[0];
        console.log(`   Using created date: ${extractedYear}`);
      }
      
      extractedYear = extractedYear || 'N/A';
      
      // Step 4: Compare with expected year
      console.log(`\n4️⃣ Result:`);
      console.log(`   ✅ Extracted year: ${extractedYear}`);
      console.log(`   Expected year: ${testCase.expectedYear}`);
      
      if (extractedYear === testCase.expectedYear || extractedYear === testCase.expectedYear.toString()) {
        console.log(`   ✅ PASS - Year matches!`);
      } else {
        console.log(`   ⚠️ MISMATCH - Got ${extractedYear}, expected ${testCase.expectedYear}`);
      }
      
    } catch (error) {
      console.error(`❌ Error testing "${testCase.keyword}":`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test completed!\n');
}

// Run the test
testYearExtraction().catch(console.error);
