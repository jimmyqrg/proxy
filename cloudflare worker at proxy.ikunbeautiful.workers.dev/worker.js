// ============================================================
// ULTRA DEFENSIVE PROXY - Handles ALL edge cases
// ============================================================

// --------------------
// Safe URL utilities
// --------------------
function safeString(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  try { return String(val); } catch { return ''; }
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  url = url.trim();
  if (url.length === 0) return false;
  if (url.length > 8192) return false; // Prevent DoS with huge URLs
  return true;
}

function isSpecialUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return lower === '#' || 
         lower === '' || 
         lower.startsWith('javascript:') || 
         lower.startsWith('data:') || 
         lower.startsWith('blob:') ||
         lower.startsWith('mailto:') ||
         lower.startsWith('tel:') ||
         lower.startsWith('sms:') ||
         lower.startsWith('about:') ||
         lower.startsWith('chrome:') ||
         lower.startsWith('chrome-extension:') ||
         lower.startsWith('moz-extension:') ||
         lower.startsWith('file:') ||
         lower.startsWith('view-source:');
}

function isAlreadyProxied(url) {
  if (!url) return false;
  return url.includes('/?url=') || url.includes('/?embedded=') || 
         url.includes('proxy.ikunbeautiful.workers.dev');
}

// --------------------
// URL Rewriting - ULTRA SAFE
// --------------------
function rewriteUrl(original, base, isEmbedded = false) {
  try {
    original = safeString(original).trim();
    
    if (!isValidUrl(original)) return original;
    if (isSpecialUrl(original)) return original;
    if (isAlreadyProxied(original)) return original;
    
    // Handle protocol-relative URLs
    if (original.startsWith('//')) {
      original = 'https:' + original;
    }
    
    // Decode if double-encoded
    let decoded = original;
    try {
      if (original.includes('%25')) {
        decoded = decodeURIComponent(original);
      }
    } catch {}
    
    // Resolve the URL against base
    let abs;
    try {
      abs = new URL(decoded, base).toString();
    } catch {
      // If URL parsing fails, try with the original
      try {
        abs = new URL(original, base).toString();
      } catch {
        return original; // Give up, return as-is
      }
    }

    // Don't proxy our own worker
    if (abs.includes("proxy.ikunbeautiful.workers.dev")) return original;

    // Build proxied URL
    const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
    return prefix + encodeURIComponent(abs);
    } catch {
      return original;
    }
  }
  
  // --------------------
// Rewrite srcset attribute (complex format)
  // --------------------
function rewriteSrcset(srcset, base, isEmbedded) {
  if (!srcset || typeof srcset !== 'string') return srcset;
  try {
    return srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      if (parts[0] && !isSpecialUrl(parts[0])) {
        parts[0] = rewriteUrl(parts[0], base, isEmbedded);
      }
      return parts.join(' ');
    }).join(', ');
  } catch {
    return srcset;
  }
}

// --------------------
// HTML Element Rewriters
// --------------------
class SafeRewriter {
  constructor(base, isEmbedded) { 
    this.base = base; 
    this.isEmbedded = isEmbedded; 
  }
  
  safeRewrite(el, attr) {
    try {
      const val = el.getAttribute(attr);
      if (val && !isSpecialUrl(val) && !isAlreadyProxied(val)) {
        el.setAttribute(attr, rewriteUrl(val, this.base, this.isEmbedded));
      }
    } catch {}
  }
  
  safeRewriteSrcset(el) {
    try {
      const srcset = el.getAttribute("srcset");
      if (srcset) {
        el.setAttribute("srcset", rewriteSrcset(srcset, this.base, this.isEmbedded));
      }
    } catch {}
  }
}

class AnchorRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "href");
    
    // Handle target="_blank"
    try {
      const target = el.getAttribute("target");
      if (target === "_blank" || target === "_new") {
        el.removeAttribute("target");
        el.setAttribute("data-proxy-target", target);
      }
    } catch {}
  }
}

class LinkRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "href");
  }
}

class ImageRewriter extends SafeRewriter {
    element(el) {
    this.safeRewrite(el, "src");
    this.safeRewriteSrcset(el);
    this.safeRewrite(el, "data-src");
    this.safeRewrite(el, "data-lazy-src");
    this.safeRewrite(el, "data-original");
  }
}

class SourceRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "src");
    this.safeRewriteSrcset(el);
  }
}

