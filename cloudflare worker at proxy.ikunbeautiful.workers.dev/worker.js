// --------------------
// URL Rewriting
// --------------------
function rewriteUrl(original, base) {
    try {
    if (!original || original === '#' || original.startsWith('javascript:') || original.startsWith('data:') || original.startsWith('blob:')) {
      return original;
    }
    
    // Handle protocol-relative URLs
    if (original.startsWith('//')) {
      original = 'https:' + original;
    }
    
      const abs = new URL(original, base).toString();
  
      // ✅ Do NOT proxy your own Worker assets
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return original;
  
      // Proxy everything else
      return "/?url=" + encodeURIComponent(abs);
    } catch {
      return original;
    }
  }

// Helper to get the actual target URL from proxied URL
function getActualUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    const targetParam = url.searchParams.get('url');
    return targetParam || proxyUrl;
  } catch {
    return proxyUrl;
    }
  }
  
  // --------------------
  // Phase 3 Rewriters
  // --------------------
  class AnchorRewriter {
    constructor(base) { this.base = base; }
    element(el) {
      const href = el.getAttribute("href");
      if (href) el.setAttribute("href", rewriteUrl(href, this.base));
    
    // Rewrite target="_blank" to work in proxy
    const target = el.getAttribute("target");
    if (target === "_blank" || target === "_new") {
      el.removeAttribute("target");
      el.setAttribute("data-proxy-target", target);
    }
    }
  }
  
  class LinkRewriter {
    constructor(base) { this.base = base; }
    element(el) {
      const href = el.getAttribute("href");
      if (href) el.setAttribute("href", rewriteUrl(href, this.base));
    }
  }
  
  class ImageRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts[0]) parts[0] = rewriteUrl(parts[0], this.base);
        return parts.join(' ');
      }).join(', ');
      el.setAttribute("srcset", rewritten);
    }
  }
}

// --------------------
// Source/Video/Audio Rewriter
// --------------------
class SourceRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts[0]) parts[0] = rewriteUrl(parts[0], this.base);
        return parts.join(' ');
      }).join(', ');
      el.setAttribute("srcset", rewritten);
    }
  }
}

class VideoRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    const poster = el.getAttribute("poster");
    if (poster) el.setAttribute("poster", rewriteUrl(poster, this.base));
  }
}

class AudioRewriter {
    constructor(base) { this.base = base; }
    element(el) {
      const src = el.getAttribute("src");
      if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    }
  }
  
  // --------------------
  // Favicon Handler
  // --------------------
  class FaviconRewriter {
      constructor(base) { this.base = base; }
      element(el) {
          const href = el.getAttribute("href");
          if (href && (href.includes("favicon") || href.includes("icon"))) {
              el.setAttribute("href", rewriteUrl(href, this.base));
          }
      }
  }
  
  // --------------------
  // IFrame Handler
  // --------------------
  class IFrameRewriter {
      constructor(base) { this.base = base; }
      element(el) {
          const src = el.getAttribute("src");
          if (src) {
              el.setAttribute("src", rewriteUrl(src, this.base));
          }
          
          // Also handle srcdoc if present
          const srcdoc = el.getAttribute("srcdoc");
          if (srcdoc) {
              // Basic srcdoc rewriting for iframe content
              const rewrittenSrcdoc = srcdoc
                  .replace(/src="([^"]*)"/g, (match, src) => {
                      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) {
                          return `src="${rewriteUrl(src, this.base)}"`;
                      }
                      return match;
                  })
                  .replace(/href="([^"]*)"/g, (match, href) => {
                      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) {
                          return `href="${rewriteUrl(href, this.base)}"`;
                      }
                      return match;
                  });
              el.setAttribute("srcdoc", rewrittenSrcdoc);
        }
    }
}

// --------------------
// Base tag handler - critical for relative URLs
// --------------------
class BaseRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    // Remove base tag as it interferes with our URL rewriting
    el.remove();
  }
}

