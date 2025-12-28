const proxy = "https://proxy.ikunbeautiful.workers.dev/?url=";
const tabs = [];
let history = JSON.parse(localStorage.getItem("browserHistory") || "[]");
let bookmarks = JSON.parse(localStorage.getItem("browserBookmarks") || "[]");
let activeTab = null;

// ---------- Favicon Cache ----------
const defaultFavicon = "https://student.jimmyqrg.com/cloak-images/default.png";
const faviconCache = new Map();

const favicon = async (url) => {
    try {
        const domain = new URL(url).hostname;
        
        // Check cache first
        if (faviconCache.has(domain)) {
            return faviconCache.get(domain);
        }
        
        // Try to fetch favicon directly from the site
        const faviconUrls = [
            `https://${domain}/favicon.ico`,
            `https://${domain}/favicon.png`,
            `https://${domain}/apple-touch-icon.png`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`
        ];
        
        // Try each favicon source
        for (const favUrl of faviconUrls) {
            try {
                const response = await fetch(favUrl, { 
                    method: 'HEAD',
                    mode: 'no-cors'
                });
                
                if (response.ok || response.type === 'opaque') {
                    faviconCache.set(domain, favUrl);
                    return favUrl;
                }
            } catch (e) {
                // Continue to next URL
                console.log(`Failed to fetch favicon from ${favUrl}:`, e.message);
            }
        }
        
        // If no favicon found, use default
        faviconCache.set(domain, defaultFavicon);
        return defaultFavicon;
    } catch {
        return defaultFavicon;
    }
};

// ---------- Dark Mode ----------
const themeBtn = document.getElementById("theme");
const setTheme = dark => {
    document.body.classList.toggle("dark", dark);
    themeBtn.innerHTML = `<span class="material-icons">${dark ? "light_mode" : "dark_mode"}</span>`;
    localStorage.setItem("darkMode", dark ? "1" : "0");
};
setTheme(localStorage.getItem("darkMode") === "1");
themeBtn.onclick = () => setTheme(!document.body.classList.contains("dark"));

// ---------- Tab Preview ----------
const preview = document.getElementById("tabPreview");
let previewTimeout;

// ---------- Render Tabs ----------
async function renderTabs() {
    const tabsDiv = document.getElementById("tabs");
    tabsDiv.innerHTML = "";
    
    for (const t of tabs) {
        const tabEl = document.createElement("div");
        tabEl.className = "tab" + (t === activeTab ? " active" : "");
        tabEl.dataset.id = t.id;
        
        // Use shorter title for display
        const displayTitle = t.title && t.title.length > 20 
            ? t.title.substring(0, 20) + "..." 
            : t.title || new URL(t.url).hostname || "New Tab";
        
        // Get favicon (async)
        const faviconUrl = await favicon(t.url);
        
        tabEl.innerHTML = `
            <img src="${faviconUrl}" alt="favicon" onerror="this.src='${defaultFavicon}'">
            <span>${displayTitle}</span>
            <button class="close-tab" title="Close tab">&times;</button>
        `;
        
        tabEl.onclick = (e) => {
            if (!e.target.classList.contains('close-tab')) {
                switchTab(t.id);
            }
        };
        
        tabEl.querySelector(".close-tab").onclick = e => {
            e.stopPropagation();
            closeTab(t.id);
        };
        
        // Tab hover preview with delay
        tabEl.onmouseenter = e => {
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => {
                if (t.iframe && t.iframe.src.startsWith(window.location.origin)) {
                    preview.innerHTML = '';
                    const clone = t.iframe.cloneNode(true);
                    clone.style.pointerEvents = 'none';
                    clone.style.transform = 'scale(0.5)';
                    clone.style.transformOrigin = 'top left';
                    clone.style.width = '600px';
                    clone.style.height = '400px';
                    preview.appendChild(clone);
                } else {
                    preview.innerHTML = `<div style="padding:10px;"><strong>${t.title || t.url}</strong><br><small>${t.url}</small></div>`;
                }
                preview.style.display = 'block';
                updatePreviewPosition(e);
            }, 300);
        };
        
        tabEl.onmousemove = updatePreviewPosition;
        tabEl.onmouseleave = () => {
            clearTimeout(previewTimeout);
            preview.style.display = 'none';
        };
        
        tabsDiv.appendChild(tabEl);
    }
    
    attachDragEvents();
}

function updatePreviewPosition(e) {
    const previewRect = preview.getBoundingClientRect();
    const x = Math.min(e.pageX, window.innerWidth - previewRect.width - 10);
    const y = Math.min(e.pageY + 20, window.innerHeight - previewRect.height - 10);
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
}

// ---------- Drag & Reorder ----------
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcEl.dataset.id);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragSrcEl !== e.currentTarget) {
        const fromId = dragSrcEl.dataset.id;
        const toId = e.currentTarget.dataset.id;
        const fromIndex = tabs.findIndex(t => t.id == fromId);
        const toIndex = tabs.findIndex(t => t.id == toId);
        
        if (fromIndex !== -1 && toIndex !== -1) {
            const [removed] = tabs.splice(fromIndex, 1);
            tabs.splice(toIndex, 0, removed);
            renderTabs();
            attachDragEvents();
        }
    }
}

function attachDragEvents() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.draggable = true;
        tab.addEventListener('dragstart', handleDragStart);
        tab.addEventListener('dragover', handleDragOver);
        tab.addEventListener('drop', handleDrop);
    });
}

// ---------- Tab Management ----------
function newTab(url = "https://proxy.jimmyqrg.com/default/") {
    const id = Date.now();
    const iframe = document.createElement("iframe");
    
    // Set up iframe
    iframe.src = proxy + encodeURIComponent(url);
    iframe.style.display = "none";
    iframe.dataset.id = id;
    iframe.sandbox = "allow-same-origin allow-scripts allow-forms allow-popups allow-modals";
    
    iframe.onload = () => {
        try {
            const title = iframe.contentDocument?.title;
            if (title && title.trim()) {
                activeTab.title = title;
            } else {
                activeTab.title = new URL(activeTab.url).hostname;
            }
        } catch (e) {
            activeTab.title = new URL(activeTab.url).hostname || "New Tab";
        }
        renderTabs();
    };
    
    iframe.onerror = () => {
        console.error("Failed to load:", url);
        activeTab.title = "Error loading page";
        renderTabs();
    };
    
    document.getElementById("iframes").appendChild(iframe);
    
    const tab = {
        id,
        url,
        title: "Loading...",
        iframe
    };
    
    tabs.push(tab);
    switchTab(id);
    return tab;
}

function switchTab(id) {
    tabs.forEach(t => {
        if (t.iframe) {
            t.iframe.style.display = "none";
        }
    });
    
    activeTab = tabs.find(t => t.id === id);
    
    if (activeTab && activeTab.iframe) {
        activeTab.iframe.style.display = "block";
        document.getElementById("url").value = activeTab.url;
        renderTabs();
        updateBookmarkButton();
    }
}

function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    
    // Remove iframe from DOM
    if (tabs[idx].iframe && tabs[idx].iframe.parentNode) {
        tabs[idx].iframe.parentNode.removeChild(tabs[idx].iframe);
    }
    
    tabs.splice(idx, 1);
    
    if (activeTab?.id === id) {
        // Switch to nearest tab
        const newIndex = Math.max(0, idx - 1);
        if (tabs[newIndex]) {
            switchTab(tabs[newIndex].id);
        } else {
            // No tabs left, create new one
            newTab();
        }
    }
    
    renderTabs();
}

// ---------- History & Bookmarks ----------
function saveHistory(url) {
    // Don't save proxy URLs or duplicates
    if (url.includes(proxy) || history[history.length - 1] === url) return;
    
    history.push(url);
    // Keep only last 100 history items
    if (history.length > 100) {
        history = history.slice(-100);
    }
    localStorage.setItem("browserHistory", JSON.stringify(history));
    renderHistory();
}

async function renderHistory() {
    const h = document.getElementById("history");
    h.innerHTML = "";
    
    // Show most recent first
    const reversedHistory = history.slice().reverse();
    
    for (let i = 0; i < reversedHistory.length; i++) {
        const u = reversedHistory[i];
        const d = document.createElement("div");
        d.className = "item history-item";
        d.title = u;
        d.dataset.index = i;
        
        const faviconUrl = await favicon(u);
        d.innerHTML = `
            <img src="${faviconUrl}" alt="favicon" onerror="this.src='${defaultFavicon}'">
            <span class="item-text">${new URL(u).hostname || u}</span>
            <button class="delete-item" title="Delete this item" style="margin-left: auto; opacity: 0; transition: opacity 0.2s;">
                <span class="material-icons" style="font-size: 18px;">close</span>
            </button>
        `;
        
        // Navigate on click
        d.onclick = (e) => {
            if (!e.target.closest('.delete-item')) {
                navigate(u);
            }
        };
        
        // Delete button functionality
        const deleteBtn = d.querySelector('.delete-item');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteHistoryItem(i);
        };
        
        // Show delete button on hover
        d.onmouseenter = () => {
            deleteBtn.style.opacity = '0.75';
        };
        
        d.onmouseleave = () => {
            deleteBtn.style.opacity = '0';
        };
        
        h.appendChild(d);
    }
}

// Delete single history item
function deleteHistoryItem(reversedIndex) {
    // Convert reversed index back to original index
    const originalIndex = history.length - 1 - reversedIndex;
    if (originalIndex >= 0 && originalIndex < history.length) {
        history.splice(originalIndex, 1);
        localStorage.setItem("browserHistory", JSON.stringify(history));
        renderHistory();
    }
}

async function renderBookmarks() {
    const b = document.getElementById("bookmarks");
    b.innerHTML = "";
    
    for (let i = 0; i < bookmarks.length; i++) {
        const u = bookmarks[i];
        const d = document.createElement("div");
        d.className = "item bookmark-item";
        d.title = u;
        d.dataset.index = i;
        
        const faviconUrl = await favicon(u);
        d.innerHTML = `
            <img src="${faviconUrl}" alt="favicon" onerror="this.src='${defaultFavicon}'">
            <span class="item-text">${new URL(u).hostname || u}</span>
            <button class="delete-item" title="Delete this bookmark" style="margin-left: auto; opacity: 0; transition: opacity 0.2s;">
                <span class="material-icons" style="font-size: 18px;">close</span>
            </button>
        `;
        
        // Navigate on click
        d.onclick = (e) => {
            if (!e.target.closest('.delete-item')) {
                navigate(u);
            }
        };
        
        // Delete button functionality
        const deleteBtn = d.querySelector('.delete-item');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteBookmarkItem(i);
        };
        
        // Show delete button on hover
        d.onmouseenter = () => {
            deleteBtn.style.opacity = '0.75';
        };
        
        d.onmouseleave = () => {
            deleteBtn.style.opacity = '0';
        };
        
        b.appendChild(d);
    }
}

// Delete single bookmark
function deleteBookmarkItem(index) {
    if (index >= 0 && index < bookmarks.length) {
        bookmarks.splice(index, 1);
        localStorage.setItem("browserBookmarks", JSON.stringify(bookmarks));
        renderBookmarks();
        updateBookmarkButton();
    }
}

function addBookmark(url) {
    if (!url || bookmarks.includes(url)) return;
    
    bookmarks.push(url);
    localStorage.setItem("browserBookmarks", JSON.stringify(bookmarks));
    renderBookmarks();
    updateBookmarkButton();
}

function removeBookmark(url) {
    const index = bookmarks.indexOf(url);
    if (index > -1) {
        bookmarks.splice(index, 1);
        localStorage.setItem("browserBookmarks", JSON.stringify(bookmarks));
        renderBookmarks();
        updateBookmarkButton();
    }
}

// ---------- Clear History ----------
document.getElementById("clearHistory").onclick = () => {
    if (confirm("Clear all browsing history?")) {
        history = [];
        localStorage.setItem("browserHistory", "[]");
        renderHistory();
    }
};

// ---------- Sidebar ----------
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleSidebar");

toggleBtn.onclick = () => {
    sidebar.classList.toggle("collapsed");
    toggleBtn.querySelector("span").innerText = 
        sidebar.classList.contains("collapsed") ? "chevron_right" : "chevron_left";
    toggleBtn.title = sidebar.classList.contains("collapsed") 
        ? "Show Sidebar" 
        : "Hide Sidebar";
};

// ---------- Navigation ----------
function navigate(url) {
    if (!url || typeof url !== 'string') return;
    
    // Add https:// if no protocol specified
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    
    try {
        // Validate URL
        new URL(url);
    } catch {
        // If invalid, try search
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    
    if (!activeTab) {
        newTab(url);
    } else {
        activeTab.url = url;
        activeTab.title = "Loading...";
        activeTab.iframe.src = proxy + encodeURIComponent(url);
        document.getElementById("url").value = url;
        saveHistory(url);
        renderTabs();
    }
}

// ---------- Event Listeners ----------
document.getElementById("go").onclick = () => 
    navigate(document.getElementById("url").value.trim());

document.getElementById("newtab").onclick = () => newTab();

document.getElementById("back").onclick = () => 
    activeTab?.iframe.contentWindow.history.back();

document.getElementById("forward").onclick = () => 
    activeTab?.iframe.contentWindow.history.forward();

document.getElementById("reload").onclick = () => 
    activeTab && (activeTab.iframe.src = activeTab.iframe.src);

document.getElementById("home").onclick = () => 
    navigate("https://proxy.jimmyqrg.com/default/");

document.getElementById("bookmark").onclick = () => 
    activeTab && addBookmark(activeTab.url);

document.getElementById("url").addEventListener("keydown", e => {
    if (e.key === "Enter") {
        navigate(e.target.value.trim());
    }
});

// Update bookmark button state
function updateBookmarkButton() {
    const bookmarkBtn = document.getElementById("bookmark");
    if (activeTab && bookmarks.includes(activeTab.url)) {
        bookmarkBtn.innerHTML = `<span class="material-icons" style="color: gold;">star</span>`;
    } else {
        bookmarkBtn.innerHTML = `<span class="material-icons">star_border</span>`;
    }
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    renderBookmarks();
    newTab();
});