class VideoRewriter extends SafeRewriter {
      element(el) {
    this.safeRewrite(el, "src");
    this.safeRewrite(el, "poster");
  }
}

class AudioRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "src");
  }
}

class ScriptRewriter extends SafeRewriter {
      element(el) {
    this.safeRewrite(el, "src");
    // Remove integrity checks
    try {
      el.removeAttribute("integrity");
      el.removeAttribute("crossorigin");
      el.removeAttribute("nonce");
    } catch {}
  }
}

class IFrameRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "src");
    
    // Handle srcdoc
    try {
          const srcdoc = el.getAttribute("srcdoc");
          if (srcdoc) {
        const base = this.base;
        const isEmbedded = this.isEmbedded;
        const rewritten = srcdoc
          .replace(/src\s*=\s*["']([^"']+)["']/gi, (m, url) => `src="${rewriteUrl(url, base, isEmbedded)}"`)
          .replace(/href\s*=\s*["']([^"']+)["']/gi, (m, url) => {
            if (isSpecialUrl(url)) return m;
            return `href="${rewriteUrl(url, base, isEmbedded)}"`;
          });
        el.setAttribute("srcdoc", rewritten);
      }
    } catch {}
    
    // Remove sandbox restrictions that block our scripts
    try {
      const sandbox = el.getAttribute("sandbox");
      if (sandbox !== null) {
        el.setAttribute("sandbox", sandbox + " allow-scripts allow-same-origin");
      }
    } catch {}
  }
}

class FormRewriter extends SafeRewriter {
  element(el) {
    try {
      const action = el.getAttribute("action");
      const resolvedAction = action || this.base;
      if (!isSpecialUrl(resolvedAction) && !isAlreadyProxied(resolvedAction)) {
        el.setAttribute("action", rewriteUrl(resolvedAction, this.base, this.isEmbedded));
      }
    } catch {}
  }
}

class ObjectRewriter extends SafeRewriter {
    element(el) {
    this.safeRewrite(el, "data");
    this.safeRewrite(el, "codebase");
  }
}

class EmbedRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "src");
  }
}

class BaseRewriter extends SafeRewriter {
  element(el) {
    try { el.remove(); } catch {}
  }
}

class MetaRewriter extends SafeRewriter {
    element(el) {
    try {
      const httpEquiv = (el.getAttribute("http-equiv") || "").toLowerCase();
      const name = (el.getAttribute("name") || "").toLowerCase();
      const content = el.getAttribute("content") || "";
      
      // Remove iframe busters
      if (httpEquiv === "x-frame-options") {
        el.remove();
        return;
      }
      
      // Sanitize CSP
      if (httpEquiv === "content-security-policy" || httpEquiv === "content-security-policy-report-only") {
        const newContent = content
          .replace(/frame-ancestors[^;]*(;|$)/gi, '')
          .replace(/frame-src[^;]*(;|$)/gi, '')
          .replace(/script-src[^;]*(;|$)/gi, '')
          .replace(/default-src[^;]*(;|$)/gi, '')
          .trim();
        if (newContent) {
          el.setAttribute("content", newContent);
        } else {
          el.remove();
        }
        return;
      }
      
      // Handle refresh redirects
      if (httpEquiv === "refresh" && content) {
        const match = content.match(/(\d+)\s*;\s*url\s*=\s*['"]?([^'">\s]+)/i);
        if (match) {
          el.setAttribute("content", `${match[1]};url=${rewriteUrl(match[2], this.base, this.isEmbedded)}`);
        }
      }
      
      // Remove referrer policy that might leak info
      if (name === "referrer") {
        el.remove();
      }
    } catch {}
    }
  }
  
  // --------------------
// Style Rewriters
  // --------------------
function rewriteCSSUrls(css, base, isEmbedded) {
  if (!css || typeof css !== 'string') return css;
  
  const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
  
  try {
    // Rewrite url()
    css = css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#')) return m;
        const abs = new URL(path, base).toString();
        if (abs.includes("proxy.ikunbeautiful.workers.dev")) return m;
        return `url("${prefix}${encodeURIComponent(abs)}")`;
      } catch {
        return m;
      }
    });
    
    // Rewrite @import "url"
    css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
      try {
        if (!path || path.startsWith('data:')) return m;
        const abs = new URL(path, base).toString();
        if (abs.includes("proxy.ikunbeautiful.workers.dev")) return m;
        return `@import "${prefix}${encodeURIComponent(abs)}"`;
      } catch {
        return m;
      }
    });
    
    // Rewrite @import url()
    css = css.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        if (!path || path.startsWith('data:')) return m;
        const abs = new URL(path, base).toString();
        if (abs.includes("proxy.ikunbeautiful.workers.dev")) return m;
        return `@import url("${prefix}${encodeURIComponent(abs)}")`;
        } catch {
          return m;
        }
      });
  } catch {}
  
  return css;
}