// --------------------
// Meta tag handler - remove iframe busters
// --------------------
class MetaRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const httpEquiv = el.getAttribute("http-equiv");
    const content = el.getAttribute("content");
    
    // Remove X-Frame-Options meta tag
    if (httpEquiv && httpEquiv.toLowerCase() === "x-frame-options") {
      el.remove();
      return;
    }
    
    // Remove Content-Security-Policy meta tag or sanitize it
    if (httpEquiv && httpEquiv.toLowerCase() === "content-security-policy") {
      if (content) {
        // Remove frame-ancestors directive
        const newContent = content
          .replace(/frame-ancestors[^;]*(;|$)/gi, '')
          .replace(/frame-src[^;]*(;|$)/gi, '')
          .trim();
        if (newContent) {
          el.setAttribute("content", newContent);
        } else {
          el.remove();
        }
      }
      return;
    }
    
    // Handle refresh meta tags
    if (httpEquiv && httpEquiv.toLowerCase() === "refresh") {
      if (content) {
        const match = content.match(/(\d+)\s*;\s*url\s*=\s*['"]?([^'">\s]+)/i);
        if (match) {
          const delay = match[1];
          const url = match[2];
          el.setAttribute("content", `${delay};url=${rewriteUrl(url, this.base)}`);
        }
      }
          }
      }
  }
  
  // --------------------
  // Phase 4 Rewriters
  // --------------------
  class ScriptRewriter {
    constructor(base) { this.base = base; }
    element(el) {
      const src = el.getAttribute("src");
      if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    
    // Remove integrity checks as they'll fail with our modifications
    el.removeAttribute("integrity");
    el.removeAttribute("crossorigin");
    }
  }
  
  class FormRewriter {
    constructor(base) { this.base = base; }
    element(el) {
      const action = el.getAttribute("action") || "";
    el.setAttribute("action", rewriteUrl(action || this.base, this.base));
    }
  }
  
  // --------------------
  // Phase 4/5: Inline CSS rewriter
  // --------------------
  class StyleRewriter {
    constructor(base) { this.base = base; }
    element(el) {
    // Will be handled by text() method
  }
  text(text) {
    let content = text.text;
      if (!content) return;
    
    // Rewrite url() in CSS
    const base = this.base;
    content = content.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (path.startsWith('data:') || path.startsWith('blob:')) return m;
        const abs = new URL(path, base).toString();
        if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
        return `url("/?url=${encodeURIComponent(abs)}")`;
      } catch {
        return m;
      }
    });
    
    // Rewrite @import
    content = content.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
      try {
        const abs = new URL(path, base).toString();
        if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
        return `@import "${rewriteUrl(path, base)}"`;
      } catch {
        return m;
      }
    });
    
    text.replace(content);
  }
}

// --------------------
// Inline style attribute rewriter
// --------------------
class InlineStyleRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const style = el.getAttribute("style");
    if (!style) return;
    
    const base = this.base;
    const rewritten = style.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (path.startsWith('data:') || path.startsWith('blob:')) return m;
        const abs = new URL(path, base).toString();
          if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
        return `url("/?url=${encodeURIComponent(abs)}")`;
        } catch {
          return m;
        }
      });
    
    if (rewritten !== style) {
      el.setAttribute("style", rewritten);
    }
  }
}

// --------------------
// Object/Embed rewriter
// --------------------
class ObjectRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const data = el.getAttribute("data");
    if (data) el.setAttribute("data", rewriteUrl(data, this.base));
  }
}

class EmbedRewriter {
  constructor(base) { this.base = base; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base));
    }
  }
  
  // --------------------
