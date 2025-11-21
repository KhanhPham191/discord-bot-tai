const axios = require('axios');

// Request cache to avoid duplicate API calls during rate limiting
const requestCache = new Map();
const REQUEST_CACHE_TTL = 30 * 1000; // 30 seconds

// Rate limiter - track last request time to ensure minimum delay between requests
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 100; // Minimum 100ms between API calls

// Throttle function to ensure minimum delay between requests
async function throttledRequest(fn) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
    const delay = MIN_REQUEST_DELAY - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  lastRequestTime = Date.now();
  return fn();
}

// Retry logic with exponential backoff for rate limiting
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await throttledRequest(fn);
    } catch (error) {
      if (error.response?.status === 429 && i < maxRetries - 1) {
        // Rate limited - wait with exponential backoff
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
        console.log(`⏳ [RATE LIMIT] Waiting ${delay.toFixed(0)}ms before retry ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// Movie search function - fetch year from detail endpoint with pagination support
async function searchMovies(keyword, maxResults = 100) {
  try {
    let allMovies = [];
    let page = 1;
    const itemsPerPage = 20; // API usually returns ~20 items per page
    const maxPages = Math.ceil(maxResults / itemsPerPage);
    
    while (allMovies.length < maxResults && page <= maxPages) {
      try {
        const response = await axios.get('https://phim.nguonc.com/api/films/search', {
          params: { 
            keyword: keyword,
            page: page
          }
        });
        
        const items = response.data.items || [];
        
        if (items.length === 0) {
          break; // No more results
        }
        
        // Don't fetch detail for each movie - too slow! Extract year from created date instead
        const moviesWithYear = items.map((item) => ({
          ...item,
          year: item.created ? item.created.split('-')[0] : 'N/A'
        }));
        
        allMovies = allMovies.concat(moviesWithYear);
        page++;
      } catch (pageError) {
        console.log(`⚠️ Error fetching page ${page}:`, pageError.message);
        break; // Stop on error
      }
    }
    
    // Return maximum maxResults items
    return allMovies.slice(0, maxResults);
  } catch (error) {
    console.error('❌ Lỗi API tìm kiếm phim:', error.response?.data?.message || error.message);
    return [];
  }
}

// Search movies by release year
async function searchMoviesByYear(year, page = 1) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/films/nam-phat-hanh/${year}?page=${page}`);
    
    const items = response.data.items || [];
    
    return items.map(item => ({
      ...item,
      year: year
    }));
  } catch (error) {
    console.error(`❌ Lỗi API tìm phim theo năm ${year}:`, error.response?.data?.message || error.message);
    return [];
  }
}

// Extract year from movie data
function extractYearFromMovie(movie) {
  // First try to get year field directly
  if (movie.year) {
    return movie.year;
  }
  
  // Try to extract year from description
  if (movie.description) {
    const yearMatch = movie.description.match(/(\d{4})/);
    if (yearMatch) return yearMatch[1];
  }
  
  // Try to extract from created date
  if (movie.created) {
    return movie.created.split('-')[0];
  }
  
  // Try to extract from modified date
  if (movie.modified) {
    return movie.modified.split('-')[0];
  }
  
  return 'N/A';
}

// Get newly updated movies
async function getNewMovies(page = 1) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}`);
    
    const items = response.data.items || [];
    
    // Extract year from description or created date
    return items.map(item => ({
      ...item,
      year: extractYearFromMovie(item)
    }));
  } catch (error) {
    console.error('❌ Lỗi API lấy phim mới:', error.response?.data?.message || error.message);
    return [];
  }
}

// Get detailed movie info (with watch source and release year from category)
async function getMovieDetail(slug) {
  try {
    // Check cache first
    const cached = requestCache.get(slug);
    if (cached && Date.now() - cached.timestamp < REQUEST_CACHE_TTL) {
      console.log(`📦 [CACHE HIT] Using cached detail for ${slug}`);
      return cached.data;
    }

    // Retry with backoff to handle rate limiting
    const response = await retryWithBackoff(
      () => axios.get(`https://phim.nguonc.com/api/film/${slug}`),
      3,
      1000
    );
    
    const movie = response.data.movie || {};
    
    // Extract year from category > "Năm" group
    let year = movie.year;
    if (!year && movie.category) {
      // Find the category group with name "Năm"
      for (const key in movie.category) {
        if (movie.category[key].group.name === 'Năm' && movie.category[key].list.length > 0) {
          year = movie.category[key].list[0].name; // Get first year entry
          break;
        }
      }
    }
    
    // Extract watch source from first episode
    let watchSource = null;
    if (movie.episodes && movie.episodes.length > 0) {
      const firstServer = movie.episodes[0];
      if (firstServer.items && firstServer.items.length > 0) {
        watchSource = firstServer.items[0].embed; // Get first episode embed link
      }
    }
    
    const result = {
      name: movie.name,
      original_name: movie.original_name,
      slug: movie.slug,
      thumb_url: movie.thumb_url,
      poster_url: movie.poster_url,
      description: movie.description,
      quality: movie.quality,
      language: movie.language,
      time: movie.time,
      year: year || 'N/A',
      director: movie.director,
      casts: movie.casts,
      total_episodes: String(movie.total_episodes || movie.episodes?.[0]?.items?.length || 'N/A'),
      current_episode: String(movie.current_episode || movie.episodes?.[0]?.items?.[0]?.name || 'N/A'),
      watchSource: watchSource,
      category: movie.category || {}, // Include category for type detection
      episodes: movie.episodes || [] // Array of episodes with watch sources
    };

    // Cache the result
    requestCache.set(slug, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error(`❌ Lỗi API lấy chi tiết phim ${slug}:`, error.response?.data?.message || error.message);
    return null;
  }
}

// Get episodes for a movie with pagination and server selection
async function getEpisodes(slug, page = 1, serverIndex = 0) {
  try {
    const detail = await getMovieDetail(slug);
    if (!detail || !detail.episodes) {
      return { episodes: [], totalPages: 0, currentPage: 1, totalEpisodes: 0, serverName: '' };
    }

    // Get episodes from specified server (default: first server = Vietsub)
    const selectedServer = detail.episodes[serverIndex] || detail.episodes[0];
    const allEpisodes = selectedServer.items || [];

    const totalEpisodes = allEpisodes.length;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalEpisodes / itemsPerPage);
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedEpisodes = allEpisodes.slice(startIdx, endIdx);

    return {
      episodes: paginatedEpisodes,
      totalPages,
      currentPage: page,
      totalEpisodes,
      movieName: detail.name,
      movieYear: detail.year,
      serverName: selectedServer.server_name,
      availableServers: detail.episodes.map(s => s.server_name)
    };
  } catch (error) {
    console.error('❌ Lỗi API lấy danh sách tập:', error.message);
    return { episodes: [], totalPages: 0, currentPage: 1, totalEpisodes: 0, serverName: '' };
  }
}

module.exports = {
  searchMovies,
  searchMoviesByYear,
  getNewMovies,
  getMovieDetail,
  getEpisodes,
  extractYearFromMovie
};

// Clean up expired cache entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > REQUEST_CACHE_TTL) {
      requestCache.delete(key);
    }
  }
}, 60 * 1000);
