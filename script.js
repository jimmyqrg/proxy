// Configuration
const API_BASE_URL = 'https://proxy.ikunbeautiful.workers.dev';

// State
let currentData = null;
let apiStatus = 'checking';
let consoleLogs = [];
let autoScroll = true;
let consoleFilters = {
    log: true,
    warn: true,
    error: true,
    info: true,
    debug: true,
    global_error: true,
    unhandled_rejection: true
};

// Initialize function to be called from HTML
function initApp() {
    updateApiEndpoint();
    checkApiStatus();
    initConsoleFilters();
    
    // Enter key support
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') fetchSource();
        });
    }
    
    // Initialize highlight.js if available
    if (typeof hljs !== 'undefined') {
        hljs.configure({
            languages: ['html', 'xml', 'json', 'javascript'],
            cssSelector: 'pre code'
        });
    }
    
    // Initialize console auto-scroll observer
    const consoleContent = document.getElementById('console-content');
    if (consoleContent) {
        consoleContent.addEventListener('scroll', () => {
            const isAtBottom = consoleContent.scrollHeight - consoleContent.clientHeight <= consoleContent.scrollTop + 1;
            if (isAtBottom) {
                const button = document.querySelector('.console-control-btn[onclick*="Auto-scroll"]');
                if (button) {
                    button.innerHTML = '📜 Auto-scroll (ON)';
                }
            }
        });
    }
    
    console.log('App initialized successfully');
}

// Initialize console filter UI
function initConsoleFilters() {
    const filterContainer = document.getElementById('console-filter');
    if (!filterContainer) return;
    
    const types = [
        { id: 'log', label: 'Log', color: '#007acc' },
        { id: 'warn', label: 'Warn', color: '#cca700' },
        { id: 'error', label: 'Error', color: '#f44747' },
        { id: 'info', label: 'Info', color: '#4ec9b0' },
        { id: 'debug', label: 'Debug', color: '#888' },
        { id: 'global_error', label: 'Global Error', color: '#d16969' },
        { id: 'unhandled_rejection', label: 'Promise Error', color: '#c586c0' }
    ];
    
    types.forEach(type => {
        const label = document.createElement('label');
        label.className = 'filter-checkbox';
        label.innerHTML = `
            <input type="checkbox" id="filter-${type.id}" checked 
                   onchange="toggleConsoleFilter('${type.id}', this.checked)">
            <span style="color: ${type.color}">${type.label}</span>
        `;
        filterContainer.appendChild(label);
    });
}

// Toggle console filter
function toggleConsoleFilter(type, enabled) {
    consoleFilters[type] = enabled;
    renderConsoleLogs();
}

// Update displayed API endpoint
function updateApiEndpoint() {
    const endpointElement = document.getElementById('api-endpoint');
    if (endpointElement) {
        endpointElement.textContent = API_BASE_URL;
    }
}