// Phase 5/6: Dynamic JS navigation + Image fix + IFrame fix + Anti-iframe-buster
  // --------------------
  class InjectNavigationFix {
  constructor(targetUrl, isEmbedded = false) {
    this.targetUrl = targetUrl;
    this.isEmbedded = isEmbedded;
  }
    element(el) {
    const targetUrl = this.targetUrl;
    const isEmbedded = this.isEmbedded;
    el.prepend(`
  <script>
  (function(){
  // CRITICAL: Store original target URL for reference
  window.__PROXY_TARGET_URL__ = ${JSON.stringify(targetUrl)};
  window.__PROXY_BASE_ORIGIN__ = new URL(${JSON.stringify(targetUrl)}).origin;
  window.__PROXY_EMBEDDED__ = ${isEmbedded ? 'true' : 'false'};

  // Anti-iframe-buster: Override window.top and window.parent
  try {
    Object.defineProperty(window, 'top', {
      get: function() { return window; },
      configurable: false
    });
  } catch(e) {}
  
  try {
    Object.defineProperty(window, 'parent', {
      get: function() { return window; },
      configurable: false
    });
  } catch(e) {}
  
  try {
    Object.defineProperty(window, 'frameElement', {
      get: function() { return null; },
      configurable: false
    });
  } catch(e) {}

  // Override self comparison
  try {
    Object.defineProperty(window, 'self', {
      get: function() { return window.top; },
      configurable: false
    });
  } catch(e) {}

    function proxify(url){
    try {
      if (!url || url === '#') return url;
      if (typeof url !== 'string') url = String(url);
      if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('blob:')) return url;
      if (url.startsWith("/?url=") || url.startsWith("/?embedded=")) return url;
      
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        url = 'https:' + url;
      }
      
      // Build proxy URL with embedded parameter if needed
      const prefix = window.__PROXY_EMBEDDED__ ? "/?embedded=1&url=" : "/?url=";
      
      // Handle absolute URLs
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return prefix + encodeURIComponent(url);
      }
      
      // Handle relative URLs - resolve against original target
      try {
        const resolved = new URL(url, window.__PROXY_TARGET_URL__).href;
        return prefix + encodeURIComponent(resolved);
      } catch(e) {
        // Fallback to location-based resolution
        const params = new URLSearchParams(window.location.search);
        const currentTarget = params.get('url');
        if (currentTarget) {
          const resolved = new URL(url, currentTarget).href;
          return prefix + encodeURIComponent(resolved);
        }
      }
      
        return url;
    } catch(e) { return url; }
  }
  
  // Get actual URL from proxy URL
  function getActualUrl(proxyUrl) {
    try {
      if (!proxyUrl) return proxyUrl;
      const url = new URL(proxyUrl, location.href);
      const target = url.searchParams.get('url');
      return target || proxyUrl;
    } catch(e) {
      return proxyUrl;
    }
  }
  
  // Expose for external use
  window.__proxyProxify__ = proxify;
  window.__proxyGetActualUrl__ = getActualUrl;

  // Override location methods
  const _locationHref = Object.getOwnPropertyDescriptor(window.location, 'href');
    const _assign = location.assign.bind(location);
    const _replace = location.replace.bind(location);
  
  location.assign = function(url) {
    return _assign(proxify(url));
  };
  
  location.replace = function(url) {
    return _replace(proxify(url));
  };
  
  try {
    Object.defineProperty(location, "href", {
      set: function(url) {
        _assign(proxify(url));
      },
      get: function() {
        return _locationHref ? _locationHref.get.call(location) : window.location.toString();
      }
    });
  } catch(e) {}

  // Override history methods
  const _pushState = history.pushState.bind(history);
    const _replaceState = history.replaceState.bind(history);
  
  history.pushState = function(state, title, url) {
    if (url) url = proxify(url);
    return _pushState(state, title, url);
  };
  
  history.replaceState = function(state, title, url) {
    if (url) url = proxify(url);
    return _replaceState(state, title, url);
  };

  // Override window.open - communicate with parent frame for tabbed browsing
    const _open = window.open.bind(window);
  window.open = function(url, name, specs) {
    if (!url || url === 'about:blank') {
      return _open(url, name, specs);
    }
    
    try {
      // Resolve the URL
      let resolvedUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        resolvedUrl = new URL(url, window.__PROXY_TARGET_URL__).href;
      }
      
      // Try to communicate with parent iframe container
      const realParent = window.parent;
      if (realParent && realParent !== window) {
        try {
          realParent.postMessage({
            type: 'PROXY_NEW_TAB',
            url: resolvedUrl
            }, '*');
            
          // Return a mock window object
            return {
              closed: false,
            location: { href: resolvedUrl },
            close: function() { this.closed = true; },
              focus: function() {},
            blur: function() {},
            postMessage: function() {}
            };
        } catch(e) {}
      }
      
      // Fallback: open in proxy
      return _open(proxify(url), name, specs);
    } catch(e) {
      return _open(proxify(url), name, specs);
    }
    };
  
    // Override window.close
  const _close = window.close ? window.close.bind(window) : function(){};
    window.close = function() {
    try {
      const realParent = window.parent;
      if (realParent && realParent !== window) {
        realParent.postMessage({ type: 'PROXY_CLOSE_TAB' }, '*');
          return;
      }
    } catch(e) {}
      return _close();
    };
  
    // Intercept dynamic images
    const _Image = window.Image;
  window.Image = function(w, h) {
    const img = new _Image(w, h);
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc) {
      Object.defineProperty(img, 'src', {
        set: function(val) {
          desc.set.call(this, proxify(val));
        },
        get: function() {
          return desc.get.call(this);
        }
      });
    }
      return img;
    };
  
  // Intercept createElement
    const _createElement = document.createElement.bind(document);
  document.createElement = function(tag) {
      const el = _createElement(tag);
    const tagLower = tag.toLowerCase();
    
    if (tagLower === 'img' || tagLower === 'script' || tagLower === 'iframe' || 
        tagLower === 'video' || tagLower === 'audio' || tagLower === 'source' ||
        tagLower === 'embed' || tagLower === 'object') {
      
        const _setAttribute = el.setAttribute.bind(el);
      el.setAttribute = function(name, value) {
        if ((name === 'src' || name === 'href' || name === 'data') && value) {
          value = proxify(value);
          }
          return _setAttribute(name, value);
        };
        
      // Override src property for appropriate elements
      if (tagLower === 'img' || tagLower === 'script' || tagLower === 'iframe' || 
          tagLower === 'video' || tagLower === 'audio' || tagLower === 'source' || tagLower === 'embed') {
        try {
          const proto = el.constructor.prototype;
          const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
          if (srcDesc) {
        Object.defineProperty(el, 'src', {
          set: function(value) {
                srcDesc.set.call(this, proxify(value));
          },
          get: function() {
                return srcDesc.get.call(this);
              }
            });
          }
        } catch(e) {}
      }
    }
    
    if (tagLower === 'a') {
      const _setAttribute = el.setAttribute.bind(el);
      el.setAttribute = function(name, value) {
        if (name === 'href' && value) {
          value = proxify(value);
        }
        return _setAttribute(name, value);
      };
      
      try {
        const hrefDesc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'href');
        if (hrefDesc) {
          Object.defineProperty(el, 'href', {
            set: function(value) {
              hrefDesc.set.call(this, proxify(value));
            },
            get: function() {
              return hrefDesc.get.call(this);
            }
          });
        }
      } catch(e) {}
    }
    
    return el;
  };

  // Intercept fetch
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = proxify(input);
    } else if (input instanceof Request) {
      input = new Request(proxify(input.url), input);
    }
    return _fetch(input, init);
  };

  // Intercept XMLHttpRequest
  const _XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    return _XHROpen.call(this, method, proxify(url), async !== false, user, password);
  };

  // Handle clicks on links with target="_blank"
    document.addEventListener('click', function(e) {
      let target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }
      
      if (target && target.tagName === 'A') {
        const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target') || target.getAttribute('data-proxy-target');
        
      if (href && (targetAttr === '_blank' || targetAttr === '_new')) {
          e.preventDefault();
          e.stopPropagation();
          
        let resolvedUrl = href;
        if (!href.startsWith('http://') && !href.startsWith('https://')) {
          try {
            resolvedUrl = new URL(href, window.__PROXY_TARGET_URL__).href;
          } catch(e) {}
        }
        
        try {
          const realParent = window.parent;
          if (realParent && realParent !== window) {
            realParent.postMessage({
              type: 'PROXY_NEW_TAB',
              url: resolvedUrl
              }, '*');
            return;
          }
        } catch(e) {}
        
        // Fallback: navigate in current tab
        window.location.href = proxify(href);
        }
      }
    }, true);
  
  // Listen for messages from parent (for tab management)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'PROXY_GET_URL') {
      const actualUrl = getActualUrl(window.location.href);
      e.source.postMessage({
        type: 'PROXY_URL_RESPONSE',
        url: actualUrl,
        title: document.title
      }, '*');
    }
  });

  // Notify parent of URL changes and title updates
  function notifyParent() {
    try {
      const realParent = window.parent;
      if (realParent && realParent !== window) {
        const actualUrl = getActualUrl(window.location.href);
        realParent.postMessage({
          type: 'PROXY_URL_CHANGED',
          url: actualUrl,
                title: document.title,
          proxyUrl: window.location.href
              }, '*');
            }
    } catch(e) {}
  }

  // Watch for title changes
  const titleObserver = new MutationObserver(notifyParent);
  const observeTitle = function() {
    const titleEl = document.querySelector('title');
    if (titleEl) {
      titleObserver.observe(titleEl, { subtree: true, characterData: true, childList: true });
    }
  };
  
  // Initial notification
  if (document.readyState === 'complete') {
    notifyParent();
    observeTitle();
  } else {
    window.addEventListener('load', function() {
      notifyParent();
      observeTitle();
    });
  }

  // Watch for popstate (back/forward navigation)
  window.addEventListener('popstate', notifyParent);

})();
</script>
`, { html: true });
  }
}