class StyleRewriter extends SafeRewriter {
  element(el) {}
  text(text) {
    try {
      const content = text.text;
      if (content) {
        text.replace(rewriteCSSUrls(content, this.base, this.isEmbedded));
      }
    } catch {}
  }
}

class InlineStyleRewriter extends SafeRewriter {
  element(el) {
    try {
      const style = el.getAttribute("style");
      if (style) {
        const rewritten = rewriteCSSUrls(style, this.base, this.isEmbedded);
        if (rewritten !== style) {
          el.setAttribute("style", rewritten);
        }
      }
    } catch {}
  }
}

// --------------------
// SVG Handler (xlink:href)
// --------------------
class SVGRewriter extends SafeRewriter {
  element(el) {
    this.safeRewrite(el, "href");
    this.safeRewrite(el, "xlink:href");
  }
}

// --------------------
// Generic handler for any element with URL attributes
// --------------------
class GenericUrlRewriter extends SafeRewriter {
  element(el) {
    const attrs = ['src', 'href', 'action', 'data', 'poster', 'background', 
                   'cite', 'longdesc', 'usemap', 'formaction', 'icon',
                   'manifest', 'codebase', 'archive', 'profile'];
    for (const attr of attrs) {
      this.safeRewrite(el, attr);
    }
  }
}

// --------------------
// Inline event handler rewriter (onclick, etc.)
// --------------------
class EventHandlerRewriter extends SafeRewriter {
  element(el) {
    const eventAttrs = ['onclick', 'onload', 'onerror', 'onsubmit', 'onmouseover', 
                        'onmouseout', 'onfocus', 'onblur', 'onchange', 'oninput'];
    for (const attr of eventAttrs) {
      try {
        const val = el.getAttribute(attr);
        if (val && (val.includes("location") || val.includes("window.open") || 
                    val.includes("href") || val.includes("src"))) {
          // Wrap in try-catch to prevent errors
          el.setAttribute(attr, `try{${val}}catch(e){console.error('Event error:',e)}`);
        }
      } catch {}
    }
    }
  }
  
  // --------------------
