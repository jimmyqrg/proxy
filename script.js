const proxy = "https://proxy.ikunbeautiful.workers.dev/?url=";
const tabs = [];
let history = JSON.parse(localStorage.getItem("browserHistory") || "[]");
let bookmarks = JSON.parse(localStorage.getItem("browserBookmarks") || "[]");
let activeTab = null;

// Track if we're initializing dark mode from device
let isInitialDarkModeLoad = true;

// Tab cloak state
let isTabCloaked = false;
const cloakIcon = "https://pausd.schooloqy.com/cloak-images/pausd.png";
const cloakTitle = "My Apps";
const originalFaviconLight = "/favicon-light.png";
const originalFaviconDark = "/favicon-dark.png";
const originalTitle = "HackWize";

// ---------- Tab Cloak Functions ----------
function toggleTabCloak() {
    isTabCloaked = !isTabCloaked;
    const tabCloakBtn = document.getElementById("tabCloak");
    
    if (isTabCloaked) {
        // Apply cloak
        document.title = cloakTitle;
        
        // Update favicon links
        document.querySelectorAll('link[rel="icon"]').forEach(link => {
            link.href = cloakIcon;
        });
        
        // Update button appearance
        tabCloakBtn.innerHTML = `<span class="material-icons" style="color: #34A853;">visibility</span>`;
        tabCloakBtn.title = "Disable tab cloak (Currently cloaked)";
        
        // Store cloak state
        localStorage.setItem("tabCloaked", "true");
    } else {
        // Remove cloak
        updateBrowserTitle();
        
        // Restore original favicons
        document.querySelectorAll('link[rel="icon"]').forEach(link => {
            const media = link.getAttribute('media');
            if (media === '(prefers-color-scheme: light)') {
                link.href = originalFaviconLight;
            } else if (media === '(prefers-color-scheme: dark)') {
                link.href = originalFaviconDark;
            } else {
                link.href = originalFaviconLight;
            }
        });
        
        // Update button appearance
        tabCloakBtn.innerHTML = `<span class="material-icons">visibility</span>`;
        tabCloakBtn.title = "Enable tab cloak";
        
        // Remove cloak state
        localStorage.setItem("tabCloaked", "false");
    }
}

function updateBrowserTitle() {
    if (isTabCloaked) {
        document.title = cloakTitle;
    } else if (activeTab && activeTab.title && activeTab.title !== "Loading..." && activeTab.title !== "Error loading page") {
        document.title = "HackWize - " + (activeTab.title.length > 30 ? activeTab.title.substring(0, 30) + "..." : activeTab.title);
    } else {
        document.title = originalTitle;
    }
}

// ---------- Favicon Cache ----------
const defaultFavicon = "https://pausd.schooloqy.com/cloak-images/default.png";
const faviconCache = new Map();