// --------------------
// Inject toolbar for proxy controls
// --------------------
class InjectToolbar {
  constructor(targetUrl) {
    this.targetUrl = targetUrl;
  }
  element(el) {
    const targetUrl = this.targetUrl;
    el.prepend(`
<div id="__proxy_toolbar__" style="
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-bottom: 2px solid #0f3460;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  z-index: 2147483647;
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
">
  <div style="
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e94560;
    font-weight: 600;
    font-size: 14px;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      <path d="M2 12h20"/>
    </svg>
    PROXY
  </div>
  
  <input type="text" id="__proxy_url_input__" value="${targetUrl.replace(/"/g, '&quot;')}" style="
    flex: 1;
    height: 28px;
    background: rgba(255,255,255,0.1);
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 0 12px;
    color: #eee;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s, background 0.2s;
  " onfocus="this.style.borderColor='#e94560';this.style.background='rgba(255,255,255,0.15)';" onblur="this.style.borderColor='#0f3460';this.style.background='rgba(255,255,255,0.1)';">
  
  <button onclick="(function(){
    var url = document.getElementById('__proxy_url_input__').value.trim();
    if(!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    window.location.href = '/?url=' + encodeURIComponent(url);
  })()" style="
    height: 28px;
    padding: 0 16px;
    background: linear-gradient(135deg, #e94560 0%, #c23a51 100%);
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.2s;
  " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 2px 8px rgba(233,69,96,0.4)';" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none';">Go</button>
  
  <button onclick="(function(){
    var url = document.getElementById('__proxy_url_input__').value.trim();
    if(!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    window.open('https://proxy.ikunbeautiful.workers.dev/?url=' + encodeURIComponent(url), '_blank');
  })()" style="
    height: 28px;
    padding: 0 16px;
    background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%);
    border: none;
    border-radius: 6px;
    color: #1a1a2e;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.2s;
  " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 2px 8px rgba(0,217,255,0.4)';" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none';">Open</button>
  
  <button onclick="(function(){
    var url = document.getElementById('__proxy_url_input__').value.trim();
    var title = document.title || url;
    var bookmarks = JSON.parse(localStorage.getItem('__proxy_bookmarks__') || '[]');
    if(!bookmarks.find(function(b){ return b.url === url; })) {
      bookmarks.push({url: url, title: title, date: Date.now()});
      localStorage.setItem('__proxy_bookmarks__', JSON.stringify(bookmarks));
      alert('Bookmarked: ' + title);
    } else {
      alert('Already bookmarked!');
    }
  })()" style="
    height: 28px;
    padding: 0 16px;
    background: linear-gradient(135deg, #ffc107 0%, #e6a800 100%);
    border: none;
    border-radius: 6px;
    color: #1a1a2e;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.2s;
  " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 2px 8px rgba(255,193,7,0.4)';" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none';">⭐ Bookmark</button>
  
  <button id="__proxy_hide_bar__" onclick="(function(){
    var bar = document.getElementById('__proxy_toolbar__');
    var show = document.getElementById('__proxy_show_bar__');
    bar.style.display = 'none';
    show.style.display = 'flex';
    document.body.style.paddingTop = '0';
  })()" style="
    height: 28px;
    width: 28px;
    padding: 0;
    background: rgba(255,255,255,0.1);
    border: 1px solid #0f3460;
    border-radius: 6px;
    color: #aaa;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  " onmouseover="this.style.background='rgba(255,255,255,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.1)';">×</button>
</div>

<button id="__proxy_show_bar__" onclick="(function(){
  var bar = document.getElementById('__proxy_toolbar__');
  var show = document.getElementById('__proxy_show_bar__');
  bar.style.display = 'flex';
  show.style.display = 'none';
  document.body.style.paddingTop = '44px';
})()" style="
  display: none;
  position: fixed;
  top: 8px;
  right: 8px;
  height: 32px;
  padding: 0 12px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #0f3460;
  border-radius: 8px;
  color: #e94560;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  z-index: 2147483647;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    <path d="M2 12h20"/>
  </svg>
  Show Proxy Bar
</button>

<style>
  body { padding-top: 44px !important; }
  #__proxy_url_input__::placeholder { color: #666; }
</style>
`, { html: true });
  }
}

