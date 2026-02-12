// --------------------
// URL Rewriting - MAX FIX
// --------------------
function rewriteUrl(original, base, isEmbedded = false) {
  try {
    if (!original) return original;
    original = original.trim();
    
    // Skip special URLs
    if (original === '#' || original === '' || 
        original.startsWith('javascript:') || 
        original.startsWith('data:') || 
        original.startsWith('blob:') ||
        original.startsWith('mailto:') ||
        original.startsWith('tel:') ||
        original.startsWith('about:')) {
      return original;
    }
    
    // Already proxied
    if (original.startsWith('/?url=') || original.startsWith('/?embedded=')) {
      return original;
    }
    
    // Handle protocol-relative URLs
    if (original.startsWith('//')) {
      original = 'https:' + original;
    }
    
    // Resolve the URL against base
      const abs = new URL(original, base).toString();
  
    // Do NOT proxy your own Worker assets
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return original;
  
    // Build proxied URL
    const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
    return prefix + encodeURIComponent(abs);
    } catch {
      return original;
    }
  }
  
  // --------------------
  // Phase 3 Rewriters
  // --------------------
  class AnchorRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
      const href = el.getAttribute("href");
    if (href) el.setAttribute("href", rewriteUrl(href, this.base, this.isEmbedded));
    
    // Rewrite target="_blank" to work in proxy
    const target = el.getAttribute("target");
    if (target === "_blank" || target === "_new") {
      el.removeAttribute("target");
      el.setAttribute("data-proxy-target", target);
    }
    }
  }
  
  class LinkRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
      const href = el.getAttribute("href");
    if (href) el.setAttribute("href", rewriteUrl(href, this.base, this.isEmbedded));
    }
  }
  
  class ImageRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts[0]) parts[0] = rewriteUrl(parts[0], this.base, this.isEmbedded);
        return parts.join(' ');
      }).join(', ');
      el.setAttribute("srcset", rewritten);
    }
    // Handle data-src for lazy loading
    const dataSrc = el.getAttribute("data-src");
    if (dataSrc) el.setAttribute("data-src", rewriteUrl(dataSrc, this.base, this.isEmbedded));
  }
}

// --------------------
// Source/Video/Audio Rewriter
// --------------------
class SourceRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
      const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      const rewritten = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        if (parts[0]) parts[0] = rewriteUrl(parts[0], this.base, this.isEmbedded);
        return parts.join(' ');
      }).join(', ');
      el.setAttribute("srcset", rewritten);
    }
  }
}

class VideoRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
    const poster = el.getAttribute("poster");
    if (poster) el.setAttribute("poster", rewriteUrl(poster, this.base, this.isEmbedded));
  }
}

class AudioRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
    }
  }
  
  // --------------------
  // Favicon Handler
  // --------------------
  class FaviconRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
      element(el) {
          const href = el.getAttribute("href");
    if (href) {
      el.setAttribute("href", rewriteUrl(href, this.base, this.isEmbedded));
          }
      }
  }
  
  // --------------------
  // IFrame Handler
  // --------------------
  class IFrameRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
      element(el) {
          const src = el.getAttribute("src");
          if (src) {
      el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
          }
          
    // Handle srcdoc
          const srcdoc = el.getAttribute("srcdoc");
          if (srcdoc) {
      const base = this.base;
      const isEmbedded = this.isEmbedded;
              const rewrittenSrcdoc = srcdoc
        .replace(/src\s*=\s*["']([^"']+)["']/gi, (match, src) => {
          return `src="${rewriteUrl(src, base, isEmbedded)}"`;
        })
        .replace(/href\s*=\s*["']([^"']+)["']/gi, (match, href) => {
          return `href="${rewriteUrl(href, base, isEmbedded)}"`;
                  });
              el.setAttribute("srcdoc", rewrittenSrcdoc);
          }
      }
  }
  
  // --------------------
// Base tag handler - inject our own base for proper resolution
  // --------------------
class BaseRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
    // Remove the original base tag
    el.remove();
  }
}

