// ==========================================================================
// STATE MANAGEMENT & INITIALIZATION
// ==========================================================================
let allUpdates = [];
let filteredUpdates = [];
let currentFilterType = 'all';
let searchQuery = '';
let activeHashtags = [];
let activeNote = null;

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterBtns = document.querySelectorAll('.filter-btn');
const updatesGrid = document.getElementById('updates-grid');
const skeletonLoader = document.getElementById('skeleton-loader');
const statusMessage = document.getElementById('status-message');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const statusRetryBtn = document.getElementById('status-retry-btn');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statFeatures = document.getElementById('stat-features');
const statIssues = document.getElementById('stat-issues');
const statSync = document.getElementById('stat-sync');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalContextType = document.getElementById('modal-context-type');
const modalContextDate = document.getElementById('modal-context-date');
const modalContextSnippet = document.getElementById('modal-context-snippet');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountSpan = document.getElementById('char-count');
const progressCircle = document.querySelector('.progress-ring__circle');
const copyTweetBtn = document.getElementById('copy-tweet-btn');
const postTweetBtn = document.getElementById('post-tweet-btn');
const hashtagBtns = document.querySelectorAll('.hash-tag-btn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Modal Circular Progress settings
const radius = progressCircle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
progressCircle.style.strokeDashoffset = circumference;

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadUpdates();
    setupEventListeners();
});

// ==========================================================================
// EVENT LISTENERS SETUP
// ==========================================================================
function setupEventListeners() {
    // Refresh buttons
    refreshBtn.addEventListener('click', () => loadUpdates(true));
    statusRetryBtn.addEventListener('click', () => loadUpdates(true));
    
    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Search
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
    
    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.target.closest('.filter-btn');
            targetBtn.classList.add('active');
            currentFilterType = targetBtn.dataset.type;
            filterAndRender();
        });
    });
    
    // Modal events
    closeModalBtn.addEventListener('click', closeComposer);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) closeComposer();
    });
    
    tweetTextarea.addEventListener('input', updateCharCount);
    
    // Hashtags
    hashtagBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hashtag = e.target.dataset.tag;
            const isSelected = e.target.classList.toggle('selected');
            
            toggleHashtagInText(hashtag, isSelected);
        });
    });
    
    // Share actions
    copyTweetBtn.addEventListener('click', copyTweetToClipboard);
    postTweetBtn.addEventListener('click', postTweetToX);
}

// ==========================================================================
// THEME SWITCHER
// ==========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    }
}

// ==========================================================================
// DATA LOADING
// ==========================================================================
async function loadUpdates(forceRefresh = false) {
    showLoading(true);
    
    try {
        const refreshQuery = forceRefresh ? '?refresh=true' : '';
        const response = await fetch(`/api/updates${refreshQuery}`);
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        allUpdates = data.updates || [];
        
        // Show sync warning if partial success
        if (data.status === 'partial_success' && data.warning) {
            showToast(data.warning, true);
        }
        
        // Update Metrics
        updateMetrics(allUpdates, data.last_fetched);
        
        // Render
        filterAndRender();
        
    } catch (error) {
        console.error('Error fetching updates:', error);
        showErrorState(
            'Failed to Fetch Release Notes',
            error.message || 'Check your internet connection or try again later.'
        );
    } finally {
        showLoading(false);
    }
}

function showLoading(isLoading) {
    const refreshIcon = refreshBtn.querySelector('.icon-refresh');
    if (isLoading) {
        refreshIcon.classList.add('spinning');
        refreshBtn.disabled = true;
        skeletonLoader.style.display = 'grid';
        updatesGrid.style.display = 'none';
        statusMessage.style.display = 'none';
    } else {
        refreshIcon.classList.remove('spinning');
        refreshBtn.disabled = false;
        skeletonLoader.style.display = 'none';
    }
}