// --------------------
// CSS Rewriter for external stylesheets
// --------------------
function rewriteCSS(css, base) {
  // Rewrite url()
  css = css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
    try {
      if (path.startsWith('data:') || path.startsWith('blob:')) return m;
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `url("/?url=${encodeURIComponent(abs)}")`;
    } catch {
      return m;
    }
  });
  
  // Rewrite @import
  css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
    try {
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `@import "/?url=${encodeURIComponent(abs)}"`;
    } catch {
      return m;
    }
  });
  
  css = css.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
    try {
      if (path.startsWith('data:')) return m;
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `@import url("/?url=${encodeURIComponent(abs)}")`;
    } catch {
      return m;
    }
  });
  
  return css;
}

// --------------------
// Remove headers that block iframing
// --------------------
function sanitizeHeaders(headers) {
  const newHeaders = new Headers();
  
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    
    // Skip headers that prevent iframing
    if (lowerKey === 'x-frame-options') continue;
    if (lowerKey === 'content-security-policy') {
      // Remove frame-ancestors and frame-src directives
      let newValue = value
        .replace(/frame-ancestors[^;]*(;|$)/gi, '')
        .replace(/frame-src[^;]*(;|$)/gi, '')
        .trim();
      if (newValue && !newValue.endsWith(';')) newValue += ';';
      if (newValue && newValue !== ';') {
        newHeaders.set(key, newValue);
      }
      continue;
    }
    if (lowerKey === 'content-security-policy-report-only') continue;
    if (lowerKey === 'x-content-type-options') continue;
    
    newHeaders.set(key, value);
  }
  
  // Add permissive headers
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', '*');
  
  return newHeaders;
  }
  
  // --------------------
  // Main Worker
  // --------------------
  export default {
    async fetch(request) {
      const url = new URL(request.url);
      const target = url.searchParams.get("url");
    const isEmbedded = url.searchParams.get("embedded") === "1";

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
  
      if (!target) return new Response("Missing ?url=", { status: 400 });
      if (!target.startsWith("http://") && !target.startsWith("https://"))
        return new Response("Invalid URL", { status: 400 });
  
      try {
      // Clone headers from original request, but modify them
      const requestHeaders = new Headers();
      requestHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      requestHeaders.set("Accept", request.headers.get("Accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8");
      requestHeaders.set("Accept-Language", "en-US,en;q=0.5");
      requestHeaders.set("Accept-Encoding", "gzip, deflate, br");
      requestHeaders.set("DNT", "1");
      requestHeaders.set("Connection", "keep-alive");
      requestHeaders.set("Upgrade-Insecure-Requests", "1");
      requestHeaders.set("Sec-Fetch-Dest", "document");
      requestHeaders.set("Sec-Fetch-Mode", "navigate");
      requestHeaders.set("Sec-Fetch-Site", "cross-site");
      
      // Forward cookies if present
      const cookie = request.headers.get("Cookie");
      if (cookie) {
        requestHeaders.set("Cookie", cookie);
      }

      // Prepare fetch options
      const fetchOptions = {
        method: request.method,
        headers: requestHeaders,
        redirect: 'manual'  // Handle redirects manually
      };

      // Forward body for POST/PUT requests
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        fetchOptions.body = request.body;
        const contentType = request.headers.get('Content-Type');
        if (contentType) {
          requestHeaders.set('Content-Type', contentType);
        }
      }

      let resp = await fetch(target, fetchOptions);

      // Handle redirects manually to rewrite the Location header
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('Location');
        if (location) {
          // Resolve the redirect URL against the current target
          const resolvedLocation = new URL(location, target).toString();
          // Preserve embedded parameter in redirects
          const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
          const proxiedLocation = prefix + encodeURIComponent(resolvedLocation);
          
          return new Response(null, {
            status: resp.status,
          headers: { 
              'Location': proxiedLocation,
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }
  
        const contentType = resp.headers.get("content-type") || "";
      const sanitizedHeaders = sanitizeHeaders(resp.headers);
  
      // Handle HTML content
        if (contentType.includes("text/html")) {
        let rewriter = new HTMLRewriter()
          // Anti-iframe busters
          .on("base", new BaseRewriter(target))
          .on("meta", new MetaRewriter(target))
          // Links and anchors
            .on("a", new AnchorRewriter(target))
            // Favicon handlers
            .on("link[rel='icon']", new FaviconRewriter(target))
            .on("link[rel='shortcut icon']", new FaviconRewriter(target))
            .on("link[rel='apple-touch-icon']", new FaviconRewriter(target))
            .on("link[rel='mask-icon']", new FaviconRewriter(target))
            .on("link[rel*='icon']", new FaviconRewriter(target))
            // IFrame handler
            .on("iframe", new IFrameRewriter(target))
            // General link handler
            .on("link", new LinkRewriter(target))
          // Media elements
            .on("img", new ImageRewriter(target))
          .on("video", new VideoRewriter(target))
          .on("audio", new AudioRewriter(target))
          .on("source", new SourceRewriter(target))
          // Scripts
            .on("script", new ScriptRewriter(target))
          // Forms
            .on("form", new FormRewriter(target))
          // Styles
            .on("style", new StyleRewriter(target))
          // Inline styles on any element
          .on("[style]", new InlineStyleRewriter(target))
          // Objects and embeds
          .on("object", new ObjectRewriter(target))
          .on("embed", new EmbedRewriter(target))
          // Inject our scripts
          .on("head", new InjectNavigationFix(target, isEmbedded));
        
        // Only inject toolbar when not embedded in iframe
        if (!isEmbedded) {
          rewriter = rewriter.on("body", new InjectToolbar(target));
        }
        
        return rewriter.transform(new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        }));
      }

      // Handle CSS content
      if (contentType.includes("text/css")) {
        const css = await resp.text();
        const rewrittenCSS = rewriteCSS(css, target);
        return new Response(rewrittenCSS, {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        });
      }

      // Handle JavaScript - may contain URLs
      if (contentType.includes("javascript") || contentType.includes("application/json")) {
        // For now, just pass through with sanitized headers
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        });
      }

      // Non-HTML (images, etc.) → return directly with sanitized headers
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: sanitizedHeaders
      });
  
      } catch (e) {
        return new Response("Fetch failed: " + e.message, { status: 500 });
      }
    }
  };