// --------------------
// Meta tag handler - remove iframe busters
// --------------------
class MetaRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
    const httpEquiv = el.getAttribute("http-equiv");
    const content = el.getAttribute("content");
    
    if (httpEquiv && httpEquiv.toLowerCase() === "x-frame-options") {
      el.remove();
      return;
    }
    
    if (httpEquiv && httpEquiv.toLowerCase() === "content-security-policy") {
      if (content) {
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
          el.setAttribute("content", `${delay};url=${rewriteUrl(url, this.base, this.isEmbedded)}`);
        }
      }
    }
  }
}

// --------------------
// Script Rewriter
// --------------------
class ScriptRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
    
    // Remove integrity checks
    el.removeAttribute("integrity");
    el.removeAttribute("crossorigin");
  }
}

// --------------------
// Form Rewriter
// --------------------
class FormRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const action = el.getAttribute("action");
    // If no action, forms submit to current page - need to handle this
    const resolvedAction = action || this.base;
    el.setAttribute("action", rewriteUrl(resolvedAction, this.base, this.isEmbedded));
    }
  }
  
  // --------------------
// Style Rewriter (inline <style> tags)
  // --------------------
  class StyleRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {}
  text(text) {
    let content = text.text;
    if (!content) return;
    
    const base = this.base;
    const isEmbedded = this.isEmbedded;
    
    // Rewrite url() in CSS
    content = content.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (path.startsWith('data:') || path.startsWith('blob:')) return m;
        const abs = new URL(path, base).toString();
        if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
        const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
        return `url("${prefix}${encodeURIComponent(abs)}")`;
      } catch {
        return m;
      }
    });
    
    // Rewrite @import
    content = content.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
      try {
        return `@import "${rewriteUrl(path, base, isEmbedded)}"`;
      } catch {
        return m;
      }
    });
    
    content = content.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (path.startsWith('data:')) return m;
        return `@import url("${rewriteUrl(path, base, isEmbedded)}")`;
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
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
    element(el) {
    const style = el.getAttribute("style");
    if (!style) return;
    
    const base = this.base;
    const isEmbedded = this.isEmbedded;
    const rewritten = style.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (path.startsWith('data:') || path.startsWith('blob:')) return m;
        const abs = new URL(path, base).toString();
          if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
        const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
        return `url("${prefix}${encodeURIComponent(abs)}")`;
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
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const data = el.getAttribute("data");
    if (data) el.setAttribute("data", rewriteUrl(data, this.base, this.isEmbedded));
  }
}

class EmbedRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", rewriteUrl(src, this.base, this.isEmbedded));
  }
}

// --------------------
// Any element with src, href, action, data, poster attributes
// --------------------
class GenericUrlRewriter {
  constructor(base, isEmbedded) { this.base = base; this.isEmbedded = isEmbedded; }
  element(el) {
    const attrs = ['src', 'href', 'action', 'data', 'poster', 'data-src', 'data-href'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val && !val.startsWith('javascript:') && !val.startsWith('data:') && !val.startsWith('#')) {
        el.setAttribute(attr, rewriteUrl(val, this.base, this.isEmbedded));
      }
    }
    }
  }
  
  // --------------------
