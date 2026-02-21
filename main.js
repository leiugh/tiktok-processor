import './style.css';

// DOM Elements
const urlInput = document.getElementById('url-input');
const urlCount = document.getElementById('url-count');
const processBtn = document.getElementById('process-btn');
const clearBtn = document.getElementById('clear-btn');
const statusMessage = document.getElementById('status-message');
const queueSection = document.getElementById('queue-section');
const videoGrid = document.getElementById('video-grid');
const downloadAllBtn = document.getElementById('download-all-btn');
const downloadCountSpan = document.getElementById('download-count');

// State
let parsedUrls = [];
let processedVideos = [];
const MAX_URLS = 10;
const API_URL = 'https://www.tikwm.com/api/?url=';

// Event Listeners
urlInput.addEventListener('input', handleInputChange);
clearBtn.addEventListener('click', clearInput);
processBtn.addEventListener('click', startProcessing);
downloadAllBtn.addEventListener('click', downloadAllVideos);

function handleInputChange(e) {
    const text = e.target.value;
    parsedUrls = extractTikTokUrls(text);

    // Cap at MAX_URLS
    if (parsedUrls.length > MAX_URLS) {
        parsedUrls = parsedUrls.slice(0, MAX_URLS);
        setStatus(`Limiting to first ${MAX_URLS} URLs.`, 'error');
    } else {
        setStatus('READY TO PROCESS', 'secondary');
    }

    urlCount.textContent = `${parsedUrls.length} / ${MAX_URLS} FOUND`;

    if (parsedUrls.length > 0) {
        urlCount.classList.add('text-primary');
        urlCount.classList.remove('text-secondary');
    } else {
        urlCount.classList.remove('text-primary');
        urlCount.classList.add('text-secondary');
    }
}

function extractTikTokUrls(text) {
    // Regex to match tiktok web links or mobile share links
    const regex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s,"]+/g;
    const matches = text.match(regex);
    if (!matches) return [];

    // Deduplicate and filter obvious invalid lengths
    return [...new Set(matches)].filter(url => url.length > 15);
}

function clearInput() {
    urlInput.value = '';
    parsedUrls = [];
    processedVideos = [];
    handleInputChange({ target: { value: '' } });
    queueSection.classList.add('hidden');
    videoGrid.innerHTML = '';
    downloadAllBtn.classList.add('hidden');
    setStatus('WAITING FOR INPUT...', 'secondary');
}

function setStatus(msg, type = 'secondary') {
    statusMessage.textContent = msg;
    // Reset classes
    statusMessage.className = `text-xs font-mono h-4 uppercase tracking-wider`;

    if (type === 'error') statusMessage.classList.add('text-error');
    else if (type === 'success') statusMessage.classList.add('text-success');
    else if (type === 'primary') statusMessage.classList.add('text-primary');
    else statusMessage.classList.add('text-secondary');
}

async function startProcessing() {
    if (parsedUrls.length === 0) {
        setStatus('NO URLs FOUND TO PROCESS.', 'error');
        return;
    }

    processBtn.disabled = true;
    urlInput.disabled = true;
    queueSection.classList.remove('hidden');
    videoGrid.innerHTML = '';
    processedVideos = [];
    updateDownloadAllButton();

    setStatus(`PROCESSING 1 OF ${parsedUrls.length}...`, 'primary');

    for (let i = 0; i < parsedUrls.length; i++) {
        const url = parsedUrls[i];
        const cardId = `video-card-${i}`;
        createPlaceholderCard(url, cardId, i + 1);

        // Process with retries
        const videoData = await fetchWithRetries(url, i + 1, cardId);

        if (videoData) {
            processedVideos.push(videoData);
            updateCardWithData(cardId, videoData);
        } else {
            markCardAsFailed(cardId);
        }

        // Staggered delay 300ms to bypass rate limit
        if (i < parsedUrls.length - 1) {
            await sleep(300);
            setStatus(`PROCESSING ${i + 2} OF ${parsedUrls.length}...`, 'primary');
        }
    }

    setStatus('PROCESSING COMPLETE.', 'success');
    processBtn.disabled = false;
    urlInput.disabled = false;
    updateDownloadAllButton();
}

async function fetchWithRetries(url, index, cardId, maxRetries = 3) {
    let attempt = 0;

    while (attempt < maxRetries) {
        attempt++;
        updateCardStatus(cardId, attempt > 1 ? `RETRYING (${attempt}/${maxRetries})...` : 'FETCHING DATA...');

        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        try {
            // tikwm public api
            const apiEndpoint = `${API_URL}${encodeURIComponent(url)}`;
            const response = await fetch(apiEndpoint, { signal: controller.signal });
            clearTimeout(timeoutId);

            const data = await response.json();

            // Checking for api-level success code
            if (data && data.code === 0 && data.data) {
                return {
                    id: data.data.id,
                    title: data.data.title || `Video ${index}`,
                    author: data.data.author?.nickname || 'Unknown Author',
                    cover: data.data.cover,
                    play: data.data.play, // MP4 watermark-free
                    originalUrl: url
                };
            } else {
                throw new Error(data.msg || 'API returned failure');
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`Extraction failed for ${url}, attempt ${attempt}:`, err);
            // Wait before retry
            if (attempt < maxRetries) await sleep(1000);
        }
    }

    return null;
}