// MEGA JavaScript Injection - Ultra Defensive
  // --------------------
  class InjectNavigationFix {
  constructor(targetUrl, isEmbedded = false) {
    this.targetUrl = targetUrl;
    this.isEmbedded = isEmbedded;
  }
  
    element(el) {
    const targetUrl = this.targetUrl;
    const isEmbedded = this.isEmbedded;
    
    let targetOrigin = '';
    try { targetOrigin = new URL(targetUrl).origin; } catch {}
    
    // The script is wrapped in try-catch at every level to prevent ANY error from breaking the page
    el.prepend(`
  <script>
  (function(){
'use strict';

// ============ ULTRA-SAFE PROXY SCRIPT ============
// Wrapped in multiple try-catch to never break the page

try {

// ========== CONFIG ==========
var __PROXY_TARGET__ = ${JSON.stringify(targetUrl)};
var __PROXY_ORIGIN__ = ${JSON.stringify(targetOrigin)};
var __PROXY_EMBEDDED__ = ${isEmbedded};

// Store originals before anything can modify them
var _Object = Object;
var _Array = Array;
var _String = String;
var _encodeURIComponent = encodeURIComponent;
var _decodeURIComponent = decodeURIComponent;
var _URL = URL;
var _location = location;
var _history = history;
var _window = window;
var _document = document;
var _console = console;

// ========== SAFE UTILITIES ==========
function safeStr(v) {
  try {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    return _String(v);
  } catch(e) { return ''; }
}

function getCurrentTarget() {
  try {
    var params = new URLSearchParams(_location.search);
    return params.get('url') || __PROXY_TARGET__;
  } catch(e) {
    return __PROXY_TARGET__;
  }
}

function isSpecial(url) {
  if (!url) return true;
  var l = safeStr(url).toLowerCase().trim();
  return l === '#' || l === '' || 
         l.indexOf('javascript:') === 0 || 
         l.indexOf('data:') === 0 || 
         l.indexOf('blob:') === 0 ||
         l.indexOf('mailto:') === 0 ||
         l.indexOf('tel:') === 0 ||
         l.indexOf('about:') === 0;
}

function isProxied(url) {
  if (!url) return false;
  var s = safeStr(url);
  return s.indexOf('/?url=') !== -1 || s.indexOf('/?embedded=') !== -1;
}

// ========== MAIN PROXIFY FUNCTION ==========
function proxify(url) {
  try {
    url = safeStr(url).trim();
    if (!url || url.length === 0 || url.length > 8192) return url;
    if (isSpecial(url)) return url;
    if (isProxied(url)) return url;
    
    // Protocol-relative
    if (url.indexOf('//') === 0) url = 'https:' + url;
    
    var prefix = __PROXY_EMBEDDED__ ? '/?embedded=1&url=' : '/?url=';
    
    // Absolute URL
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
      return prefix + _encodeURIComponent(url);
    }
    
    // Relative URL - resolve against current target
    try {
      var base = getCurrentTarget();
      var resolved = new _URL(url, base).href;
      return prefix + _encodeURIComponent(resolved);
    } catch(e) {
      try {
        var resolved2 = new _URL(url, __PROXY_TARGET__).href;
        return prefix + _encodeURIComponent(resolved2);
      } catch(e2) {
        return url;
      }
    }
  } catch(e) {
    return url;
  }
}

function resolveUrl(url) {
  try {
    url = safeStr(url).trim();
    if (!url) return url;
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    return new _URL(url, getCurrentTarget()).href;
  } catch(e) {
    return url;
  }
}

// Expose globally
_window.__proxyProxify__ = proxify;
_window.__proxyResolve__ = resolveUrl;
_window.__PROXY_TARGET_URL__ = __PROXY_TARGET__;
_window.__PROXY_EMBEDDED__ = __PROXY_EMBEDDED__;

// ========== ANTI-IFRAME-BUSTER ==========
try {
  _Object.defineProperty(_window, 'top', { get: function() { return _window; }, configurable: true });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'parent', { get: function() { return _window; }, configurable: true });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'frameElement', { get: function() { return null; }, configurable: true });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'self', { get: function() { return _window; }, configurable: true });
} catch(e) {}

// Prevent document.domain manipulation
try {
  _Object.defineProperty(_document, 'domain', { 
    get: function() { return __PROXY_ORIGIN__.replace(/^https?:\\/\\//, ''); },
    set: function() {},
    configurable: true 
  });
} catch(e) {}

// ========== LOCATION OVERRIDES ==========
try {
  var _assign = _location.assign.bind(_location);
  var _replace = _location.replace.bind(_location);
  
  _location.assign = function(u) { try { return _assign(proxify(u)); } catch(e) { return _assign(u); } };
  _location.replace = function(u) { try { return _replace(proxify(u)); } catch(e) { return _replace(u); } };
  
  try {
    _Object.defineProperty(_location, 'href', {
      set: function(u) { _assign(proxify(u)); },
      get: function() { return _location.toString(); },
      configurable: true
    });
  } catch(e) {}
} catch(e) {}

// ========== HISTORY OVERRIDES ==========
try {
  var _pushState = _history.pushState.bind(_history);
  var _replaceState = _history.replaceState.bind(_history);
  
  _history.pushState = function(s, t, u) { 
    try { if (u) u = proxify(u); } catch(e) {}
    return _pushState(s, t, u);
  };
  _history.replaceState = function(s, t, u) {
    try { if (u) u = proxify(u); } catch(e) {}
    return _replaceState(s, t, u);
  };
} catch(e) {}

// ========== WINDOW.OPEN ==========
try {
  var _open = _window.open.bind(_window);
  _window.open = function(url, name, specs) {
    try {
      if (!url || url === 'about:blank') return _open(url, name, specs);
      
      var resolved = resolveUrl(url);
      
      if (__PROXY_EMBEDDED__) {
        try {
          var realParent = _Object.getPrototypeOf(_window).parent;
          if (realParent && realParent !== _window) {
            realParent.postMessage({ type: 'PROXY_NEW_TAB', url: resolved }, '*');
            return { closed: false, close: function() {}, focus: function() {}, blur: function() {} };
          }
        } catch(e) {}
      }
      
      return _open(proxify(url), name, specs);
    } catch(e) {
      return _open(url, name, specs);
    }
  };
} catch(e) {}

// ========== WINDOW.CLOSE ==========
try {
  var _close = _window.close ? _window.close.bind(_window) : function(){};
  _window.close = function() {
    if (__PROXY_EMBEDDED__) {
      try {
        var realParent = _Object.getPrototypeOf(_window).parent;
        if (realParent && realParent !== _window) {
          realParent.postMessage({ type: 'PROXY_CLOSE_TAB' }, '*');
          return;
        }
      } catch(e) {}
      }
      return _close();
    };
} catch(e) {}

// ========== ELEMENT SETATTRIBUTE ==========
try {
  var _setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    try {
      var n = safeStr(name).toLowerCase();
      if ((n === 'src' || n === 'href' || n === 'action' || n === 'data' || n === 'poster' || n === 'formaction') && value) {
        value = proxify(value);
      } else if (n === 'srcset' && value) {
        value = safeStr(value).split(',').map(function(s) {
          var parts = s.trim().split(/\\s+/);
          if (parts[0]) parts[0] = proxify(parts[0]);
          return parts.join(' ');
        }).join(', ');
      }
    } catch(e) {}
    return _setAttribute.call(this, name, value);
  };
} catch(e) {}

// ========== PROPERTY OVERRIDES ==========
var srcElements = ['HTMLImageElement', 'HTMLScriptElement', 'HTMLIFrameElement', 
                   'HTMLVideoElement', 'HTMLAudioElement', 'HTMLSourceElement',
                   'HTMLEmbedElement', 'HTMLTrackElement', 'HTMLMediaElement'];

srcElements.forEach(function(name) {
  try {
    var El = _window[name];
    if (!El || !El.prototype) return;
    var desc = _Object.getOwnPropertyDescriptor(El.prototype, 'src');
    if (desc && desc.set) {
      var _set = desc.set;
      _Object.defineProperty(El.prototype, 'src', {
        set: function(v) { try { v = proxify(v); } catch(e) {} _set.call(this, v); },
        get: desc.get,
        configurable: true
      });
    }
  } catch(e) {}
});

// href properties
['HTMLAnchorElement', 'HTMLLinkElement', 'HTMLAreaElement', 'HTMLBaseElement'].forEach(function(name) {
  try {
    var El = _window[name];
    if (!El || !El.prototype) return;
    var desc = _Object.getOwnPropertyDescriptor(El.prototype, 'href');
    if (desc && desc.set) {
      var _set = desc.set;
      _Object.defineProperty(El.prototype, 'href', {
        set: function(v) { try { v = proxify(v); } catch(e) {} _set.call(this, v); },
        get: desc.get,
        configurable: true
      });
    }
  } catch(e) {}
});

// form action
try {
  var formDesc = _Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
  if (formDesc && formDesc.set) {
    var _setAction = formDesc.set;
    _Object.defineProperty(HTMLFormElement.prototype, 'action', {
      set: function(v) { try { v = proxify(v); } catch(e) {} _setAction.call(this, v); },
      get: formDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// object data
try {
  var objDesc = _Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype, 'data');
  if (objDesc && objDesc.set) {
    var _setData = objDesc.set;
    _Object.defineProperty(HTMLObjectElement.prototype, 'data', {
      set: function(v) { try { v = proxify(v); } catch(e) {} _setData.call(this, v); },
      get: objDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// video poster
try {
  var posterDesc = _Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'poster');
  if (posterDesc && posterDesc.set) {
    var _setPoster = posterDesc.set;
    _Object.defineProperty(HTMLVideoElement.prototype, 'poster', {
      set: function(v) { try { v = proxify(v); } catch(e) {} _setPoster.call(this, v); },
      get: posterDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// ========== FETCH ==========
try {
  var _fetch = _window.fetch.bind(_window);
  _window.fetch = function(input, init) {
    try {
      if (typeof input === 'string') {
        input = proxify(input);
      } else if (input && input.url) {
        input = new Request(proxify(input.url), input);
      }
    } catch(e) {}
    return _fetch(input, init);
  };
} catch(e) {}

// ========== XMLHttpRequest ==========
try {
  var _XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
    try { url = proxify(url); } catch(e) {}
    return _XHROpen.call(this, method, url, async !== false, user, pass);
  };
} catch(e) {}

// ========== Worker ==========
try {
  if (_window.Worker) {
    var _Worker = _window.Worker;
    _window.Worker = function(url, opts) {
      try { url = proxify(url); } catch(e) {}
      return new _Worker(url, opts);
    };
    _window.Worker.prototype = _Worker.prototype;
  }
} catch(e) {}

// ========== SharedWorker ==========
try {
  if (_window.SharedWorker) {
    var _SharedWorker = _window.SharedWorker;
    _window.SharedWorker = function(url, opts) {
      try { url = proxify(url); } catch(e) {}
      return new _SharedWorker(url, opts);
    };
    _window.SharedWorker.prototype = _SharedWorker.prototype;
  }
} catch(e) {}

// ========== EventSource ==========
try {
  if (_window.EventSource) {
    var _EventSource = _window.EventSource;
    _window.EventSource = function(url, cfg) {
      try { url = proxify(url); } catch(e) {}
      return new _EventSource(url, cfg);
    };
    _window.EventSource.prototype = _EventSource.prototype;
  }
} catch(e) {}

// ========== sendBeacon ==========
try {
  if (navigator.sendBeacon) {
    var _sendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      try { url = proxify(url); } catch(e) {}
      return _sendBeacon(url, data);
    };
  }
} catch(e) {}

// ========== Service Worker (BLOCK) ==========
try {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function() {
      return Promise.reject(new Error('Service Workers disabled in proxy'));
    };
  }
} catch(e) {}

// ========== Image Constructor ==========
try {
  var _Image = _window.Image;
  _window.Image = function(w, h) { return new _Image(w, h); };
  _window.Image.prototype = _Image.prototype;
} catch(e) {}

// ========== HTML Rewriting ==========
function rewriteHtml(html) {
  if (!html || typeof html !== 'string') return html;
  try {
    html = html.replace(/(<[^>]+\\s)(src\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      return pre + attr + proxify(url) + q;
    });
    html = html.replace(/(<[^>]+\\s)(href\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    html = html.replace(/(<form[^>]+\\s)(action\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      return pre + attr + proxify(url) + q;
    });
  } catch(e) {}
  return html;
}

// ========== document.write ==========
try {
  var _docWrite = _document.write.bind(_document);
  var _docWriteln = _document.writeln.bind(_document);
  _document.write = function() {
    var args = _Array.prototype.slice.call(arguments).map(function(a) { return rewriteHtml(a); });
    return _docWrite.apply(_document, args);
  };
  _document.writeln = function() {
    var args = _Array.prototype.slice.call(arguments).map(function(a) { return rewriteHtml(a); });
    return _docWriteln.apply(_document, args);
  };
} catch(e) {}

// ========== innerHTML/outerHTML ==========
try {
  var innerDesc = _Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (innerDesc && innerDesc.set) {
    var _setInner = innerDesc.set;
    _Object.defineProperty(Element.prototype, 'innerHTML', {
      set: function(v) { _setInner.call(this, rewriteHtml(v)); },
      get: innerDesc.get,
      configurable: true
    });
  }
} catch(e) {}

try {
  var outerDesc = _Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  if (outerDesc && outerDesc.set) {
    var _setOuter = outerDesc.set;
    _Object.defineProperty(Element.prototype, 'outerHTML', {
      set: function(v) { _setOuter.call(this, rewriteHtml(v)); },
      get: outerDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// ========== insertAdjacentHTML ==========
try {
  var _insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html) {
    return _insertAdjacentHTML.call(this, pos, rewriteHtml(html));
  };
} catch(e) {}

// ========== DOMParser ==========
try {
  var _DOMParser = _window.DOMParser;
  _window.DOMParser = function() {
    var parser = new _DOMParser();
    var _parseFromString = parser.parseFromString.bind(parser);
    parser.parseFromString = function(str, type) {
      if (type && type.indexOf('html') !== -1) {
        str = rewriteHtml(str);
      }
      return _parseFromString(str, type);
    };
    return parser;
  };
} catch(e) {}

// ========== Click Handler ==========
try {
  _document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      while (t && t.tagName !== 'A') t = t.parentElement;
      if (t && t.tagName === 'A') {
        var href = t.getAttribute('href');
        var target = t.getAttribute('target') || t.getAttribute('data-proxy-target');
        if (href && (target === '_blank' || target === '_new')) {
          e.preventDefault();
          e.stopPropagation();
          var resolved = resolveUrl(href);
          if (__PROXY_EMBEDDED__) {
            try {
              var realParent = _Object.getPrototypeOf(_window).parent;
              if (realParent && realParent !== _window) {
                realParent.postMessage({ type: 'PROXY_NEW_TAB', url: resolved }, '*');
                return;
              }
            } catch(ex) {}
          }
          _location.href = proxify(href);
        }
      }
    } catch(ex) {}
    }, true);
} catch(e) {}

// ========== Form Submit ==========
try {
  _document.addEventListener('submit', function(e) {
    try {
      var form = e.target;
      if (form && form.tagName === 'FORM') {
        var action = form.getAttribute('action');
        if (!action || (!isProxied(action) && !isSpecial(action))) {
          form.setAttribute('action', proxify(action || getCurrentTarget()));
        }
      }
    } catch(ex) {}
  }, true);
} catch(e) {}

// ========== Parent Notification ==========
function notifyParent() {
  if (!__PROXY_EMBEDDED__) return;
  try {
    var realParent = _Object.getPrototypeOf(_window).parent;
    if (realParent && realParent !== _window) {
      realParent.postMessage({
        type: 'PROXY_URL_CHANGED',
        url: getCurrentTarget(),
        title: _document.title,
        proxyUrl: _location.href
      }, '*');
    }
  } catch(e) {}
}

try {
  if (_document.readyState === 'complete' || _document.readyState === 'interactive') {
    notifyParent();
  } else {
    _window.addEventListener('DOMContentLoaded', notifyParent);
  }
  _window.addEventListener('popstate', notifyParent);
  
  var titleObs = new MutationObserver(notifyParent);
  var observeTitle = function() {
    var t = _document.querySelector('title');
    if (t) titleObs.observe(t, { subtree: true, characterData: true, childList: true });
  };
  if (_document.readyState === 'loading') {
    _window.addEventListener('DOMContentLoaded', observeTitle);
  } else {
    observeTitle();
  }
} catch(e) {}

// ========== Message Handler ==========
try {
  _window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'PROXY_GET_URL') {
      e.source.postMessage({ type: 'PROXY_URL_RESPONSE', url: getCurrentTarget(), title: _document.title }, '*');
    }
  });
} catch(e) {}

} catch(globalError) {
  // If anything fails catastrophically, log but don't break the page
  try { console.error('[Proxy] Init error:', globalError); } catch(e) {}
    }
  
  })();
  </script>
`, { html: true });
  }
}