// MAX FIX: Comprehensive JavaScript injection
  // --------------------
  class InjectNavigationFix {
  constructor(targetUrl, isEmbedded = false) {
    this.targetUrl = targetUrl;
    this.isEmbedded = isEmbedded;
  }
    element(el) {
    const targetUrl = this.targetUrl;
    const isEmbedded = this.isEmbedded;
    
    // Get the origin from target URL for proper base resolution
    let targetOrigin = '';
    try {
      targetOrigin = new URL(targetUrl).origin;
    } catch(e) {}
    
    el.prepend(`
  <script>
  (function(){
  'use strict';
  
  // ========== CORE CONFIG ==========
  window.__PROXY_TARGET_URL__ = ${JSON.stringify(targetUrl)};
  window.__PROXY_BASE_ORIGIN__ = ${JSON.stringify(targetOrigin)};
  window.__PROXY_EMBEDDED__ = ${isEmbedded ? 'true' : 'false'};
  
  // Get current target from URL params (for navigation tracking)
  function getCurrentTarget() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('url') || window.__PROXY_TARGET_URL__;
    } catch(e) {
      return window.__PROXY_TARGET_URL__;
    }
  }
  
  // ========== URL PROXIFICATION ==========
  function proxify(url) {
    try {
      if (!url) return url;
      if (typeof url !== 'string') url = String(url);
      url = url.trim();
      
      // Skip special URLs
      if (url === '#' || url === '' ||
          url.startsWith('javascript:') || 
          url.startsWith('data:') || 
          url.startsWith('blob:') ||
          url.startsWith('mailto:') ||
          url.startsWith('tel:') ||
          url.startsWith('about:')) {
        return url;
      }
      
      // Already proxied
      if (url.startsWith('/?url=') || url.startsWith('/?embedded=')) {
        return url;
      }
      
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        url = 'https:' + url;
      }
      
      const prefix = window.__PROXY_EMBEDDED__ ? '/?embedded=1&url=' : '/?url=';
      
      // Handle absolute URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return prefix + encodeURIComponent(url);
      }
      
      // Handle relative URLs - resolve against CURRENT target
      const currentBase = getCurrentTarget();
      try {
        const resolved = new URL(url, currentBase).href;
        return prefix + encodeURIComponent(resolved);
      } catch(e) {
        // Last fallback - use stored target
        try {
          const resolved = new URL(url, window.__PROXY_TARGET_URL__).href;
          return prefix + encodeURIComponent(resolved);
        } catch(e2) {
          return url;
        }
      }
    } catch(e) {
      return url;
    }
  }
  
  // Resolve URL to absolute without proxifying
  function resolveUrl(url) {
    try {
      if (!url) return url;
      if (typeof url !== 'string') url = String(url);
      url = url.trim();
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      if (url.startsWith('//')) {
        return 'https:' + url;
      }
      
      const currentBase = getCurrentTarget();
      return new URL(url, currentBase).href;
    } catch(e) {
      return url;
    }
  }
  
  // Expose globally
  window.__proxyProxify__ = proxify;
  window.__proxyResolveUrl__ = resolveUrl;
  
  // ========== ANTI-IFRAME-BUSTER ==========
  try {
    Object.defineProperty(window, 'top', { get: () => window, configurable: false });
  } catch(e) {}
  try {
    Object.defineProperty(window, 'parent', { get: () => window, configurable: false });
  } catch(e) {}
  try {
    Object.defineProperty(window, 'frameElement', { get: () => null, configurable: false });
  } catch(e) {}
  try {
    Object.defineProperty(window, 'self', { get: () => window, configurable: false });
  } catch(e) {}
  
  // ========== LOCATION OVERRIDES ==========
    const _assign = location.assign.bind(location);
    const _replace = location.replace.bind(location);
  
  location.assign = function(url) { return _assign(proxify(url)); };
  location.replace = function(url) { return _replace(proxify(url)); };
  
  try {
    const locDesc = Object.getOwnPropertyDescriptor(window, 'location') || 
                    Object.getOwnPropertyDescriptor(Window.prototype, 'location');
    if (locDesc && locDesc.set) {
      const _setLoc = locDesc.set.bind(window);
      Object.defineProperty(window, 'location', {
        get: locDesc.get ? locDesc.get.bind(window) : () => location,
        set: function(url) { _assign(proxify(url)); },
        configurable: true
      });
    }
  } catch(e) {}
  
  try {
    Object.defineProperty(location, 'href', {
      set: function(url) { _assign(proxify(url)); },
      get: function() { return window.location.toString(); },
      configurable: true
    });
  } catch(e) {}
  
  // ========== HISTORY OVERRIDES ==========
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
  
  // ========== WINDOW.OPEN OVERRIDE ==========
    const _open = window.open.bind(window);
  window.open = function(url, name, specs) {
    if (!url || url === 'about:blank') {
      return _open(url, name, specs);
    }
    
    try {
      const resolvedUrl = resolveUrl(url);
      
      // Communicate with parent for tabbed browsing
      if (window.__PROXY_EMBEDDED__) {
        try {
          const realParent = Object.getPrototypeOf(window).parent;
          if (realParent && realParent !== window) {
            realParent.postMessage({ type: 'PROXY_NEW_TAB', url: resolvedUrl }, '*');
            return { closed: false, close: function() { this.closed = true; }, focus: function() {}, blur: function() {} };
          }
        } catch(e) {}
      }
      
      return _open(proxify(url), name, specs);
    } catch(e) {
      return _open(proxify(url), name, specs);
    }
    };
  
  // ========== WINDOW.CLOSE OVERRIDE ==========
  const _close = window.close ? window.close.bind(window) : function(){};
    window.close = function() {
    if (window.__PROXY_EMBEDDED__) {
      try {
        const realParent = Object.getPrototypeOf(window).parent;
        if (realParent && realParent !== window) {
          realParent.postMessage({ type: 'PROXY_CLOSE_TAB' }, '*');
          return;
        }
      } catch(e) {}
      }
      return _close();
    };
  
  // ========== ELEMENT.PROTOTYPE OVERRIDES (MAX FIX) ==========
  
  // Override setAttribute globally
  const _setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    const lowerName = name.toLowerCase();
    if ((lowerName === 'src' || lowerName === 'href' || lowerName === 'action' || 
         lowerName === 'data' || lowerName === 'poster' || lowerName === 'srcset') && value) {
      if (lowerName === 'srcset') {
        value = value.split(',').map(s => {
          const parts = s.trim().split(/\\s+/);
          if (parts[0]) parts[0] = proxify(parts[0]);
          return parts.join(' ');
        }).join(', ');
      } else {
        value = proxify(value);
      }
    }
    return _setAttribute.call(this, name, value);
  };
  
  // Override src property on relevant prototypes
  const srcElements = [
    HTMLImageElement, HTMLScriptElement, HTMLIFrameElement,
    HTMLVideoElement, HTMLAudioElement, HTMLSourceElement,
    HTMLEmbedElement, HTMLTrackElement
  ];
  
  srcElements.forEach(function(ElementClass) {
    if (!ElementClass || !ElementClass.prototype) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(ElementClass.prototype, 'src');
      if (desc && desc.set) {
        const _set = desc.set;
        Object.defineProperty(ElementClass.prototype, 'src', {
          set: function(val) { _set.call(this, proxify(val)); },
          get: desc.get,
          configurable: true
        });
      }
    } catch(e) {}
  });
  
  // Override href on HTMLAnchorElement and HTMLLinkElement
  [HTMLAnchorElement, HTMLLinkElement, HTMLAreaElement].forEach(function(ElementClass) {
    if (!ElementClass || !ElementClass.prototype) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(ElementClass.prototype, 'href');
      if (desc && desc.set) {
        const _set = desc.set;
        Object.defineProperty(ElementClass.prototype, 'href', {
          set: function(val) { _set.call(this, proxify(val)); },
          get: desc.get,
          configurable: true
        });
      }
    } catch(e) {}
  });
  
  // Override action on HTMLFormElement
  try {
    const formDesc = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
    if (formDesc && formDesc.set) {
      const _setAction = formDesc.set;
      Object.defineProperty(HTMLFormElement.prototype, 'action', {
        set: function(val) { _setAction.call(this, proxify(val)); },
        get: formDesc.get,
        configurable: true
      });
    }
  } catch(e) {}
  
  // Override data on HTMLObjectElement
  try {
    const objDesc = Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype, 'data');
    if (objDesc && objDesc.set) {
      const _setData = objDesc.set;
      Object.defineProperty(HTMLObjectElement.prototype, 'data', {
        set: function(val) { _setData.call(this, proxify(val)); },
        get: objDesc.get,
        configurable: true
      });
    }
  } catch(e) {}
  
  // Override poster on HTMLVideoElement
  try {
    const posterDesc = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'poster');
    if (posterDesc && posterDesc.set) {
      const _setPoster = posterDesc.set;
      Object.defineProperty(HTMLVideoElement.prototype, 'poster', {
        set: function(val) { _setPoster.call(this, proxify(val)); },
        get: posterDesc.get,
        configurable: true
      });
    }
  } catch(e) {}
  
  // ========== IMAGE CONSTRUCTOR OVERRIDE ==========
  const _Image = window.Image;
  window.Image = function(w, h) {
    const img = new _Image(w, h);
    return img; // src is already overridden on prototype
  };
  window.Image.prototype = _Image.prototype;
  
  // ========== FETCH OVERRIDE ==========
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = proxify(input);
    } else if (input instanceof Request) {
      input = new Request(proxify(input.url), input);
    } else if (input && input.url) {
      input = new Request(proxify(input.url), input);
    }
    return _fetch(input, init);
  };
  
  // ========== XMLHTTPREQUEST OVERRIDE ==========
  const _XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    return _XHROpen.call(this, method, proxify(url), async !== false, user, password);
  };
  
  // ========== WEBSOCKET OVERRIDE ==========
  const _WebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    // WebSockets can't be proxied through HTTP, but log for debugging
    console.log('[Proxy] WebSocket connection attempted:', url);
    return new _WebSocket(url, protocols);
  };
  window.WebSocket.prototype = _WebSocket.prototype;
  window.WebSocket.CONNECTING = _WebSocket.CONNECTING;
  window.WebSocket.OPEN = _WebSocket.OPEN;
  window.WebSocket.CLOSING = _WebSocket.CLOSING;
  window.WebSocket.CLOSED = _WebSocket.CLOSED;
  
  // ========== WORKER OVERRIDE ==========
  if (window.Worker) {
    const _Worker = window.Worker;
    window.Worker = function(url, options) {
      return new _Worker(proxify(url), options);
    };
    window.Worker.prototype = _Worker.prototype;
  }
  
  if (window.SharedWorker) {
    const _SharedWorker = window.SharedWorker;
    window.SharedWorker = function(url, options) {
      return new _SharedWorker(proxify(url), options);
    };
    window.SharedWorker.prototype = _SharedWorker.prototype;
  }
  
  // ========== BEACON API OVERRIDE ==========
  if (navigator.sendBeacon) {
    const _sendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      return _sendBeacon(proxify(url), data);
    };
  }
  
  // ========== EVENT SOURCE OVERRIDE ==========
  if (window.EventSource) {
    const _EventSource = window.EventSource;
    window.EventSource = function(url, config) {
      return new _EventSource(proxify(url), config);
    };
    window.EventSource.prototype = _EventSource.prototype;
  }
  
  // ========== DOCUMENT.WRITE HANDLING ==========
  const _docWrite = document.write.bind(document);
  const _docWriteln = document.writeln.bind(document);
  
  function rewriteHtmlUrls(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Rewrite src attributes
    html = html.replace(/(<[^>]+\\s)(src\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, quote) {
      return pre + attr + proxify(url) + quote;
    });
    
    // Rewrite href attributes
    html = html.replace(/(<[^>]+\\s)(href\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, quote) {
      if (url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:')) return m;
      return pre + attr + proxify(url) + quote;
    });
    
    // Rewrite action attributes
    html = html.replace(/(<form[^>]+\\s)(action\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, quote) {
      return pre + attr + proxify(url) + quote;
    });
    
    return html;
  }
  
  document.write = function() {
    const args = Array.from(arguments).map(arg => rewriteHtmlUrls(arg));
    return _docWrite.apply(document, args);
  };
  
  document.writeln = function() {
    const args = Array.from(arguments).map(arg => rewriteHtmlUrls(arg));
    return _docWriteln.apply(document, args);
  };
  
  // ========== INNERHTML/OUTERHTML HANDLING ==========
  try {
    const innerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (innerDesc && innerDesc.set) {
      const _setInner = innerDesc.set;
      Object.defineProperty(Element.prototype, 'innerHTML', {
        set: function(val) { _setInner.call(this, rewriteHtmlUrls(val)); },
        get: innerDesc.get,
        configurable: true
      });
    }
  } catch(e) {}
  
  try {
    const outerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
    if (outerDesc && outerDesc.set) {
      const _setOuter = outerDesc.set;
      Object.defineProperty(Element.prototype, 'outerHTML', {
        set: function(val) { _setOuter.call(this, rewriteHtmlUrls(val)); },
        get: outerDesc.get,
        configurable: true
      });
    }
  } catch(e) {}
  
  // ========== INSERTADJACENTHTML HANDLING ==========
  const _insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(position, html) {
    return _insertAdjacentHTML.call(this, position, rewriteHtmlUrls(html));
  };
  
  // ========== CLICK HANDLER FOR TARGET=_BLANK ==========
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
          
        const resolvedUrl = resolveUrl(href);
        
        if (window.__PROXY_EMBEDDED__) {
          try {
            const realParent = Object.getPrototypeOf(window).parent;
            if (realParent && realParent !== window) {
              realParent.postMessage({ type: 'PROXY_NEW_TAB', url: resolvedUrl }, '*');
              return;
            }
          } catch(e) {}
        }
        
        window.location.href = proxify(href);
      }
    }
  }, true);
  
  // ========== FORM SUBMIT HANDLING ==========
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form && form.tagName === 'FORM') {
      const action = form.getAttribute('action');
      if (action && !action.startsWith('/?url=') && !action.startsWith('/?embedded=')) {
        form.setAttribute('action', proxify(action || getCurrentTarget()));
      } else if (!action) {
        form.setAttribute('action', proxify(getCurrentTarget()));
        }
      }
    }, true);
  
  // ========== MESSAGE HANDLING ==========
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'PROXY_GET_URL') {
      const actualUrl = getCurrentTarget();
      e.source.postMessage({
        type: 'PROXY_URL_RESPONSE',
        url: actualUrl,
        title: document.title
      }, '*');
    }
  });
  
  // ========== NOTIFY PARENT OF CHANGES ==========
  function notifyParent() {
    if (!window.__PROXY_EMBEDDED__) return;
    try {
      const realParent = Object.getPrototypeOf(window).parent;
      if (realParent && realParent !== window) {
        realParent.postMessage({
          type: 'PROXY_URL_CHANGED',
          url: getCurrentTarget(),
                title: document.title,
          proxyUrl: window.location.href
              }, '*');
            }
    } catch(e) {}
  }
  
  // Watch for title changes
  const titleObserver = new MutationObserver(notifyParent);
  function observeTitle() {
    const titleEl = document.querySelector('title');
    if (titleEl) {
      titleObserver.observe(titleEl, { subtree: true, characterData: true, childList: true });
    }
  }
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    notifyParent();
    observeTitle();
  } else {
    window.addEventListener('DOMContentLoaded', function() {
      notifyParent();
      observeTitle();
    });
  }
  
  window.addEventListener('popstate', notifyParent);
  
  // ========== MUTATION OBSERVER FOR DYNAMIC CONTENT ==========
  const urlAttrs = ['src', 'href', 'action', 'data', 'poster'];
  const mutationObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes') {
        const attr = mutation.attributeName;
        if (urlAttrs.includes(attr)) {
          const el = mutation.target;
          const val = el.getAttribute(attr);
          if (val && !val.startsWith('/?url=') && !val.startsWith('/?embedded=') && 
              !val.startsWith('javascript:') && !val.startsWith('data:') && !val.startsWith('#')) {
            // Already handled by setAttribute override, but double-check
          }
        }
      }
    });
  });
  
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: urlAttrs,
    subtree: true
  });
  
})();
</script>
`, { html: true });
  }
}