const favicon = async (url) => {
    try {
        const domain = new URL(url).hostname;
        
        if (faviconCache.has(domain)) {
            return faviconCache.get(domain);
        }
        
        const faviconUrls = [
            `https://${domain}/favicon.ico`,
            `https://${domain}/favicon.png`,
            `https://${domain}/apple-touch-icon.png`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`
        ];
        
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
            }
        }
        
        faviconCache.set(domain, defaultFavicon);
        return defaultFavicon;
    } catch {
        return defaultFavicon;
    }
};

// ---------- Dark Mode ----------
const themeBtn = document.getElementById("theme");

function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const setTheme = (dark) => {
    if (isInitialDarkModeLoad && localStorage.getItem("darkMode") === null) {
        dark = getSystemTheme();
    }
    
    document.body.classList.toggle("dark", dark);
    themeBtn.innerHTML = `<span class="material-icons">${dark ? "light_mode" : "dark_mode"}</span>`;
    localStorage.setItem("darkMode", dark ? "1" : "0");
    isInitialDarkModeLoad = false;
};

const savedTheme = localStorage.getItem("darkMode");
if (savedTheme !== null) {
    setTheme(savedTheme === "1");
} else {
    setTheme(getSystemTheme());
}

themeBtn.onclick = () => {
    setTheme(!document.body.classList.contains("dark"));
};

if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
        if (localStorage.getItem("darkMode") === null) {
            setTheme(e.matches);
        }
    });
}

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
        
        const displayTitle = t.title && t.title.length > 20 
            ? t.title.substring(0, 20) + "..." 
            : t.title || new URL(t.url).hostname || "New Tab";
        
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
        
        // Tab hover preview
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
    
    iframe.src = proxy + encodeURIComponent(url);
    iframe.style.display = "none";
    iframe.dataset.id = id;
    iframe.sandbox = "allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox";
    
    iframe.onload = () => {
        try {
            const script = document.createElement('script');
            script.textContent = `
                // Override window.open to open in our browser
                const originalOpen = window.open;
                window.open = function(url, target, features) {
                    if (url && typeof url === 'string') {
                        window.parent.postMessage({
                            type: 'NEW_TAB',
                            url: url
                        }, '*');
                        return {
                            close: function() {
                                window.parent.postMessage({
                                    type: 'CLOSE_TAB',
                                    url: url
                                }, '*');
                            }
                        };
                    }
                    return originalOpen.apply(this, arguments);
                };
                
                // Override window.close to close current tab
                const originalClose = window.close;
                window.close = function() {
                    window.parent.postMessage({
                        type: 'CLOSE_CURRENT_TAB'
                    }, '*');
                    return originalClose.apply(this, arguments);
                };
                
                // Intercept links that open in new window
                document.addEventListener('click', function(e) {
                    let target = e.target;
                    while (target && target.tagName !== 'A') {
                        target = target.parentElement;
                    }
                    
                    if (target && target.tagName === 'A') {
                        const targetAttr = target.getAttribute('target');
                        if (targetAttr && (targetAttr === '_blank' || targetAttr === 'new')) {
                            e.preventDefault();
                            const href = target.getAttribute('href');
                            if (href) {
                                window.parent.postMessage({
                                    type: 'NEW_TAB',
                                    url: href
                                }, '*');
                            }
                        }
                    }
                });
                
                // Update parent when title changes
                let lastTitle = document.title;
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.target === document.querySelector('title')) {
                            if (document.title !== lastTitle) {
                                lastTitle = document.title;
                                window.parent.postMessage({
                                    type: 'UPDATE_TITLE',
                                    title: document.title,
                                    url: window.location.href
                                }, '*');
                            }
                        }
                    });
                });
                
                // Observe title element
                const titleElement = document.querySelector('title');
                if (titleElement) {
                    observer.observe(titleElement, { subtree: true, characterData: true, childList: true });
                }
                
                // Send initial title
                if (document.title) {
                    window.parent.postMessage({
                        type: 'UPDATE_TITLE',
                        title: document.title,
                        url: window.location.href
                    }, '*');
                }
                
                // Proxy iframe src attributes
                function proxyIframeSrc() {
                    const iframes = document.querySelectorAll('iframe');
                    
                    iframes.forEach(iframe => {
                        const originalSrc = iframe.getAttribute('src');
                        if (originalSrc && !originalSrc.includes('${proxy}')) {
                            try {
                                let fullUrl;
                                if (originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
                                    fullUrl = originalSrc;
                                } else if (originalSrc.startsWith('//')) {
                                    fullUrl = window.location.protocol + originalSrc;
                                } else if (originalSrc.startsWith('/')) {
                                    fullUrl = window.location.origin + originalSrc;
                                } else {
                                    fullUrl = new URL(originalSrc, window.location.href).href;
                                }
                                
                                // Only proxy if it's a different origin
                                if (!fullUrl.startsWith(window.location.origin)) {
                                    const proxiedUrl = '${proxy}' + encodeURIComponent(fullUrl);
                                    iframe.setAttribute('src', proxiedUrl);
                                    iframe.setAttribute('data-original-src', originalSrc);
                                }
                            } catch (e) {
                                // Invalid URL, skip
                            }
                        }
                    });
                }
                
                // Proxy iframes on page load
                proxyIframeSrc();
                
                // Watch for dynamically added iframes
                const iframeObserver = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach(function(node) {
                                if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
                                    setTimeout(proxyIframeSrc, 100);
                                }
                            });
                        }
                    });
                });
                
                iframeObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            `;
            
            try {
                iframe.contentDocument.head.appendChild(script);
            } catch (e) {
                // Cross-origin restrictions may prevent injection
            }
            
            // Try to get title from iframe
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
        } catch (e) {
            activeTab.title = new URL(activeTab.url).hostname || "New Tab";
        }
        
        updateBrowserTitle();
        renderTabs();
    };
    
    iframe.onerror = () => {
        console.error("Failed to load:", url);
        activeTab.title = "Error loading page";
        updateBrowserTitle();
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
        updateNavButtonStates();
        updateBrowserTitle();
        
        try {
            const iframeUrl = activeTab.iframe.contentWindow.location.href;
            if (iframeUrl && iframeUrl !== 'about:blank' && iframeUrl !== activeTab.url) {
                activeTab.url = iframeUrl;
                document.getElementById("url").value = iframeUrl;
            }
        } catch (e) {
            // Cross-origin restriction, use stored URL
        }
    }
}

function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    
    const wasActive = activeTab?.id === id;
    
    if (tabs[idx].iframe && tabs[idx].iframe.parentNode) {
        tabs[idx].iframe.parentNode.removeChild(tabs[idx].iframe);
    }
    
    tabs.splice(idx, 1);
    
    if (wasActive) {
        const newIndex = Math.max(0, idx - 1);
        if (tabs[newIndex]) {
            switchTab(tabs[newIndex].id);
        } else {
            newTab();
        }
    }
    
    renderTabs();
    updateNavButtonStates();
}

// ---------- Message Listener ----------
window.addEventListener('message', function(event) {
    if (!event.data.type) return;
    
    switch(event.data.type) {
        case 'NEW_TAB':
            if (event.data.url) {
                newTab(event.data.url);
            }
            break;
            
        case 'CLOSE_TAB':
            if (event.data.url) {
                const tab = tabs.find(t => t.url === event.data.url);
                if (tab) closeTab(tab.id);
            }
            break;
            
        case 'CLOSE_CURRENT_TAB':
            if (tabs.length > 1) {
                closeTab(activeTab.id);
            }
            break;
            
        case 'UPDATE_TITLE':
            if (event.data.title && event.data.url) {
                const tab = tabs.find(t => t.url === event.data.url);
                if (tab) {
                    tab.title = event.data.title;
                    if (tab === activeTab) {
                        updateBrowserTitle();
                    }
                    renderTabs();
                }
            }
            break;
    }
});

// ---------- History & Bookmarks ----------
function saveHistory(url) {
    if (url.includes(proxy) || history[history.length - 1] === url) return;
    
    history.push(url);
    if (history.length > 100) {
        history = history.slice(-100);
    }
    localStorage.setItem("browserHistory", JSON.stringify(history));
    renderHistory();
}

async function renderHistory() {
    const h = document.getElementById("history");
    h.innerHTML = "";
    
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
        
        d.onclick = (e) => {
            if (!e.target.closest('.delete-item')) {
                navigate(u);
            }
        };
        
        const deleteBtn = d.querySelector('.delete-item');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteHistoryItem(i);
        };
        
        d.onmouseenter = () => {
            deleteBtn.style.opacity = '0.75';
        };
        
        d.onmouseleave = () => {
            deleteBtn.style.opacity = '0';
        };
        
        h.appendChild(d);
    }
}

function deleteHistoryItem(reversedIndex) {
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
        
        d.onclick = (e) => {
            if (!e.target.closest('.delete-item')) {
                navigate(u);
            }
        };
        
        const deleteBtn = d.querySelector('.delete-item');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteBookmarkItem(i);
        };
        
        d.onmouseenter = () => {
            deleteBtn.style.opacity = '0.75';
        };
        
        d.onmouseleave = () => {
            deleteBtn.style.opacity = '0';
        };
        
        b.appendChild(d);
    }
}

function deleteBookmarkItem(index) {
    if (index >= 0 && index < bookmarks.length) {
        bookmarks.splice(index, 1);
        localStorage.setItem("browserBookmarks", JSON.stringify(bookmarks));
        renderBookmarks();
        updateBookmarkButton();
    }
}

function toggleBookmark(url) {
    if (!url) return;
    
    const index = bookmarks.indexOf(url);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.push(url);
    }
    
    localStorage.setItem("browserBookmarks", JSON.stringify(bookmarks));
    renderBookmarks();
    updateBookmarkButton();
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
    
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    
    try {
        new URL(url);
    } catch {
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
        updateBrowserTitle();
        renderTabs();
    }
}

// ---------- Button Event Listeners ----------
document.getElementById("go").onclick = () => {
    const url = document.getElementById("url").value.trim();
    if (url) navigate(url);
};

document.getElementById("newtab").onclick = () => newTab();

document.getElementById("back").onclick = () => {
    if (activeTab?.iframe?.contentWindow) {
        try {
            activeTab.iframe.contentWindow.history.back();
            setTimeout(() => {
                try {
                    const iframeUrl = activeTab.iframe.contentWindow.location.href;
                    if (iframeUrl && iframeUrl !== 'about:blank') {
                        activeTab.url = iframeUrl;
                        document.getElementById("url").value = iframeUrl;
                        saveHistory(iframeUrl);
                    }
                } catch (e) {
                    // Cross-origin restriction
                }
            }, 100);
        } catch (e) {
            console.log("Cannot go back due to cross-origin restrictions");
        }
    }
};

document.getElementById("forward").onclick = () => {
    if (activeTab?.iframe?.contentWindow) {
        try {
            activeTab.iframe.contentWindow.history.forward();
            setTimeout(() => {
                try {
                    const iframeUrl = activeTab.iframe.contentWindow.location.href;
                    if (iframeUrl && iframeUrl !== 'about:blank') {
                        activeTab.url = iframeUrl;
                        document.getElementById("url").value = iframeUrl;
                        saveHistory(iframeUrl);
                    }
                } catch (e) {
                    // Cross-origin restriction
                }
            }, 100);
        } catch (e) {
            console.log("Cannot go forward due to cross-origin restrictions");
        }
    }
};

document.getElementById("reload").onclick = () => {
    if (activeTab) {
        const reloadBtn = document.getElementById("reload");
        reloadBtn.classList.add('loading');
        
        try {
            activeTab.iframe.contentWindow.location.reload();
        } catch (e) {
            activeTab.iframe.src = activeTab.iframe.src;
        }
        
        setTimeout(() => {
            reloadBtn.classList.remove('loading');
        }, 1000);
    }
};

document.getElementById("home").onclick = () => {
    navigate("https://proxy.jimmyqrg.com/default/");
};

document.getElementById("bookmark").onclick = () => {
    if (activeTab && activeTab.url) {
        toggleBookmark(activeTab.url);
    }
};

document.getElementById("tabCloak").onclick = toggleTabCloak;

// URL input handling
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
        bookmarkBtn.title = "Remove bookmark";
    } else {
        bookmarkBtn.innerHTML = `<span class="material-icons">star_border</span>`;
        bookmarkBtn.title = "Add bookmark";
    }
}

// ---------- Update Navigation Button States ----------
function updateNavButtonStates() {
    const backBtn = document.getElementById("back");
    const forwardBtn = document.getElementById("forward");
    
    if (activeTab?.iframe?.contentWindow) {
        try {
            backBtn.disabled = activeTab.iframe.contentWindow.history.length <= 1;
            forwardBtn.disabled = true;
            
            if (backBtn.disabled) {
                backBtn.classList.add('no-history');
            } else {
                backBtn.classList.remove('no-history');
            }
            
            if (forwardBtn.disabled) {
                forwardBtn.classList.add('no-history');
            } else {
                forwardBtn.classList.remove('no-history');
            }
        } catch (e) {
            backBtn.disabled = false;
            forwardBtn.disabled = false;
            backBtn.classList.remove('no-history');
            forwardBtn.classList.remove('no-history');
        }
    } else {
        backBtn.disabled = true;
        forwardBtn.disabled = true;
        backBtn.classList.add('no-history');
        forwardBtn.classList.add('no-history');
    }
}

// Update button states periodically
setInterval(updateNavButtonStates, 1000);

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    // Check saved cloak state
    const savedCloakState = localStorage.getItem("tabCloaked");
    if (savedCloakState === "true") {
        isTabCloaked = true;
        const tabCloakBtn = document.getElementById("tabCloak");
        
        // Apply cloak immediately
        document.title = cloakTitle;
        document.querySelectorAll('link[rel="icon"]').forEach(link => {
            link.href = cloakIcon;
        });
        
        tabCloakBtn.innerHTML = `<span class="material-icons" style="color: #34A853;">visibility</span>`;
        tabCloakBtn.title = "Disable tab cloak (Currently cloaked)";
    }
    
    renderHistory();
    renderBookmarks();
    newTab();
    
    updateNavButtonStates();
    
    const observer = new MutationObserver(() => {
        updateNavButtonStates();
    });
    
    observer.observe(document.getElementById("iframes"), {
        childList: true,
        subtree: true
    });
});