// --------------------
// Toolbar (minimal)
// --------------------
class InjectToolbar {
  constructor(targetUrl) {
    this.targetUrl = targetUrl;
  }
  element(el) {
    const targetUrl = this.targetUrl;
    const escaped = targetUrl.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.prepend(`
<div id="__proxy_toolbar__" style="position:relative;top:0;left:0;right:0;width:100%;height:42px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-bottom:2px solid #0f3460;display:flex;align-items:center;padding:0 12px;gap:8px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.3);box-sizing:border-box;flex-shrink:0;">
  <div style="display:flex;align-items:center;gap:8px;color:#e94560;font-weight:600;font-size:14px;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
    PROXY
  </div>
  <input type="text" id="__proxy_url_input__" value="${escaped}" placeholder="Enter URL and press Enter" style="flex:1;height:28px;background:rgba(255,255,255,0.1);border:1px solid #0f3460;border-radius:6px;padding:0 12px;color:#eee;font-size:13px;outline:none;" onfocus="this.style.borderColor='#e94560'" onblur="this.style.borderColor='#0f3460'" onkeydown="if(event.key==='Enter'){var u=this.value.trim();if(u.indexOf('http')!==0)u='https://'+u;location.href='/?url='+encodeURIComponent(u);}">
</div>
<style>#__proxy_url_input__::placeholder{color:#888}</style>
`, { html: true });
  }
}