function showErrorState(title, desc) {
    updatesGrid.style.display = 'none';
    skeletonLoader.style.display = 'none';
    statusMessage.style.display = 'block';
    
    statusTitle.textContent = title;
    statusDesc.textContent = desc;
    statusRetryBtn.style.display = 'inline-flex';
}

// ==========================================================================
// METRICS MANAGEMENT
// ==========================================================================
function updateMetrics(updates, lastFetchedTime) {
    const total = updates.length;
    const features = updates.filter(u => u.type.toLowerCase() === 'feature').length;
    const issues = updates.filter(u => u.type.toLowerCase() === 'issue').length;
    
    statTotal.textContent = total;
    statFeatures.textContent = features;
    statIssues.textContent = issues;
    
    if (lastFetchedTime) {
        const date = new Date(lastFetchedTime);
        statSync.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statSync.title = date.toLocaleString();
    } else {
        statSync.textContent = 'Never';
    }
}

// ==========================================================================
// SEARCH & FILTER SYSTEM
// ==========================================================================
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    if (searchQuery.length > 0) {
        clearSearchBtn.style.display = 'flex';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    filterAndRender();
}

function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    filterAndRender();
    searchInput.focus();
}

function filterAndRender() {
    filteredUpdates = allUpdates.filter(update => {
        // 1. Filter by type
        if (currentFilterType !== 'all') {
            const matchesType = update.type.toLowerCase() === currentFilterType.toLowerCase();
            if (!matchesType) return false;
        }
        
        // 2. Filter by search query
        if (searchQuery) {
            const inContent = update.plain_text.toLowerCase().includes(searchQuery);
            const inDate = update.date.toLowerCase().includes(searchQuery);
            const inType = update.type.toLowerCase().includes(searchQuery);
            return inContent || inDate || inType;
        }
        
        return true;
    });
    
    renderCards(filteredUpdates);
}

