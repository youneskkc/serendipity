/* ===== SERENDIPITY ENGINE ===== */

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const BATCH_RSS = 12; // random RSS feeds per load
const BATCH_API = 5;  // API sources per load

// Source definitions
const SOURCES = [
  { id:'rss', name:'مدونات ومواقع', badge:'badge-rss', badgeText:'RSS' },
  { id:'wiki', name:'ويكيبيديا', badge:'badge-wiki', badgeText:'ويكيبيديا' },
  { id:'quran', name:'القرآن', badge:'badge-quran', badgeText:'قرآن' },
  { id:'book', name:'كتب', badge:'badge-book', badgeText:'كتاب' },
  { id:'hn', name:'أخبار التقنية', badge:'badge-hn', badgeText:'HN' },
  { id:'today', name:'مثل هذا اليوم', badge:'badge-today', badgeText:'مثل هذا اليوم' }
];

let allCards = [];

/* ===== HELPERS ===== */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n) {
  return shuffle(arr).slice(0, n);
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 0 || isNaN(diff)) return '';
    if (diff < 3600) return Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ساعة';
    if (diff < 604800) return Math.floor(diff / 86400) + ' يوم';
    return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/* ===== RSS FETCHER ===== */
async function fetchRSS(feedUrl) {
  try {
    const res = await fetch(RSS2JSON + encodeURIComponent(feedUrl));
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== 'ok' || !data.items) return [];
    // Pick 1-2 random items from this feed
    const items = shuffle(data.items).slice(0, 2);
    return items.map(item => ({
      source: 'rss',
      title: stripHtml(item.title) || 'بدون عنوان',
      url: item.link || feedUrl,
      snippet: stripHtml(item.description || item.content || '').substring(0, 200),
      date: item.pubDate || '',
      domain: data.feed?.title || extractDomain(item.link || feedUrl)
    }));
  } catch { return []; }
}

/* ===== WIKIPEDIA ===== */
async function fetchWikiRandom() {
  const cards = [];
  try {
    // Arabic random articles
    const urls = [
      'https://ar.wikipedia.org/api/rest_v1/page/random/summary',
      'https://ar.wikipedia.org/api/rest_v1/page/random/summary',
      'https://ar.wikipedia.org/api/rest_v1/page/random/summary'
    ];
    const results = await Promise.allSettled(urls.map(u => fetch(u).then(r => r.json())));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.title) {
        const d = r.value;
        cards.push({
          source: 'wiki',
          title: d.title || d.displaytitle,
          url: d.content_urls?.desktop?.page || `https://ar.wikipedia.org/wiki/${d.title}`,
          snippet: d.extract || '',
          date: '',
          domain: 'ar.wikipedia.org'
        });
      }
    }
  } catch {}
  return cards;
}

/* ===== ON THIS DAY ===== */
async function fetchOnThisDay() {
  const cards = [];
  try {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
    const data = await res.json();
    const events = shuffle(data.events || []).slice(0, 2);
    for (const e of events) {
      const page = e.pages?.[0];
      cards.push({
        source: 'today',
        title: `في مثل هذا اليوم ${e.year}: ${e.text?.substring(0, 100)}`,
        url: page?.content_urls?.desktop?.page || '#',
        snippet: page?.extract || e.text || '',
        date: '',
        domain: 'مثل هذا اليوم'
      });
    }
  } catch {}
  return cards;
}

/* ===== QURAN ===== */
async function fetchQuran() {
  const cards = [];
  try {
    // Random ayah (1-6236)
    const ayah = Math.floor(Math.random() * 6236) + 1;
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ayah}/editions/quran-uthmani,ar.muyassar`);
    const data = await res.json();
    if (data.data && data.data.length >= 2) {
      const original = data.data[0];
      const tafsir = data.data[1];
      cards.push({
        source: 'quran',
        title: `${original.surah.name} — الآية ${original.numberInSurah}`,
        url: `https://quran.com/${original.surah.number}/${original.numberInSurah}`,
        snippet: original.text + '\n\n' + tafsir.text,
        date: '',
        domain: original.surah.name
      });
    }
  } catch {}
  return cards;
}