// --------------------
// Inject toolbar for proxy controls (minimal - URL input only, Enter to Go)
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
  
  <input type="text" id="__proxy_url_input__" value="${targetUrl.replace(/"/g, '&quot;')}" placeholder="Enter URL and press Enter" style="
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
  " onfocus="this.style.borderColor='#e94560';this.style.background='rgba(255,255,255,0.15)';" onblur="this.style.borderColor='#0f3460';this.style.background='rgba(255,255,255,0.1)';" onkeydown="if(event.key==='Enter'){var url=this.value.trim();if(!url.startsWith('http://')&&!url.startsWith('https://'))url='https://'+url;window.location.href='/?url='+encodeURIComponent(url);}">
</div>

<style>
  body { padding-top: 44px !important; }
  #__proxy_url_input__::placeholder { color: #888; }
</style>
`, { html: true });
  }
}

// --------------------
// CSS Rewriter for external stylesheets
// --------------------
function rewriteCSS(css, base, isEmbedded = false) {
  const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
  
  // Rewrite url()
  css = css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
    try {
      if (path.startsWith('data:') || path.startsWith('blob:')) return m;
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `url("${prefix}${encodeURIComponent(abs)}")`;
    } catch {
      return m;
    }
  });
  
  // Rewrite @import "url"
  css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
    try {
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `@import "${prefix}${encodeURIComponent(abs)}"`;
    } catch {
      return m;
    }
  });
  
  // Rewrite @import url()
  css = css.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
    try {
      if (path.startsWith('data:')) return m;
      const abs = new URL(path, base).toString();
      if (abs.startsWith("https://proxy.ikunbeautiful.workers.dev")) return m;
      return `@import url("${prefix}${encodeURIComponent(abs)}")`;
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
    
    if (lowerKey === 'x-frame-options') continue;
    if (lowerKey === 'content-security-policy') {
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
      
      // Forward cookies
      const cookie = request.headers.get("Cookie");
      if (cookie) {
        requestHeaders.set("Cookie", cookie);
      }
      
      // Forward Referer with original target
      requestHeaders.set("Referer", target);

      const fetchOptions = {
        method: request.method,
        headers: requestHeaders,
        redirect: 'manual'
      };

      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        fetchOptions.body = request.body;
        const contentType = request.headers.get('Content-Type');
        if (contentType) {
          requestHeaders.set('Content-Type', contentType);
        }
      }

      let resp = await fetch(target, fetchOptions);

      // Handle redirects
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('Location');
        if (location) {
          const resolvedLocation = new URL(location, target).toString();
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
          .on("base", new BaseRewriter(target, isEmbedded))
          .on("meta", new MetaRewriter(target, isEmbedded))
          .on("a", new AnchorRewriter(target, isEmbedded))
          .on("link[rel='icon']", new FaviconRewriter(target, isEmbedded))
          .on("link[rel='shortcut icon']", new FaviconRewriter(target, isEmbedded))
          .on("link[rel='apple-touch-icon']", new FaviconRewriter(target, isEmbedded))
          .on("link[rel='mask-icon']", new FaviconRewriter(target, isEmbedded))
          .on("link[rel*='icon']", new FaviconRewriter(target, isEmbedded))
          .on("link[rel='stylesheet']", new LinkRewriter(target, isEmbedded))
          .on("link[rel='preload']", new LinkRewriter(target, isEmbedded))
          .on("link[rel='prefetch']", new LinkRewriter(target, isEmbedded))
          .on("link[rel='modulepreload']", new LinkRewriter(target, isEmbedded))
          .on("link", new LinkRewriter(target, isEmbedded))
          .on("iframe", new IFrameRewriter(target, isEmbedded))
          .on("frame", new IFrameRewriter(target, isEmbedded))
          .on("img", new ImageRewriter(target, isEmbedded))
          .on("video", new VideoRewriter(target, isEmbedded))
          .on("audio", new AudioRewriter(target, isEmbedded))
          .on("source", new SourceRewriter(target, isEmbedded))
          .on("track", new SourceRewriter(target, isEmbedded))
          .on("script", new ScriptRewriter(target, isEmbedded))
          .on("form", new FormRewriter(target, isEmbedded))
          .on("style", new StyleRewriter(target, isEmbedded))
          .on("[style]", new InlineStyleRewriter(target, isEmbedded))
          .on("object", new ObjectRewriter(target, isEmbedded))
          .on("embed", new EmbedRewriter(target, isEmbedded))
          .on("applet", new GenericUrlRewriter(target, isEmbedded))
          .on("area", new AnchorRewriter(target, isEmbedded))
          .on("input[type='image']", new ImageRewriter(target, isEmbedded))
          .on("head", new InjectNavigationFix(target, isEmbedded));
        
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
        const rewrittenCSS = rewriteCSS(css, target, isEmbedded);
        return new Response(rewrittenCSS, {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        });
      }

      // Handle JavaScript - pass through (URL rewriting happens client-side)
      if (contentType.includes("javascript") || contentType.includes("application/json")) {
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        });
      }

      // Non-HTML content
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