// ==========================================================================
// CARD RENDERING
// ==========================================================================
function renderCards(updates) {
    updatesGrid.innerHTML = '';
    
    if (updates.length === 0) {
        updatesGrid.style.display = 'none';
        statusMessage.style.display = 'block';
        statusTitle.textContent = 'No matching updates';
        statusDesc.textContent = 'We couldn\'t find any release notes matching your filters.';
        statusRetryBtn.style.display = 'none';
        return;
    }
    
    statusMessage.style.display = 'none';
    updatesGrid.style.display = 'grid';
    
    updates.forEach(update => {
        const card = document.createElement('div');
        const typeClass = `type-${update.type.toLowerCase()}`;
        card.className = `update-card glass-panel ${typeClass}`;
        
        // Badge text formatting
        const badgeLabel = update.type;
        const badgeClass = `badge badge-${update.type.toLowerCase()}`;
        
        // Set up the card HTML
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    <span class="${badgeClass}">${badgeLabel}</span>
                    <span class="card-date">${update.date}</span>
                </div>
                <div class="card-share-shortcut">
                    <button class="btn-share-icon tweet-trigger-btn" title="Tweet about this update">
                        <i class="fa-brands fa-x-twitter"></i>
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${update.content}
            </div>
            <div class="card-actions">
                <button class="btn-tweet-card tweet-trigger-btn">
                    <i class="fa-brands fa-x-twitter"></i> Tweet Update
                </button>
            </div>
        `;
        
        // Style direct links inside the rendered body to open in new tab
        card.querySelectorAll('.card-body a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        
        // Add click listener to all tweet elements in this card
        card.querySelectorAll('.tweet-trigger-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openComposer(update);
            });
        });
        
        updatesGrid.appendChild(card);
    });
}

// ==========================================================================
// TWEET COMPOSER SYSTEM
// ==========================================================================
function openComposer(note) {
    activeNote = note;
    activeHashtags = [];
    
    // Set note context info
    modalContextType.className = `context-tag type-${note.type.toLowerCase()}`;
    modalContextType.textContent = note.type;
    modalContextDate.textContent = note.date;
    modalContextSnippet.textContent = note.plain_text;
    
    // Reset hashtags selector display
    hashtagBtns.forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Build initial tweet text
    tweetTextarea.value = generateDefaultTweet(note);
    
    // Update character limit progress details
    updateCharCount();
    
    // Open modal
    tweetModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock background scroll
    tweetTextarea.focus();
}

function closeComposer() {
    tweetModal.style.display = 'none';
    document.body.style.overflow = ''; // Unlock scroll
    activeNote = null;
}

function generateDefaultTweet(note, hashtags = []) {
    const prefix = `BigQuery Update (${note.date}) | ${note.type}\n\n`;
    const suffix = `\n\nRead more: ${note.link}`;
    const tagSuffix = hashtags.length > 0 ? `\n\n${hashtags.join(' ')}` : '';
    
    // X allows 280 characters max
    const maxDescLength = 280 - prefix.length - suffix.length - tagSuffix.length - 4; // 4 buffer
    
    let desc = note.plain_text;
    if (desc.length > maxDescLength) {
        desc = desc.substring(0, maxDescLength - 3) + '...';
    }
    
    return `${prefix}${desc}${suffix}${tagSuffix}`;
}

function toggleHashtagInText(hashtag, shouldAdd) {
    let text = tweetTextarea.value;
    
    if (shouldAdd) {
        activeHashtags.push(hashtag);
        // Add space prefix if needed
        if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
            text += ' ';
        }
        text += hashtag;
    } else {
        activeHashtags = activeHashtags.filter(tag => tag !== hashtag);
        // Find and replace the hashtag (including leading space)
        const regex = new RegExp(`\\s*${hashtag}\\b`, 'g');
        text = text.replace(regex, '').trim();
    }
    
    tweetTextarea.value = text;
    updateCharCount();
}

function updateCharCount() {
    const text = tweetTextarea.value;
    const len = text.length;
    const maxChars = 280;
    const remaining = maxChars - len;
    
    charCountSpan.textContent = remaining;
    
    // Handle Warning Classes
    if (remaining < 0) {
        charCountSpan.className = 'danger';
        progressCircle.style.stroke = '#ef4444';
    } else if (remaining <= 30) {
        charCountSpan.className = 'warning';
        progressCircle.style.stroke = '#f59e0b';
    } else {
        charCountSpan.className = '';
        progressCircle.style.stroke = '#1d9bf0';
    }
    
    // Progress Circle Calculation
    // Ensure we cap progress between 0 and 100%
    const progressPercent = Math.min(Math.max((len / maxChars) * 100, 0), 100);
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;
    progressCircle.style.strokeDashoffset = strokeDashoffset;
    
    // Enable/disable Post button if text is too long or empty
    postTweetBtn.disabled = len === 0;
    if (len > maxChars || len === 0) {
        postTweetBtn.style.opacity = '0.5';
        postTweetBtn.style.pointerEvents = 'none';
    } else {
        postTweetBtn.style.opacity = '1';
        postTweetBtn.style.pointerEvents = 'auto';
    }
}

function copyTweetToClipboard() {
    const text = tweetTextarea.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Tweet copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy text', true);
    });
}

function postTweetToX() {
    const text = tweetTextarea.value;
    if (!text || text.length > 280) return;
    
    const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    closeComposer();
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, isError = false) {
    toastMessage.textContent = message;
    
    const icon = toast.querySelector('.toast-icon');
    if (isError) {
        icon.className = 'fa-solid fa-circle-exclamation toast-icon';
        icon.style.color = '#ef4444';
    } else {
        icon.className = 'fa-solid fa-circle-check toast-icon';
        icon.style.color = '#10b981';
    }
    
    toast.style.display = 'flex';
    // Small timeout to allow element display block rendering before adding class
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Remove class and display none after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 3000);
}