/* ===== OPEN LIBRARY ===== */
async function fetchBooks() {
  const cards = [];
  const queries = ['arabic literature', 'islamic philosophy', 'productivity', 'entrepreneurship',
    'creative writing', 'self improvement', 'poetry arabic', 'fiction arab', 'north africa',
    'fintech', 'storytelling', 'design thinking', 'meditation', 'biography', 'history middle east',
    'translation', 'journalism', 'economics', 'psychology', 'technology society'];
  const q = queries[Math.floor(Math.random() * queries.length)];
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&sort=new`);
    const data = await res.json();
    const books = shuffle(data.docs || []).slice(0, 2);
    for (const b of books) {
      cards.push({
        source: 'book',
        title: b.title || 'كتاب',
        url: `https://openlibrary.org${b.key}`,
        snippet: `${b.author_name?.[0] || ''} — ${b.first_publish_year || ''}\n${(b.subject || []).slice(0, 5).join(', ')}`,
        date: '',
        domain: b.author_name?.[0] || 'Open Library'
      });
    }
  } catch {}
  return cards;
}

/* ===== HACKER NEWS ===== */
async function fetchHN() {
  const cards = [];
  const queries = ['productivity', 'writing', 'books', 'startup', 'creativity', 'culture',
    'philosophy', 'education', 'arabic', 'africa', 'design', 'future', 'economics', 'AI writing'];
  const q = queries[Math.floor(Math.random() * queries.length)];
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8`);
    const data = await res.json();
    const hits = shuffle(data.hits || []).slice(0, 2);
    for (const h of hits) {
      cards.push({
        source: 'hn',
        title: h.title || '',
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: `${h.points || 0} نقطة — ${h.num_comments || 0} تعليق`,
        date: h.created_at || '',
        domain: extractDomain(h.url || '') || 'news.ycombinator.com'
      });
    }
  } catch {}
  return cards;
}

/* ===== RENDER ===== */
function renderCard(card) {
  const src = SOURCES.find(s => s.id === card.source) || SOURCES[0];
  const dateStr = timeAgo(card.date);
  return `<div class="card">
    <div class="card-top">
      <span class="card-badge ${src.badge}">${src.badgeText}</span>
      <span class="card-source">${card.domain}</span>
    </div>
    <div class="card-title"><a href="${card.url}" target="_blank" rel="noopener">${card.title}</a></div>
    ${card.snippet ? `<div class="card-snippet">${card.snippet.substring(0, 250)}</div>` : ''}
    ${dateStr ? `<div class="card-date">${dateStr}</div>` : ''}
  </div>`;
}

function renderSourcesBar(activeSources) {
  const bar = document.getElementById('sourcesBar');
  bar.innerHTML = SOURCES.map(s => {
    const cls = activeSources.has(s.id) ? 'active' : '';
    return `<span class="src-tag ${cls}">${s.name}</span>`;
  }).join('');
}

function renderFeed() {
  const feed = document.getElementById('feed');
  if (allCards.length === 0) {
    feed.innerHTML = '<div class="empty">لم يتم العثور على محتوى — جرّب صدفة جديدة</div>';
    return;
  }
  feed.innerHTML = shuffle(allCards).map(renderCard).join('');
  document.getElementById('counter').textContent = allCards.length + ' نتيجة';
}

/* ===== MAIN ===== */
async function refresh() {
  const btn = document.getElementById('refreshBtn');
  const feed = document.getElementById('feed');
  btn.disabled = true;
  btn.textContent = 'جاري الاستكشاف...';
  feed.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>جاري استكشاف المصادر...</div></div>';
  allCards = [];

  // Pick random RSS feeds
  const allFeeds = [...FEEDS_AR, ...FEEDS_EN];
  const selectedFeeds = pickRandom(allFeeds, BATCH_RSS);

  // Launch all sources in parallel
  const promises = [
    ...selectedFeeds.map(f => fetchRSS(f)),
    fetchWikiRandom(),
    fetchOnThisDay(),
    fetchQuran(),
    fetchBooks(),
    fetchHN()
  ];

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allCards.push(...r.value);
    }
  }

  // Track which sources returned data
  const activeSources = new Set(allCards.map(c => c.source));
  renderSourcesBar(activeSources);
  renderFeed();

  btn.disabled = false;
  btn.textContent = 'صدفة جديدة';
}

// Initial load
renderSourcesBar(new Set());
refresh();