// --------------------
// Header sanitization
// --------------------
function sanitizeHeaders(headers, isEmbedded) {
  const newHeaders = new Headers();
  const skipHeaders = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'x-content-type-options',
    'x-xss-protection',
    'strict-transport-security',
    'public-key-pins',
    'public-key-pins-report-only',
    'expect-ct',
    'feature-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy'
  ]);
  
  for (const [key, value] of headers.entries()) {
    if (!skipHeaders.has(key.toLowerCase())) {
      newHeaders.set(key, value);
    }
  }
  
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', '*');
  newHeaders.set('Access-Control-Allow-Headers', '*');
  newHeaders.set('Access-Control-Expose-Headers', '*');
  
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

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (!target) {
      return new Response("Missing ?url= parameter", { status: 400 });
    }
    
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      return new Response("URL must start with http:// or https://", { status: 400 });
    }

    // Prevent infinite loops
    if (target.includes("proxy.ikunbeautiful.workers.dev")) {
      return new Response("Cannot proxy the proxy itself", { status: 400 });
    }

    try {
      const requestHeaders = new Headers();
      requestHeaders.set("User-Agent", request.headers.get("User-Agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      requestHeaders.set("Accept", request.headers.get("Accept") || "*/*");
      requestHeaders.set("Accept-Language", request.headers.get("Accept-Language") || "en-US,en;q=0.9");
      requestHeaders.set("Accept-Encoding", "gzip, deflate, br");
      requestHeaders.set("Referer", target);
      
      // Forward important headers
      const forwardHeaders = ['Cookie', 'Authorization', 'Content-Type', 'Content-Length', 'Range', 'If-None-Match', 'If-Modified-Since'];
      for (const h of forwardHeaders) {
        const val = request.headers.get(h);
        if (val) requestHeaders.set(h, val);
      }

      const fetchOptions = {
        method: request.method,
        headers: requestHeaders,
        redirect: 'manual'
      };

      // Forward body
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        fetchOptions.body = request.body;
      }

      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      fetchOptions.signal = controller.signal;

      let resp;
      try {
        resp = await fetch(target, fetchOptions);
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle redirects (limit to 10)
      let redirectCount = 0;
      while (resp.status >= 300 && resp.status < 400 && redirectCount < 10) {
        const location = resp.headers.get('Location');
        if (!location) break;
        
        const resolvedLocation = new URL(location, target).toString();
        const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
        
        return new Response(null, {
          status: resp.status,
          headers: { 
            'Location': prefix + encodeURIComponent(resolvedLocation),
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
  
        const contentType = resp.headers.get("content-type") || "";
      const sanitizedHeaders = sanitizeHeaders(resp.headers, isEmbedded);
  
      // HTML
        if (contentType.includes("text/html")) {
        let rewriter = new HTMLRewriter()
          .on("base", new BaseRewriter(target, isEmbedded))
          .on("meta", new MetaRewriter(target, isEmbedded))
          .on("a", new AnchorRewriter(target, isEmbedded))
          .on("link", new LinkRewriter(target, isEmbedded))
          .on("img", new ImageRewriter(target, isEmbedded))
          .on("picture source", new SourceRewriter(target, isEmbedded))
          .on("video", new VideoRewriter(target, isEmbedded))
          .on("video source", new SourceRewriter(target, isEmbedded))
          .on("audio", new AudioRewriter(target, isEmbedded))
          .on("audio source", new SourceRewriter(target, isEmbedded))
          .on("script", new ScriptRewriter(target, isEmbedded))
          .on("iframe", new IFrameRewriter(target, isEmbedded))
          .on("frame", new IFrameRewriter(target, isEmbedded))
          .on("form", new FormRewriter(target, isEmbedded))
          .on("object", new ObjectRewriter(target, isEmbedded))
          .on("embed", new EmbedRewriter(target, isEmbedded))
          .on("style", new StyleRewriter(target, isEmbedded))
          .on("[style]", new InlineStyleRewriter(target, isEmbedded))
          .on("area", new AnchorRewriter(target, isEmbedded))
          .on("track", new SourceRewriter(target, isEmbedded))
          .on("input[type='image']", new ImageRewriter(target, isEmbedded))
          .on("svg [href]", new SVGRewriter(target, isEmbedded))
          .on("svg [xlink\\:href]", new SVGRewriter(target, isEmbedded))
          .on("use", new SVGRewriter(target, isEmbedded))
          .on("image", new SVGRewriter(target, isEmbedded))
          .on("[background]", new GenericUrlRewriter(target, isEmbedded))
          .on("[poster]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data]", new GenericUrlRewriter(target, isEmbedded))
          .on("[cite]", new GenericUrlRewriter(target, isEmbedded))
          .on("[longdesc]", new GenericUrlRewriter(target, isEmbedded))
          .on("[formaction]", new GenericUrlRewriter(target, isEmbedded))
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

      // CSS
      if (contentType.includes("text/css") || contentType.includes("stylesheet")) {
        const css = await resp.text();
        return new Response(rewriteCSSUrls(css, target, isEmbedded), {
          status: resp.status,
          statusText: resp.statusText,
          headers: sanitizedHeaders
        });
      }

      // Everything else - pass through
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: sanitizedHeaders
      });

    } catch (e) {
      const errorMessage = e.name === 'AbortError' ? 'Request timeout (30s)' : e.message;
      return new Response(`Proxy error: ${errorMessage}`, { 
        status: 502,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