// UI Creators
function createPlaceholderCard(url, id, index) {
    const card = document.createElement('div');
    card.id = id;
    card.className = 'card animate-pulse';

    card.innerHTML = `
    <div class="aspect-[9/16] bg-border relative overflow-hidden flex flex-col items-center justify-center p-4 text-center">
      <div class="text-[10px] text-secondary font-mono break-all line-clamp-3">${url}</div>
      <div id="${id}-status" class="absolute bottom-4 text-xs font-bold tracking-widest uppercase bg-surface/80 px-2 py-1">WAITING</div>
    </div>
    <div class="flex flex-col gap-1 px-1">
      <div class="h-4 bg-border w-3/4 rounded-none"></div>
      <div class="h-3 bg-border w-1/2 rounded-none mt-1"></div>
    </div>
  `;

    videoGrid.appendChild(card);
}

function updateCardStatus(cardId, statusMsg) {
    const el = document.getElementById(`${cardId}-status`);
    if (el) el.textContent = statusMsg;
}

function updateCardWithData(cardId, data) {
    const card = document.getElementById(cardId);
    if (!card) return;

    card.classList.remove('animate-pulse');

    card.innerHTML = `
    <div class="aspect-[9/16] relative overflow-hidden group bg-border">
      <img src="${data.cover}" alt="cover" class="w-full h-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:scale-105" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
        <button id="${cardId}-dl" class="btn-outline w-full bg-surface/90 backdrop-blur-sm hover:!bg-white hover:!text-black hover:!border-white transition-colors duration-300">
          Download MP4
        </button>
      </div>
    </div>
    <div class="flex flex-col gap-1 px-1">
      <h3 class="text-xs font-bold uppercase tracking-wider line-clamp-1" title="${data.title}">${data.title}</h3>
      <p class="text-[10px] text-secondary font-mono tracking-widest truncate">@${data.author}</p>
    </div>
  `;

    // Attach single download event
    const dlBtn = document.getElementById(`${cardId}-dl`);
    if (dlBtn) {
        dlBtn.addEventListener('click', () => downloadSingleVideo(data, dlBtn));
    }
}

function markCardAsFailed(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    card.classList.remove('animate-pulse');
    card.innerHTML = `
    <div class="aspect-[9/16] bg-border flex flex-col items-center justify-center p-4 text-center border border-error/50">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-error mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div class="text-xs text-error font-bold tracking-widest uppercase">EXTRACTION FAILED</div>
      <div class="text-[10px] text-secondary mt-2">API LIMIT OR INVALID URL</div>
    </div>
  `;
}

// Download Logic
async function downloadSingleVideo(videoData, buttonEl) {
    const originalText = buttonEl.textContent;
    buttonEl.textContent = 'DOWNLOADING...';
    buttonEl.disabled = true;

    try {
        // Attempt blob download for renaming and avoiding CORS where possible
        const response = await fetch(videoData.play);
        if (!response.ok) throw new Error('Network response was not ok');

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        triggerDownload(blobUrl, `tiktok_${videoData.id}.mp4`);

        window.URL.revokeObjectURL(blobUrl);
        buttonEl.textContent = 'DOWNLOADED ✓';
        buttonEl.classList.add('border-success', 'text-success');
    } catch (err) {
        console.warn('Blob download failed, falling back to anchor drop', err);
        // Fallback: simple _blank anchor
        triggerDownload(videoData.play, `tiktok_${videoData.id}.mp4`, true);
        buttonEl.textContent = 'OPENED IN TAB ⇗';
    }
}

function triggerDownload(url, filename, isExternal = false) {
    const a = document.createElement('a');
    a.href = url;
    if (!isExternal) {
        a.download = filename;
    } else {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function updateDownloadAllButton() {
    if (processedVideos.length > 0) {
        downloadAllBtn.classList.remove('hidden');
        downloadCountSpan.textContent = processedVideos.length;
    } else {
        downloadAllBtn.classList.add('hidden');
    }
}

async function downloadAllVideos() {
    if (processedVideos.length === 0) return;

    downloadAllBtn.disabled = true;
    const originalText = downloadAllBtn.innerHTML;

    for (let i = 0; i < processedVideos.length; i++) {
        downloadAllBtn.textContent = `DOWNLOADING ${i + 1}/${processedVideos.length}...`;

        const cardId = `video-card-${parsedUrls.indexOf(processedVideos[i].originalUrl)}`;
        const dlBtn = document.getElementById(`${cardId}-dl`);

        if (dlBtn) {
            await downloadSingleVideo(processedVideos[i], dlBtn);
        }

        // 500ms staggered delay to bypass spam blockers
        if (i < processedVideos.length - 1) {
            await sleep(500);
        }
    }

    downloadAllBtn.textContent = 'ALL DOWNLOADED ✓';
    setTimeout(() => {
        downloadAllBtn.innerHTML = originalText;
        downloadAllBtn.disabled = false;
    }, 3000);
}

// Utils
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