// Check if API is reachable
async function checkApiStatus() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('api-status-text');
    
    if (!statusDot || !statusText) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/health`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            apiStatus = 'connected';
            statusDot.className = 'status-dot';
            statusText.textContent = 'API Connected';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        apiStatus = 'disconnected';
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'API Disconnected';
        console.warn('API check failed:', error);
    }
}

// Fetch website source
async function fetchSource() {
    const urlInput = document.getElementById('url-input');
    if (!urlInput) return;
    
    const url = urlInput.value.trim();
    const executeJS = document.getElementById('execute-js')?.checked || false;
    const captureConsole = document.getElementById('capture-console')?.checked || false;
    
    if (!url) {
        showError('Please enter a URL');
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showError('URL must start with http:// or https://');
        return;
    }
    
    // Show loading
    const loadingElement = document.getElementById('loading');
    const resultsElement = document.getElementById('results');
    const errorCard = document.getElementById('error-card');
    
    if (loadingElement) loadingElement.style.display = 'block';
    if (resultsElement) resultsElement.style.display = 'none';
    if (errorCard) errorCard.style.display = 'none';
    
    // Show JS execution status if enabled
    const jsStatus = document.getElementById('js-status');
    const jsResults = document.getElementById('js-results');
    
    if (executeJS && jsStatus) {
        jsStatus.style.display = 'flex';
    }
    if (jsResults) {
        jsResults.style.display = 'none';
    }
    
    try {
        const params = new URLSearchParams({
            url: url,
            executeJs: executeJS.toString()
        });
        
        const apiUrl = `${API_BASE_URL}/api/fetch?${params}`;
        console.log('Fetching from:', apiUrl);
        
        const response = await fetch(apiUrl, {
            signal: AbortSignal.timeout(30000)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        currentData = data;
        consoleLogs = data.javascript?.consoleLogs || [];
        
        // Update JS execution results
        if (executeJS && jsStatus && jsResults) {
            jsStatus.style.display = 'none';
            jsResults.style.display = 'flex';
            jsResults.className = 'execution-status success';
            
            const logsCount = consoleLogs.length;
            const errorsCount = data.javascript?.errors?.length || 0;
            
            let resultText = `JavaScript executed`;
            if (logsCount > 0) resultText += `, ${logsCount} console logs`;
            if (errorsCount > 0) resultText += `, ${errorsCount} errors`;
            
            jsResults.innerHTML = `<span>✓</span> <span>${resultText}</span>`;
            
            if (errorsCount > 0) {
                jsResults.className = 'execution-status error';
                jsResults.innerHTML = `<span>✗</span> <span>${errorsCount} execution errors</span>`;
            }
        }
        
        displayResults(data);
        
    } catch (error) {
        console.error('Fetch error:', error);
        showError(error.message || 'Failed to fetch website source');
        
        // Hide JS status on error
        if (jsStatus) jsStatus.style.display = 'none';
        if (jsResults) jsResults.style.display = 'none';
    } finally {
        if (loadingElement) loadingElement.style.display = 'none';
    }
}

// Display results
function displayResults(data) {
    const formatHtml = document.getElementById('format-html')?.checked || false;
    const showPreview = document.getElementById('show-preview')?.checked || false;
    
    // Display source code
    let source = data.source;
    if (formatHtml) {
        source = formatHTML(source);
    }
    
    const sourceCode = document.getElementById('source-code');
    if (sourceCode) {
        sourceCode.textContent = source;
        
        // Apply syntax highlighting if available
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(sourceCode);
        }
    }
    
    // Display headers
    const headersCode = document.getElementById('headers-code');
    if (headersCode) {
        headersCode.textContent = JSON.stringify(data.headers || {}, null, 2);
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(headersCode);
        }
    }
    
    // Display preview if enabled
    if (showPreview && data.contentType && data.contentType.includes('text/html')) {
        const previewFrame = document.getElementById('preview-frame');
        if (previewFrame) {
            const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
            previewDoc.open();
            previewDoc.write(data.source);
            previewDoc.close();
        }
    }
    
    // Update tabs visibility
    const consoleTab = document.querySelector('.tab[onclick*="console"]');
    const previewTab = document.querySelector('.tab[onclick*="preview"]');
    
    if (consoleTab) {
        consoleTab.style.display = 
            data.javascript?.executed && consoleLogs.length > 0 ? 'flex' : 'none';
    }
    
    if (previewTab) {
        previewTab.style.display = 
            showPreview && data.contentType && data.contentType.includes('text/html') ? 'flex' : 'none';
    }
    
    // Render console logs
    if (data.javascript?.executed) {
        renderConsoleLogs();
    }
    
    // Update statistics
    updateStats(data);
    
    // Show results
    const resultsElement = document.getElementById('results');
    if (resultsElement) {
        resultsElement.style.display = 'block';
    }
}

// Render console logs
function renderConsoleLogs() {
    const consoleContent = document.getElementById('console-content');
    const searchInput = document.getElementById('console-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    if (!consoleContent) return;
    
    // Filter logs
    const filteredLogs = consoleLogs.filter(log => {
        // Apply type filter
        if (!consoleFilters[log.type]) return false;
        
        // Apply search filter
        if (searchTerm) {
            const logText = JSON.stringify(log).toLowerCase();
            if (!logText.includes(searchTerm)) return false;
        }
        
        return true;
    });
    
    // Update stats
    updateConsoleStats();
    
    if (filteredLogs.length === 0) {
        consoleContent.innerHTML = '<div class="console-empty">No logs match the current filters.</div>';
        return;
    }
    
    // Render logs
    consoleContent.innerHTML = '';
    filteredLogs.forEach((log, index) => {
        const entry = document.createElement('div');
        entry.className = 'console-entry';
        entry.dataset.index = index;
        
        // Format timestamp
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        
        // Format message
        let message = '';
        if (log.args && Array.isArray(log.args)) {
            message = log.args.map(arg => {
                try {
                    // Try to parse as JSON for pretty printing
                    const parsed = JSON.parse(arg);
                    return `<span class="console-arg">${JSON.stringify(parsed, null, 2)}</span>`;
                } catch {
                    return `<span class="console-arg">${arg}</span>`;
                }
            }).join(' ');
        } else if (log.message) {
            message = `<span class="console-arg">${log.message}</span>`;
        }
        
        // Check if there's stack trace
        const hasStack = log.stack || (log.type === 'global_error' && log.stack);
        
        entry.innerHTML = `
            <div class="console-timestamp">${timestamp}</div>
            <div class="console-type console-type-${log.type}">${log.type}</div>
            <div class="console-message">${message}</div>
            ${hasStack ? '<button class="console-toggle" onclick="toggleStack(this)">▶</button>' : ''}
            ${hasStack ? `<div class="console-stack">${log.stack}</div>` : ''}
        `;
        
        consoleContent.appendChild(entry);
    });
    
    // Auto-scroll to bottom
    if (autoScroll) {
        consoleContent.scrollTop = consoleContent.scrollHeight;
    }
}

// Toggle stack trace visibility
function toggleStack(button) {
    const entry = button.parentElement;
    const isExpanded = entry.classList.contains('expanded');
    
    if (isExpanded) {
        entry.classList.remove('expanded');
        button.textContent = '▶';
    } else {
        entry.classList.add('expanded');
        button.textContent = '▼';
    }
}

// Update console statistics
function updateConsoleStats() {
    const counts = {
        total: consoleLogs.length,
        log: 0,
        warn: 0,
        error: 0,
        info: 0,
        debug: 0,
        global_error: 0,
        unhandled_rejection: 0
    };
    
    consoleLogs.forEach(log => {
        if (counts[log.type] !== undefined) {
            counts[log.type]++;
        }
    });
    
    const totalLogsElement = document.getElementById('total-logs');
    const logCountElement = document.getElementById('log-count');
    const warnCountElement = document.getElementById('warn-count');
    const errorCountElement = document.getElementById('error-count');
    
    if (totalLogsElement) totalLogsElement.textContent = counts.total;
    if (logCountElement) logCountElement.textContent = counts.log;
    if (warnCountElement) warnCountElement.textContent = counts.warn;
    if (errorCountElement) errorCountElement.textContent = counts.error;
}

// Filter console based on search
function filterConsole() {
    renderConsoleLogs();
}

// Clear console
function clearConsole() {
    consoleLogs = [];
    renderConsoleLogs();
}

// Export console logs
function exportConsole() {
    if (consoleLogs.length === 0) {
        alert('No logs to export');
        return;
    }
    
    const dataStr = JSON.stringify(consoleLogs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-logs-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Toggle auto-scroll
function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const button = document.querySelector('.console-control-btn[onclick*="Auto-scroll"]');
    if (button) {
        button.innerHTML = autoScroll ? '📜 Auto-scroll (ON)' : '📜 Auto-scroll (OFF)';
    }
    
    if (autoScroll) {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.scrollTop = consoleContent.scrollHeight;
        }
    }
}

// Format HTML for readability
function formatHTML(html) {
    let formatted = '';
    let indent = 0;
    const tab = '  ';
    
    html.split(/>\s*</).forEach(element => {
        if (element.match(/^\/\w/)) {
            indent = Math.max(0, indent - 1);
        }
        
        formatted += tab.repeat(indent) + '<' + element + '>\n';
        
        if (element.match(/^<?\w[^>]*[^\/]$/) && !element.startsWith('!--')) {
            indent++;
        }
    });
    
    return formatted.trim();
}

// Update statistics
function updateStats(data) {
    // Quick stats
    const quickStats = document.getElementById('quick-stats');
    if (quickStats) {
        quickStats.innerHTML = `
            <div class="stat-card">
                <h3>Page Size</h3>
                <div class="stat-value">${(data.sizeBytes / 1024).toFixed(2)} KB</div>
            </div>
            <div class="stat-card">
                <h3>Status Code</h3>
                <div class="stat-value">${data.status}</div>
            </div>
            <div class="stat-card">
                <h3>Content Type</h3>
                <div class="stat-value">${data.contentType?.split(';')[0] || 'Unknown'}</div>
            </div>
            <div class="stat-card">
                <h3>JavaScript</h3>
                <div class="stat-value">${data.javascript?.executed ? 'Executed' : 'Not Executed'}</div>
            </div>
        `;
    }
    
    // Page info stats
    const pageStats = document.getElementById('page-stats');
    if (pageStats && data.pageInfo) {
        pageStats.innerHTML = `
            <div class="stat-card">
                <h3>Page Title</h3>
                <div class="stat-value">${data.pageInfo.title || 'No title'}</div>
            </div>
            <div class="stat-card">
                <h3>Scripts</h3>
                <div class="stat-value">
                    Total: ${data.pageInfo.scripts?.total || 0}<br>
                    Inline: ${data.pageInfo.scripts?.inline || 0}<br>
                    External: ${data.pageInfo.scripts?.external || 0}
                </div>
            </div>
            <div class="stat-card">
                <h3>Console References</h3>
                <div class="stat-value">
                    ${data.pageInfo.elementCount?.console || 0} console. calls
                </div>
            </div>
        `;
    }
}

// Tab switching
function switchTab(tabName) {
    if (!event || !event.target) return;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Show selected tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const tabElement = document.getElementById(`tab-${tabName}`);
    if (tabElement) {
        tabElement.classList.add('active');
    }
}

// Copy source to clipboard
async function copySource() {
    if (!currentData) return;
    
    try {
        await navigator.clipboard.writeText(currentData.source);
        alert('Source code copied to clipboard!');
    } catch (error) {
        showError('Failed to copy: ' + error.message);
    }
}

// Download source as file
function downloadSource() {
    if (!currentData) return;
    
    const url = new URL(currentData.url);
    const filename = `${url.hostname}-${new Date().toISOString().slice(0,10)}.html`;
    const blob = new Blob([currentData.source], { type: 'text/html' });
    const downloadUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

// Toggle word wrap
function toggleWrap() {
    const sourceCode = document.getElementById('source-code');
    if (!sourceCode) return;
    
    const pre = sourceCode.parentElement;
    if (pre) {
        pre.style.whiteSpace = pre.style.whiteSpace === 'pre-wrap' ? 'pre' : 'pre-wrap';
    }
}

// Show error
function showError(message) {
    const errorMessageElement = document.getElementById('error-message');
    const errorCard = document.getElementById('error-card');
    
    if (errorMessageElement) errorMessageElement.textContent = message;
    if (errorCard) errorCard.style.display = 'block';
}
