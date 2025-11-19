const axios = require('axios');

// Test extracting year from category
async function testCategoryYear() {
  console.log('🧪 Testing year extraction from category...\n');
  
  const testCases = [
    { slug: 'hoa-thien-cot', expectedYear: '2015' },
    { slug: 'co-maisel-ky-dieu-phan-4', expectedYear: '2023' }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📽️ Testing: "${testCase.slug}"`);
    console.log('='.repeat(60));
    
    try {
      const response = await axios.get(`https://phim.nguonc.com/api/film/${testCase.slug}`);
      const movie = response.data.movie || {};
      
      console.log(`Name: ${movie.name}`);
      
      // Extract year from category
      let year = movie.year;
      if (!year && movie.category) {
        for (const key in movie.category) {
          if (movie.category[key].group.name === 'Năm' && movie.category[key].list.length > 0) {
            year = movie.category[key].list[0].name;
            console.log(`✅ Found year in category: ${year}`);
            break;
          }
        }
      }
      
      year = year || 'N/A';
      console.log(`Result: ${year}`);
      console.log(`Expected: ${testCase.expectedYear}`);
      
      if (year === testCase.expectedYear) {
        console.log(`✅ PASS`);
      } else {
        console.log(`⚠️ MISMATCH`);
      }
      
    } catch (error) {
      console.error(`❌ Error:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

testCategoryYear();
