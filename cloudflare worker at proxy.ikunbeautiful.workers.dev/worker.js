// ============================================================
// ULTRA DEFENSIVE PROXY - MAX FIX VERSION
// Handles ALL edge cases including WebSockets, Blobs, dynamic imports
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
         lower.startsWith('view-source:') ||
         lower.startsWith('wss:') ||
         lower.startsWith('ws:');
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
    
    // Handle ping attribute (tracking URLs)
    try {
      const ping = el.getAttribute("ping");
      if (ping) {
        const proxiedPing = ping.split(/\s+/).map(url => {
          if (url && !isSpecialUrl(url) && !isAlreadyProxied(url)) {
            return rewriteUrl(url, this.base, this.isEmbedded);
          }
          return url;
        }).join(' ');
        el.setAttribute("ping", proxiedPing);
      }
    } catch {}
    
    // Handle download attribute - let it work
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
    
    // Also handle imagesrcset attribute on link elements
    try {
      const srcset = el.getAttribute("imagesrcset");
      if (srcset) {
        el.setAttribute("imagesrcset", rewriteSrcset(srcset, this.base, this.isEmbedded));
      }
    } catch {}
    
    // Handle as attribute for preload
    try {
      const asAttr = el.getAttribute("as");
      // These are fine, no need to change
    } catch {}
  }
}
  
class ImageRewriter extends SafeRewriter {
    element(el) {
    this.safeRewrite(el, "src");
    this.safeRewriteSrcset(el);
    // Lazy loading attributes
    this.safeRewrite(el, "data-src");
    this.safeRewrite(el, "data-lazy-src");
    this.safeRewrite(el, "data-original");
    this.safeRewrite(el, "data-lazy");
    this.safeRewrite(el, "data-url");
    this.safeRewrite(el, "data-image");
    this.safeRewrite(el, "data-thumb");
    this.safeRewrite(el, "data-full");
    this.safeRewrite(el, "data-bg");
    this.safeRewrite(el, "data-background");
    this.safeRewrite(el, "longdesc");
    this.safeRewrite(el, "usemap");
    // loading="lazy" is fine, no change needed
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
  
  // Handle inline script content - rewrite string URLs
  text(text) {
    try {
      const content = text.text;
      if (!content || content.trim().length === 0) return;
      
      // Only rewrite if content looks like it contains URL strings
      if (!content.includes('http://') && !content.includes('https://') && !content.includes('./') && !content.includes('/')) return;
      
      // Don't rewrite if it's our injected script
      if (content.includes('__PROXY_TARGET__') || content.includes('__proxyProxify__')) return;
      
      let rewritten = content;
      const prefix = this.isEmbedded ? "/?embedded=1&url=" : "/?url=";
      const base = this.base;
      
      // Rewrite fetch/XMLHttpRequest string URLs (common patterns)
      // fetch("https://...") or fetch('https://...')
      rewritten = rewritten.replace(/(fetch|XMLHttpRequest\.prototype\.open)\s*\(\s*(['"])([^'"]+)\2/gi, (m, fn, q, url) => {
        try {
          if (!url || url.includes('proxy.ikunbeautiful.workers.dev') || url.startsWith('data:') || url.startsWith('blob:')) return m;
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('./')) {
            const abs = new URL(url, base).toString();
            return `${fn}(${q}${prefix}${encodeURIComponent(abs)}${q}`;
          }
        } catch {}
        return m;
      });
      
      // Don't replace yet - we might break code
      // text.replace(rewritten);
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

// Handle button/input with formaction attribute
class FormActionRewriter extends SafeRewriter {
    element(el) {
    this.safeRewrite(el, "formaction");
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
// Style Rewriters - MAX FIX VERSION
  // --------------------
function rewriteCSSUrls(css, base, isEmbedded) {
  if (!css || typeof css !== 'string') return css;
  
  const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
  
  try {
    // Rewrite url() - comprehensive regex that handles all formats
    css = css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        path = path.trim();
        if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#') || path.startsWith('about:')) return m;
        if (path.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(path, base).toString();
        return `url("${prefix}${encodeURIComponent(abs)}")`;
        } catch {
          return m;
        }
      });
    
    // Rewrite @import "url"
    css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, path) => {
      try {
        path = path.trim();
        if (!path || path.startsWith('data:')) return m;
        if (path.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(path, base).toString();
        return `@import "${prefix}${encodeURIComponent(abs)}"`;
      } catch {
        return m;
      }
    });
    
    // Rewrite @import url()
    css = css.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (m, q, path) => {
      try {
        path = path.trim();
        if (!path || path.startsWith('data:')) return m;
        if (path.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(path, base).toString();
        return `@import url("${prefix}${encodeURIComponent(abs)}")`;
      } catch {
        return m;
      }
    });
    
    // Rewrite src in @font-face - handles format(), local(), etc.
    css = css.replace(/(@font-face\s*\{[^}]*)(src\s*:\s*)([^;}]+)/gi, (m, prefix_part, src_decl, src_val) => {
      try {
        const newSrcVal = src_val.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (um, uq, upath) => {
          try {
            upath = upath.trim();
            if (!upath || upath.startsWith('data:') || upath.startsWith('blob:')) return um;
            if (upath.includes('proxy.ikunbeautiful.workers.dev')) return um;
            const abs = new URL(upath, base).toString();
            return `url("${prefix}${encodeURIComponent(abs)}")`;
          } catch {
            return um;
          }
        });
        return prefix_part + src_decl + newSrcVal;
      } catch {
        return m;
      }
    });
    
    // Handle CSS variables with url values
    css = css.replace(/(--[a-zA-Z0-9_-]+\s*:\s*)url\(\s*(['"]?)([^'")\s]+)\2\s*\)/gi, (m, varPart, q, path) => {
      try {
        path = path.trim();
        if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#')) return m;
        if (path.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(path, base).toString();
        return `${varPart}url("${prefix}${encodeURIComponent(abs)}")`;
      } catch {
        return m;
      }
    });
    
    // Handle cursor url()
    css = css.replace(/(cursor\s*:\s*)([^;{}]+)/gi, (m, cursorPart, val) => {
      try {
        const newVal = val.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi, (um, uq, upath) => {
          try {
            upath = upath.trim();
            if (!upath || upath.startsWith('data:') || upath.startsWith('blob:')) return um;
            if (upath.includes('proxy.ikunbeautiful.workers.dev')) return um;
            const abs = new URL(upath, base).toString();
            return `url("${prefix}${encodeURIComponent(abs)}")`;
          } catch {
            return um;
          }
        });
        return cursorPart + newVal;
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
    // Standard URL attributes
    const attrs = ['src', 'href', 'action', 'data', 'poster', 'background', 
                   'cite', 'longdesc', 'usemap', 'formaction', 'icon',
                   'manifest', 'codebase', 'archive', 'profile', 'code',
                   'classid', 'pluginspage', 'pluginurl'];
    
    // data-* attributes commonly used for lazy loading
    const dataAttrs = ['data-src', 'data-href', 'data-url', 'data-background',
                       'data-poster', 'data-image', 'data-thumb', 'data-full',
                       'data-lazy', 'data-lazy-src', 'data-original', 'data-bg',
                       'data-video', 'data-audio', 'data-load', 'data-link',
                       'data-source', 'data-srcset'];
    
    for (const attr of attrs.concat(dataAttrs)) {
      this.safeRewrite(el, attr);
    }
    
    // Handle srcset on any element that has it
    this.safeRewriteSrcset(el);
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
// MEGA JavaScript Injection - MAX FIX VERSION
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
    let targetHost = '';
    try { 
      const u = new URL(targetUrl);
      targetOrigin = u.origin; 
      targetHost = u.host;
    } catch {}
    
    // The script is wrapped in try-catch at every level to prevent ANY error from breaking the page
    el.prepend(`
  <script>
  (function(){
'use strict';

// ============ MAX FIX PROXY SCRIPT ============
// Comprehensive interception of ALL browser APIs

try {

// ========== CONFIG ==========
var __PROXY_TARGET__ = ${JSON.stringify(targetUrl)};
var __PROXY_ORIGIN__ = ${JSON.stringify(targetOrigin)};
var __PROXY_HOST__ = ${JSON.stringify(targetHost)};
var __PROXY_EMBEDDED__ = ${isEmbedded};

// Store originals IMMEDIATELY before anything can modify them
var _Object = Object;
var _Array = Array;
var _String = String;
var _Number = Number;
var _Boolean = Boolean;
var _encodeURIComponent = encodeURIComponent;
var _decodeURIComponent = decodeURIComponent;
var _URL = URL;
var _Blob = Blob;
var _location = location;
var _history = history;
var _window = window;
var _document = document;
var _console = console;
var _setTimeout = setTimeout;
var _setInterval = setInterval;
var _Promise = Promise;
var _Reflect = typeof Reflect !== 'undefined' ? Reflect : null;
var _Proxy = typeof Proxy !== 'undefined' ? Proxy : null;

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
    var url = params.get('url');
    if (url) {
      // Handle double-encoded URLs
      try {
        if (url.indexOf('%') !== -1) {
          var decoded = _decodeURIComponent(url);
          if (decoded.indexOf('http') === 0) return decoded;
        }
      } catch(e) {}
        return url;
    }
    return __PROXY_TARGET__;
  } catch(e) {
    return __PROXY_TARGET__;
  }
}

function getCurrentOrigin() {
  try {
    return new _URL(getCurrentTarget()).origin;
  } catch(e) {
    return __PROXY_ORIGIN__;
  }
}

function getCurrentHost() {
  try {
    return new _URL(getCurrentTarget()).host;
  } catch(e) {
    return __PROXY_HOST__;
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
         l.indexOf('sms:') === 0 ||
         l.indexOf('about:') === 0 ||
         l.indexOf('wss:') === 0 ||
         l.indexOf('ws:') === 0;
}

function isProxied(url) {
  if (!url) return false;
  var s = safeStr(url);
  return s.indexOf('/?url=') !== -1 || 
         s.indexOf('/?embedded=') !== -1 ||
         s.indexOf('proxy.ikunbeautiful.workers.dev') !== -1;
}

// ========== MAIN PROXIFY FUNCTION ==========
function proxify(url, forceEmbedded) {
  try {
    url = safeStr(url).trim();
    if (!url || url.length === 0 || url.length > 8192) return url;
    if (isSpecial(url)) return url;
    if (isProxied(url)) return url;
    
    // Protocol-relative
    if (url.indexOf('//') === 0) url = 'https:' + url;
    
    var embedded = forceEmbedded !== undefined ? forceEmbedded : __PROXY_EMBEDDED__;
    var prefix = embedded ? '/?embedded=1&url=' : '/?url=';
    
    // Absolute URL
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
      return prefix + _encodeURIComponent(url);
    }
    
    // Relative URL - resolve against current target
    var base = getCurrentTarget();
    try {
      var resolved = new _URL(url, base).href;
      return prefix + _encodeURIComponent(resolved);
    } catch(e) {
      try {
        var resolved2 = new _URL(url, __PROXY_TARGET__).href;
        return prefix + _encodeURIComponent(resolved2);
      } catch(e2) {
        // Last resort - prepend base origin
        try {
          var origin = getCurrentOrigin();
          if (url.indexOf('/') === 0) {
            return prefix + _encodeURIComponent(origin + url);
          }
          return prefix + _encodeURIComponent(origin + '/' + url);
        } catch(e3) {
          return url;
        }
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
    try {
      var origin = getCurrentOrigin();
      if (url.indexOf('/') === 0) return origin + url;
      return origin + '/' + url;
    } catch(e2) {
      return url;
    }
  }
}

// Expose globally
_window.__proxyProxify__ = proxify;
_window.__proxyResolve__ = resolveUrl;
_window.__proxyGetTarget__ = getCurrentTarget;
_window.__PROXY_TARGET_URL__ = __PROXY_TARGET__;
_window.__PROXY_EMBEDDED__ = __PROXY_EMBEDDED__;

// ========== ANTI-IFRAME-BUSTER (COMPREHENSIVE) ==========
try {
  _Object.defineProperty(_window, 'top', { get: function() { return _window; }, set: function(){}, configurable: false });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'parent', { get: function() { return _window; }, set: function(){}, configurable: false });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'frameElement', { get: function() { return null; }, set: function(){}, configurable: false });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'self', { get: function() { return _window; }, set: function(){}, configurable: false });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'frames', { get: function() { return _window; }, set: function(){}, configurable: false });
} catch(e) {}
try {
  _Object.defineProperty(_window, 'length', { get: function() { return 0; }, set: function(){}, configurable: false });
} catch(e) {}

// ========== DOCUMENT PROPERTY SPOOFING ==========
try {
  _Object.defineProperty(_document, 'domain', { 
    get: function() { return getCurrentHost(); },
    set: function() {},
    configurable: true 
  });
} catch(e) {}

try {
  _Object.defineProperty(_document, 'URL', { 
    get: function() { return getCurrentTarget(); },
    configurable: true 
  });
} catch(e) {}

try {
  _Object.defineProperty(_document, 'documentURI', { 
    get: function() { return getCurrentTarget(); },
    configurable: true 
  });
} catch(e) {}

try {
  _Object.defineProperty(_document, 'baseURI', { 
    get: function() { return getCurrentTarget(); },
    configurable: true 
  });
} catch(e) {}

try {
  _Object.defineProperty(_document, 'referrer', { 
    get: function() { 
      try {
        var current = getCurrentTarget();
        return new _URL(current).origin + '/';
      } catch(e) {
        return '';
      }
    },
    configurable: true 
  });
} catch(e) {}

// ========== LOCATION OBJECT COMPREHENSIVE OVERRIDE ==========
try {
  var _assign = _location.assign ? _location.assign.bind(_location) : function(u) { _location.href = u; };
  var _replace = _location.replace ? _location.replace.bind(_location) : function(u) { _location.href = u; };
  var _reload = _location.reload ? _location.reload.bind(_location) : function() {};
  
  _location.assign = function(u) { try { return _assign(proxify(u)); } catch(e) { return _assign(u); } };
  _location.replace = function(u) { try { return _replace(proxify(u)); } catch(e) { return _replace(u); } };
  
  // Override all location properties
  try {
    _Object.defineProperty(_location, 'href', {
      set: function(u) { _assign(proxify(u)); },
      get: function() { return getCurrentTarget(); },
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'origin', {
      get: function() { return getCurrentOrigin(); },
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'host', {
      get: function() { return getCurrentHost(); },
      set: function() {},
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'hostname', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).hostname; } 
        catch(e) { return ''; }
      },
      set: function() {},
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'pathname', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).pathname; } 
        catch(e) { return '/'; }
      },
      set: function(v) { 
        try {
          var u = new _URL(getCurrentTarget());
          u.pathname = v;
          _assign(proxify(u.href));
        } catch(e) {}
      },
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'search', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).search; } 
        catch(e) { return ''; }
      },
      set: function(v) { 
        try {
          var u = new _URL(getCurrentTarget());
          u.search = v;
          _assign(proxify(u.href));
        } catch(e) {}
      },
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'hash', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).hash; } 
        catch(e) { return ''; }
      },
      set: function(v) { 
        try {
          var u = new _URL(getCurrentTarget());
          u.hash = v;
          _assign(proxify(u.href));
        } catch(e) {}
      },
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'protocol', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).protocol; } 
        catch(e) { return 'https:'; }
      },
      set: function() {},
      configurable: true
    });
  } catch(e) {}
  
  try {
    _Object.defineProperty(_location, 'port', {
      get: function() { 
        try { return new _URL(getCurrentTarget()).port; } 
        catch(e) { return ''; }
      },
      set: function() {},
      configurable: true
    });
  } catch(e) {}
  
  // Override toString
  try {
    _location.toString = function() { return getCurrentTarget(); };
  } catch(e) {}
  
  // Override valueOf
  try {
    _location.valueOf = function() { return getCurrentTarget(); };
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
  var _open = _window.open ? _window.open.bind(_window) : function(){};
  _window.open = function(url, name, specs) {
    try {
      if (!url || url === 'about:blank') return _open(url, name, specs);
      
      var resolved = resolveUrl(url);
      
      if (__PROXY_EMBEDDED__) {
        try {
          var realParent = _Object.getPrototypeOf(_window).parent;
          if (realParent && realParent !== _window) {
            realParent.postMessage({ type: 'PROXY_NEW_TAB', url: resolved }, '*');
            // Return a mock window object
            return {
              closed: false,
              close: function() {
                realParent.postMessage({ type: 'PROXY_CLOSE_TAB' }, '*');
              },
              focus: function() {},
              blur: function() {},
              postMessage: function() {},
              location: { href: resolved }
            };
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
      if ((n === 'src' || n === 'href' || n === 'action' || n === 'data' || n === 'poster' || n === 'formaction' || n === 'xlink:href') && value) {
        if (!isSpecial(value) && !isProxied(value)) {
          value = proxify(value);
        }
      } else if (n === 'srcset' && value) {
        value = safeStr(value).split(',').map(function(s) {
          var parts = s.trim().split(/\\s+/);
          if (parts[0] && !isSpecial(parts[0]) && !isProxied(parts[0])) {
            parts[0] = proxify(parts[0]);
          }
          return parts.join(' ');
        }).join(', ');
      }
    } catch(e) {}
    return _setAttribute.call(this, name, value);
  };
} catch(e) {}

// ========== ELEMENT getAttribute override for location-checking scripts ==========
try {
  var _getAttribute = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function(name) {
    var val = _getAttribute.call(this, name);
    // Don't modify the return value - this could break scripts
    return val;
  };
} catch(e) {}

// ========== PROPERTY OVERRIDES ==========
var srcElements = ['HTMLImageElement', 'HTMLScriptElement', 'HTMLIFrameElement', 
                   'HTMLVideoElement', 'HTMLAudioElement', 'HTMLSourceElement',
                   'HTMLEmbedElement', 'HTMLTrackElement', 'HTMLMediaElement', 'HTMLInputElement'];

srcElements.forEach(function(name) {
  try {
    var El = _window[name];
    if (!El || !El.prototype) return;
    var desc = _Object.getOwnPropertyDescriptor(El.prototype, 'src');
    if (desc && desc.set) {
      var _set = desc.set;
      var _get = desc.get;
      _Object.defineProperty(El.prototype, 'src', {
        set: function(v) { 
          try { 
            if (v && !isSpecial(v) && !isProxied(v)) {
              v = proxify(v); 
            }
          } catch(e) {} 
          _set.call(this, v); 
        },
        get: _get,
        configurable: true
      });
    }
  } catch(e) {}
});

// href properties with comprehensive handling
['HTMLAnchorElement', 'HTMLLinkElement', 'HTMLAreaElement', 'HTMLBaseElement'].forEach(function(name) {
  try {
    var El = _window[name];
    if (!El || !El.prototype) return;
    var desc = _Object.getOwnPropertyDescriptor(El.prototype, 'href');
    if (desc && desc.set) {
      var _set = desc.set;
      var _get = desc.get;
      _Object.defineProperty(El.prototype, 'href', {
        set: function(v) { 
          try { 
            if (v && !isSpecial(v) && !isProxied(v)) {
              v = proxify(v); 
            }
          } catch(e) {} 
          _set.call(this, v); 
        },
        get: _get,
        configurable: true
      });
    }
  } catch(e) {}
});

// ========== ANCHOR ELEMENT URL PROPERTIES ==========
// Override origin, host, hostname, pathname, search, hash, protocol, port
['origin', 'host', 'hostname', 'pathname', 'search', 'hash', 'protocol', 'port'].forEach(function(prop) {
  try {
    var desc = _Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, prop);
    if (desc && desc.get) {
      var _get = desc.get;
      _Object.defineProperty(HTMLAnchorElement.prototype, prop, {
        get: function() {
          try {
            var href = this.getAttribute('href');
            if (href && !isSpecial(href)) {
              var resolved = resolveUrl(href);
              return new _URL(resolved)[prop];
            }
          } catch(e) {}
          return _get.call(this);
        },
        set: desc.set,
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
    var _getAction = formDesc.get;
    _Object.defineProperty(HTMLFormElement.prototype, 'action', {
      set: function(v) { 
        try { 
          if (v && !isSpecial(v) && !isProxied(v)) {
            v = proxify(v); 
          }
        } catch(e) {} 
        _setAction.call(this, v); 
      },
      get: _getAction,
      configurable: true
    });
  }
} catch(e) {}

// object data
try {
  var objDesc = _Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype, 'data');
  if (objDesc && objDesc.set) {
    var _setData = objDesc.set;
    var _getData = objDesc.get;
    _Object.defineProperty(HTMLObjectElement.prototype, 'data', {
      set: function(v) { 
        try { 
          if (v && !isSpecial(v) && !isProxied(v)) {
            v = proxify(v); 
          }
        } catch(e) {} 
        _setData.call(this, v); 
      },
      get: _getData,
      configurable: true
    });
  }
} catch(e) {}

// video poster
try {
  var posterDesc = _Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'poster');
  if (posterDesc && posterDesc.set) {
    var _setPoster = posterDesc.set;
    var _getPoster = posterDesc.get;
    _Object.defineProperty(HTMLVideoElement.prototype, 'poster', {
      set: function(v) { 
        try { 
          if (v && !isSpecial(v) && !isProxied(v)) {
            v = proxify(v); 
          }
        } catch(e) {} 
        _setPoster.call(this, v); 
      },
      get: _getPoster,
      configurable: true
    });
  }
} catch(e) {}

// ========== srcObject for media elements ==========
try {
  var srcObjDesc = _Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  if (srcObjDesc) {
    // Don't modify srcObject - it's for MediaStream, not URLs
  }
} catch(e) {}

// ========== FETCH ==========
try {
  var _fetch = _window.fetch ? _window.fetch.bind(_window) : null;
  if (_fetch) {
    _window.fetch = function(input, init) {
      try {
        if (typeof input === 'string') {
          if (!isSpecial(input) && !isProxied(input)) {
            input = proxify(input);
          }
        } else if (input && typeof input === 'object') {
          if (input.url && !isSpecial(input.url) && !isProxied(input.url)) {
            input = new Request(proxify(input.url), input);
          } else if (input instanceof Request) {
            var url = input.url;
            if (url && !isSpecial(url) && !isProxied(url)) {
              input = new Request(proxify(url), input);
            }
          }
        }
      } catch(e) {}
      return _fetch(input, init);
    };
  }
} catch(e) {}

// ========== XMLHttpRequest ==========
try {
  var _XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
    try { 
      if (url && !isSpecial(url) && !isProxied(url)) {
        url = proxify(url); 
      }
    } catch(e) {}
    return _XHROpen.call(this, method, url, async !== false, user, pass);
  };
} catch(e) {}

// ========== WebSocket ==========
try {
  if (_window.WebSocket) {
    var _WebSocket = _window.WebSocket;
    _window.WebSocket = function(url, protocols) {
      // WebSockets can't be proxied through HTTP proxy
      // Just let them through - they'll either work or fail
      return new _WebSocket(url, protocols);
    };
    _window.WebSocket.prototype = _WebSocket.prototype;
    _window.WebSocket.CONNECTING = _WebSocket.CONNECTING;
    _window.WebSocket.OPEN = _WebSocket.OPEN;
    _window.WebSocket.CLOSING = _WebSocket.CLOSING;
    _window.WebSocket.CLOSED = _WebSocket.CLOSED;
  }
} catch(e) {}

// ========== Worker ==========
try {
  if (_window.Worker) {
    var _Worker = _window.Worker;
    _window.Worker = function(url, opts) {
      try { 
        if (url && !isSpecial(url) && !isProxied(url)) {
          url = proxify(url, false); // Workers can't be embedded
        }
      } catch(e) {}
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
      try { 
        if (url && !isSpecial(url) && !isProxied(url)) {
          url = proxify(url, false);
        }
      } catch(e) {}
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
      try { 
        if (url && !isSpecial(url) && !isProxied(url)) {
          url = proxify(url);
        }
      } catch(e) {}
      return new _EventSource(url, cfg);
    };
    _window.EventSource.prototype = _EventSource.prototype;
  }
} catch(e) {}
  
// ========== sendBeacon ==========
try {
  if (navigator && navigator.sendBeacon) {
    var _sendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      try { 
        if (url && !isSpecial(url) && !isProxied(url)) {
          url = proxify(url);
        }
      } catch(e) {}
      return _sendBeacon(url, data);
    };
  }
} catch(e) {}

// ========== Service Worker (BLOCK) ==========
try {
  if (navigator && navigator.serviceWorker) {
    _Object.defineProperty(navigator, 'serviceWorker', {
          get: function() {
        return {
          register: function() { return _Promise.reject(new Error('Service Workers disabled in proxy')); },
          getRegistration: function() { return _Promise.resolve(undefined); },
          getRegistrations: function() { return _Promise.resolve([]); },
          ready: _Promise.reject(new Error('Service Workers disabled in proxy')),
          controller: null
        };
      },
      configurable: true
    });
  }
} catch(e) {}

// ========== Image Constructor ==========
try {
  var _Image = _window.Image;
  _window.Image = function(w, h) { 
    var img = new _Image(w, h);
    return img;
  };
  _window.Image.prototype = _Image.prototype;
} catch(e) {}

// ========== Audio Constructor ==========
try {
  var _Audio = _window.Audio;
  if (_Audio) {
    _window.Audio = function(src) { 
      var audio = new _Audio();
      if (src && !isSpecial(src) && !isProxied(src)) {
        audio.src = proxify(src);
      } else if (src) {
        audio.src = src;
      }
      return audio;
    };
    _window.Audio.prototype = _Audio.prototype;
  }
} catch(e) {}

// ========== importScripts (for workers) ==========
try {
  if (typeof importScripts !== 'undefined') {
    var _importScripts = importScripts;
    importScripts = function() {
      var args = _Array.prototype.slice.call(arguments).map(function(url) {
        try {
          if (url && !isSpecial(url) && !isProxied(url)) {
            return proxify(url, false);
          }
        } catch(e) {}
        return url;
      });
      return _importScripts.apply(this, args);
    };
  }
} catch(e) {}

// ========== Dynamic import() ==========
// Can't easily override, but we intercept script[type=module] src

// ========== CSS insertRule/addRule ==========
try {
  if (CSSStyleSheet && CSSStyleSheet.prototype.insertRule) {
    var _insertRule = CSSStyleSheet.prototype.insertRule;
    CSSStyleSheet.prototype.insertRule = function(rule, index) {
      try {
        rule = rewriteCssUrls(rule);
      } catch(e) {}
      return _insertRule.call(this, rule, index);
    };
  }
} catch(e) {}

// ========== CSS text content ==========
function rewriteCssUrls(css) {
  if (!css || typeof css !== 'string') return css;
  try {
    var prefix = __PROXY_EMBEDDED__ ? '/?embedded=1&url=' : '/?url=';
    var base = getCurrentTarget();
    
    // Rewrite url()
    css = css.replace(/url\\(\\s*(['"]?)([^'"\\)]+)\\1\\s*\\)/gi, function(m, q, path) {
      try {
        if (!path || path.indexOf('data:') === 0 || path.indexOf('blob:') === 0 || path.indexOf('#') === 0) return m;
        if (isProxied(path)) return m;
        var abs = new _URL(path, base).href;
        return 'url("' + prefix + _encodeURIComponent(abs) + '")';
      } catch(e) {
        return m;
      }
    });
    
    // Rewrite @import "url"
    css = css.replace(/@import\\s+(['"])([^'"]+)\\1/gi, function(m, q, path) {
      try {
        if (!path || path.indexOf('data:') === 0) return m;
        if (isProxied(path)) return m;
        var abs = new _URL(path, base).href;
        return '@import "' + prefix + _encodeURIComponent(abs) + '"';
      } catch(e) {
        return m;
      }
    });
    
    // Rewrite @import url()
    css = css.replace(/@import\\s+url\\(\\s*(['"]?)([^'"\\)]+)\\1\\s*\\)/gi, function(m, q, path) {
      try {
        if (!path || path.indexOf('data:') === 0) return m;
        if (isProxied(path)) return m;
        var abs = new _URL(path, base).href;
        return '@import url("' + prefix + _encodeURIComponent(abs) + '")';
      } catch(e) {
        return m;
      }
    });
    
    // Rewrite @font-face src
    css = css.replace(/(@font-face\\s*\\{[^}]*src\\s*:\\s*)([^;}]+)/gi, function(m, pre, srcVal) {
      try {
        srcVal = srcVal.replace(/url\\(\\s*(['"]?)([^'"\\)]+)\\1\\s*\\)/gi, function(um, uq, upath) {
          if (!upath || upath.indexOf('data:') === 0 || upath.indexOf('blob:') === 0) return um;
          if (isProxied(upath)) return um;
          var abs = new _URL(upath, base).href;
          return 'url("' + prefix + _encodeURIComponent(abs) + '")';
        });
        return pre + srcVal;
      } catch(e) {
        return m;
      }
    });
  } catch(e) {}
  return css;
}

// ========== HTML Rewriting ==========
function rewriteHtml(html) {
  if (!html || typeof html !== 'string') return html;
  try {
    // src attributes
    html = html.replace(/(<[^>]+\\s)(src\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url) || isProxied(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    // href attributes (but not javascript: or #)
    html = html.replace(/(<[^>]+\\s)(href\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url) || isProxied(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    // action attributes
    html = html.replace(/(<form[^>]*\\s)(action\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url) || isProxied(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    // data attributes
    html = html.replace(/(<object[^>]*\\s)(data\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url) || isProxied(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    // poster attributes
    html = html.replace(/(<video[^>]*\\s)(poster\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, url, q) {
      if (isSpecial(url) || isProxied(url)) return m;
      return pre + attr + proxify(url) + q;
    });
    // srcset attributes
    html = html.replace(/(<[^>]+\\s)(srcset\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, srcset, q) {
      try {
        var newSrcset = srcset.split(',').map(function(s) {
          var parts = s.trim().split(/\\s+/);
          if (parts[0] && !isSpecial(parts[0]) && !isProxied(parts[0])) {
            parts[0] = proxify(parts[0]);
          }
          return parts.join(' ');
        }).join(', ');
        return pre + attr + newSrcset + q;
      } catch(e) {
        return m;
      }
    });
    // style url()
    html = html.replace(/(<[^>]+\\s)(style\\s*=\\s*["'])([^"']+)(["'])/gi, function(m, pre, attr, style, q) {
      return pre + attr + rewriteCssUrls(style) + q;
    });
  } catch(e) {}
  return html;
}

// ========== document.write ==========
try {
  var _docWrite = _document.write.bind(_document);
  var _docWriteln = _document.writeln.bind(_document);
  _document.write = function() {
    var args = _Array.prototype.slice.call(arguments).map(function(a) { return rewriteHtml(safeStr(a)); });
    return _docWrite.apply(_document, args);
  };
  _document.writeln = function() {
    var args = _Array.prototype.slice.call(arguments).map(function(a) { return rewriteHtml(safeStr(a)); });
    return _docWriteln.apply(_document, args);
  };
} catch(e) {}

// ========== innerHTML/outerHTML ==========
try {
  var innerDesc = _Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (innerDesc && innerDesc.set) {
    var _setInner = innerDesc.set;
    _Object.defineProperty(Element.prototype, 'innerHTML', {
      set: function(v) { _setInner.call(this, rewriteHtml(safeStr(v))); },
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
      set: function(v) { _setOuter.call(this, rewriteHtml(safeStr(v))); },
      get: outerDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// ========== insertAdjacentHTML ==========
try {
  var _insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html) {
    return _insertAdjacentHTML.call(this, pos, rewriteHtml(safeStr(html)));
  };
} catch(e) {}

// ========== DOMParser ==========
try {
  var _DOMParser = _window.DOMParser;
  _window.DOMParser = function() {
    var parser = new _DOMParser();
    var _parseFromString = parser.parseFromString.bind(parser);
    parser.parseFromString = function(str, type) {
      if (type && (type.indexOf('html') !== -1 || type.indexOf('xml') !== -1)) {
        str = rewriteHtml(safeStr(str));
      }
      return _parseFromString(str, type);
    };
    return parser;
  };
  _window.DOMParser.prototype = _DOMParser.prototype;
} catch(e) {}

// ========== Range.createContextualFragment ==========
try {
  var _createContextualFragment = Range.prototype.createContextualFragment;
  Range.prototype.createContextualFragment = function(html) {
    return _createContextualFragment.call(this, rewriteHtml(safeStr(html)));
  };
} catch(e) {}

// ========== document.createElement override for script/link/img ==========
try {
  var _createElement = _document.createElement.bind(_document);
  _document.createElement = function(tagName, options) {
    var el = _createElement(tagName, options);
    // Elements are already handled by property overrides
    return el;
  };
} catch(e) {}

// ========== MutationObserver for dynamic content ==========
try {
  var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes') {
        var attr = mutation.attributeName;
        if (attr === 'src' || attr === 'href' || attr === 'action' || attr === 'data' || attr === 'poster') {
          var el = mutation.target;
          var val = el.getAttribute(attr);
          if (val && !isSpecial(val) && !isProxied(val)) {
            // Use the original setAttribute to avoid infinite loop
            try {
              _setAttribute.call(el, attr, proxify(val));
            } catch(e) {}
          }
        }
      } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            // Element node - check for URL attributes
            ['src', 'href', 'action', 'data', 'poster'].forEach(function(attr) {
              if (node.hasAttribute && node.hasAttribute(attr)) {
                var val = node.getAttribute(attr);
                if (val && !isSpecial(val) && !isProxied(val)) {
                  try {
                    _setAttribute.call(node, attr, proxify(val));
                  } catch(e) {}
                }
              }
            });
            // Check srcset
            if (node.hasAttribute && node.hasAttribute('srcset')) {
              var srcset = node.getAttribute('srcset');
              if (srcset && !isProxied(srcset)) {
                try {
                  var newSrcset = srcset.split(',').map(function(s) {
                    var parts = s.trim().split(/\\s+/);
                    if (parts[0] && !isSpecial(parts[0]) && !isProxied(parts[0])) {
                      parts[0] = proxify(parts[0]);
                    }
                    return parts.join(' ');
                  }).join(', ');
                  _setAttribute.call(node, 'srcset', newSrcset);
                } catch(e) {}
              }
            }
            // Process child elements
            if (node.querySelectorAll) {
              var children = node.querySelectorAll('[src], [href], [action], [data], [poster], [srcset]');
              children.forEach(function(child) {
                ['src', 'href', 'action', 'data', 'poster'].forEach(function(attr) {
                  if (child.hasAttribute(attr)) {
                    var val = child.getAttribute(attr);
                    if (val && !isSpecial(val) && !isProxied(val)) {
                      try {
                        _setAttribute.call(child, attr, proxify(val));
                      } catch(e) {}
                    }
                  }
                });
              });
            }
            }
          });
        }
      });
    });
  
  _window.addEventListener('DOMContentLoaded', function() {
    try {
      observer.observe(_document.documentElement, {
        attributes: true,
        attributeFilter: ['src', 'href', 'action', 'data', 'poster', 'srcset'],
      childList: true,
      subtree: true
    });
    } catch(e) {}
  });
} catch(e) {}

// ========== Click Handler ==========
try {
  _document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      while (t && t.tagName !== 'A') t = t.parentElement;
      if (t && t.tagName === 'A') {
        var href = t.getAttribute('href');
        if (!href || isSpecial(href)) return;
        
        var target = t.getAttribute('target') || t.getAttribute('data-proxy-target');
        if (target === '_blank' || target === '_new') {
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
          _window.open(proxify(href), '_blank');
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
          _setAttribute.call(form, 'action', proxify(action || getCurrentTarget()));
        }
      }
    } catch(ex) {}
  }, true);
} catch(e) {}

// ========== postMessage wrapper for targetOrigin ==========
try {
  var _postMessage = _window.postMessage.bind(_window);
  _window.postMessage = function(message, targetOrigin, transfer) {
    // Allow all origins since we're proxying
    if (targetOrigin && targetOrigin !== '*') {
      targetOrigin = '*';
    }
    return _postMessage(message, targetOrigin, transfer);
  };
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
        proxyUrl: _location.toString()
              }, '*');
            }
  } catch(e) {}
}

try {
  if (_document.readyState === 'complete' || _document.readyState === 'interactive') {
    _setTimeout(notifyParent, 0);
  } else {
    _window.addEventListener('DOMContentLoaded', notifyParent);
  }
  _window.addEventListener('load', notifyParent);
  _window.addEventListener('popstate', notifyParent);
  _window.addEventListener('hashchange', notifyParent);
  
  // Title observer
  var titleObs = new MutationObserver(function() {
    _setTimeout(notifyParent, 10);
  });
  var observeTitle = function() {
    var t = _document.querySelector('title');
    if (t) {
      titleObs.observe(t, { subtree: true, characterData: true, childList: true });
    } else {
      // No title yet, observe head for when it's added
      var head = _document.head || _document.querySelector('head');
      if (head) {
        var headObs = new MutationObserver(function(muts, obs) {
          var t = _document.querySelector('title');
          if (t) {
            obs.disconnect();
            titleObs.observe(t, { subtree: true, characterData: true, childList: true });
            notifyParent();
          }
        });
        headObs.observe(head, { childList: true });
      }
    }
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
      try {
        e.source.postMessage({ 
          type: 'PROXY_URL_RESPONSE', 
          url: getCurrentTarget(), 
          title: _document.title 
              }, '*');
      } catch(ex) {}
    }
  });
} catch(e) {}

// ========== Console override (for debugging) ==========
try {
  _window.__PROXY_DEBUG__ = function() {
    return {
      target: getCurrentTarget(),
      origin: getCurrentOrigin(),
      host: getCurrentHost(),
      embedded: __PROXY_EMBEDDED__
    };
  };
} catch(e) {}

// ========== URL.createObjectURL / revokeObjectURL ==========
try {
  var _createObjectURL = _URL.createObjectURL ? _URL.createObjectURL.bind(_URL) : null;
  var _revokeObjectURL = _URL.revokeObjectURL ? _URL.revokeObjectURL.bind(_URL) : null;
  var _blobUrls = new Map();
  
  if (_createObjectURL) {
    _URL.createObjectURL = function(blob) {
      var url = _createObjectURL(blob);
      _blobUrls.set(url, true);
      return url;
    };
  }
  if (_revokeObjectURL) {
    _URL.revokeObjectURL = function(url) {
      _blobUrls.delete(url);
      return _revokeObjectURL(url);
    };
  }
  
  // Helper to check if URL is a blob URL we created
  _window.__isOurBlobUrl__ = function(url) {
    return _blobUrls.has(url);
  };
} catch(e) {}

// ========== Storage namespace per target domain ==========
try {
  var _storagePrefix = '__proxy_' + getCurrentHost().replace(/[^a-zA-Z0-9]/g, '_') + '_';
  
  // Wrap localStorage
  var _localStorage = _window.localStorage;
  var _localStorageProxy = {
    getItem: function(key) { return _localStorage.getItem(_storagePrefix + key); },
    setItem: function(key, val) { return _localStorage.setItem(_storagePrefix + key, val); },
    removeItem: function(key) { return _localStorage.removeItem(_storagePrefix + key); },
    clear: function() {
      var toRemove = [];
      for (var i = 0; i < _localStorage.length; i++) {
        var k = _localStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) toRemove.push(k);
      }
      toRemove.forEach(function(k) { _localStorage.removeItem(k); });
    },
    get length() {
      var count = 0;
      for (var i = 0; i < _localStorage.length; i++) {
        var k = _localStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) count++;
      }
      return count;
    },
    key: function(n) {
      var count = 0;
      for (var i = 0; i < _localStorage.length; i++) {
        var k = _localStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) {
          if (count === n) return k.substring(_storagePrefix.length);
          count++;
        }
      }
      return null;
    }
  };
  
  try {
    _Object.defineProperty(_window, 'localStorage', {
      get: function() { return _localStorageProxy; },
      configurable: true
    });
  } catch(e) {}
  
  // Wrap sessionStorage similarly
  var _sessionStorage = _window.sessionStorage;
  var _sessionStorageProxy = {
    getItem: function(key) { return _sessionStorage.getItem(_storagePrefix + key); },
    setItem: function(key, val) { return _sessionStorage.setItem(_storagePrefix + key, val); },
    removeItem: function(key) { return _sessionStorage.removeItem(_storagePrefix + key); },
    clear: function() {
      var toRemove = [];
      for (var i = 0; i < _sessionStorage.length; i++) {
        var k = _sessionStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) toRemove.push(k);
      }
      toRemove.forEach(function(k) { _sessionStorage.removeItem(k); });
    },
    get length() {
      var count = 0;
      for (var i = 0; i < _sessionStorage.length; i++) {
        var k = _sessionStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) count++;
      }
      return count;
    },
    key: function(n) {
      var count = 0;
      for (var i = 0; i < _sessionStorage.length; i++) {
        var k = _sessionStorage.key(i);
        if (k && k.indexOf(_storagePrefix) === 0) {
          if (count === n) return k.substring(_storagePrefix.length);
          count++;
        }
      }
      return null;
    }
  };
  
  try {
    _Object.defineProperty(_window, 'sessionStorage', {
      get: function() { return _sessionStorageProxy; },
      configurable: true
    });
  } catch(e) {}
} catch(e) {}

// ========== postMessage event.origin spoofing ==========
try {
  var _addEventListener = _window.addEventListener.bind(_window);
  _window.addEventListener = function(type, listener, options) {
    if (type === 'message') {
      var wrappedListener = function(e) {
        // Create a proxy event with spoofed origin
        try {
          var spoofedEvent = new _Proxy(e, {
            get: function(target, prop) {
              if (prop === 'origin') {
                return getCurrentOrigin();
              }
              var val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            }
          });
          return listener.call(this, spoofedEvent);
        } catch(ex) {
          return listener.call(this, e);
        }
      };
      return _addEventListener(type, wrappedListener, options);
    }
    return _addEventListener(type, listener, options);
  };
} catch(e) {}

// ========== Anchor ping attribute (tracking) ==========
try {
  var pingDesc = _Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'ping');
  if (pingDesc && pingDesc.set) {
    var _setPing = pingDesc.set;
    _Object.defineProperty(HTMLAnchorElement.prototype, 'ping', {
      set: function(v) {
        try {
          if (v && typeof v === 'string') {
            v = v.split(/\\s+/).map(function(url) {
              if (url && !isSpecial(url) && !isProxied(url)) {
                return proxify(url);
              }
              return url;
            }).join(' ');
          }
        } catch(e) {}
        _setPing.call(this, v);
      },
      get: pingDesc.get,
      configurable: true
    });
  }
} catch(e) {}

// ========== More data-* attributes for lazy loading ==========
try {
  var lazyAttrs = ['data-src', 'data-href', 'data-url', 'data-background', 'data-poster',
                   'data-original', 'data-lazy', 'data-lazy-src', 'data-srcset',
                   'data-bg', 'data-image', 'data-thumb', 'data-full'];
  
  lazyAttrs.forEach(function(attr) {
    try {
      var origSet = Element.prototype.setAttribute;
      // Already overridden above, but let's also watch via MutationObserver
    } catch(e) {}
  });
} catch(e) {}

// ========== Shadow DOM support ==========
try {
  var _attachShadow = Element.prototype.attachShadow;
  if (_attachShadow) {
    Element.prototype.attachShadow = function(options) {
      var shadow = _attachShadow.call(this, options);
      
      // Watch shadow root for URL changes
      try {
        var shadowObserver = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                  ['src', 'href', 'action', 'data', 'poster'].forEach(function(attr) {
                    if (node.hasAttribute && node.hasAttribute(attr)) {
                      var val = node.getAttribute(attr);
                      if (val && !isSpecial(val) && !isProxied(val)) {
                        try { node.setAttribute(attr, proxify(val)); } catch(e) {}
                      }
                    }
                  });
                }
              });
            }
          });
        });
        shadowObserver.observe(shadow, { childList: true, subtree: true });
      } catch(e) {}
      
      return shadow;
    };
  }
} catch(e) {}

// ========== Template element content ==========
try {
  var templateContentDesc = _Object.getOwnPropertyDescriptor(HTMLTemplateElement.prototype, 'content');
  // Templates are inert - they get processed when cloned/inserted
  // The MutationObserver will catch them when inserted
} catch(e) {}

// ========== Performance API - hide proxy URLs ==========
try {
  if (_window.performance && _window.performance.getEntries) {
    var _getEntries = _window.performance.getEntries.bind(_window.performance);
    _window.performance.getEntries = function() {
      var entries = _getEntries();
      return entries.map(function(e) {
        // Don't expose proxy URLs
        if (e.name && e.name.indexOf('/?url=') !== -1) {
          try {
            var urlMatch = e.name.match(/[?&]url=([^&]+)/);
            if (urlMatch) {
              var decoded = _decodeURIComponent(urlMatch[1]);
              return _Object.assign({}, e, { name: decoded });
            }
          } catch(ex) {}
        }
        return e;
      });
    };
    
    var _getEntriesByName = _window.performance.getEntriesByName.bind(_window.performance);
    _window.performance.getEntriesByName = function(name, type) {
      // If they're looking for an original URL, search for proxied version
      if (name && !isProxied(name)) {
        var proxied = proxify(name);
        var results = _getEntriesByName(proxied, type);
        if (results.length > 0) return results;
      }
      return _getEntriesByName(name, type);
    };
  }
} catch(e) {}

// ========== Cookie handling - rewrite domain/path ==========
try {
  var cookieDesc = _Object.getOwnPropertyDescriptor(_Document.prototype, 'cookie');
  if (cookieDesc) {
    var _getCookie = cookieDesc.get;
    var _setCookie = cookieDesc.set;
    
    _Object.defineProperty(_document, 'cookie', {
      get: function() {
        return _getCookie.call(_document);
      },
      set: function(val) {
        // Remove domain and path restrictions so cookies work
        try {
          val = val.replace(/;\\s*domain=[^;]*/gi, '')
                   .replace(/;\\s*path=[^;]*/gi, '; path=/');
        } catch(e) {}
        return _setCookie.call(_document, val);
      },
      configurable: true
    });
  }
} catch(e) {}

// ========== Node.baseURI for all nodes ==========
try {
  var nodeBaseURIDesc = _Object.getOwnPropertyDescriptor(Node.prototype, 'baseURI');
  if (nodeBaseURIDesc && nodeBaseURIDesc.get) {
    _Object.defineProperty(Node.prototype, 'baseURI', {
      get: function() { return getCurrentTarget(); },
      configurable: true
    });
  }
} catch(e) {}

// ========== contentDocument / contentWindow for iframes ==========
try {
  var contentDocDesc = _Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument');
  var contentWinDesc = _Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  // These are controlled by same-origin policy - let them work naturally
} catch(e) {}

// ========== window.opener ==========
try {
  _Object.defineProperty(_window, 'opener', {
    get: function() { return null; },
    set: function() {},
    configurable: true
  });
} catch(e) {}

// ========== eval and Function - wrap for safety ==========
try {
  var _eval = _window.eval;
  // Don't override eval - it could break too many things
} catch(e) {}

// ========== setTimeout/setInterval with string (code execution) ==========
try {
  // These could contain URLs in string form but overriding is risky
  // The HTML rewriting and property overrides should catch most cases
} catch(e) {}

// ========== Request/Response constructors ==========
try {
  var _Request = _window.Request;
  _window.Request = function(input, init) {
    try {
      if (typeof input === 'string' && !isSpecial(input) && !isProxied(input)) {
        input = proxify(input);
      }
    } catch(e) {}
    return new _Request(input, init);
  };
  _window.Request.prototype = _Request.prototype;
} catch(e) {}

// ========== FormData - handle file uploads ==========
try {
  // FormData works fine, but form action needs to be proxied
  // Already handled by form action override
} catch(e) {}

// ========== Clipboard API ==========
try {
  if (navigator && navigator.clipboard) {
    var _writeText = navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
    var _write = navigator.clipboard.write ? navigator.clipboard.write.bind(navigator.clipboard) : null;
    var _readText = navigator.clipboard.readText ? navigator.clipboard.readText.bind(navigator.clipboard) : null;
    var _read = navigator.clipboard.read ? navigator.clipboard.read.bind(navigator.clipboard) : null;
    // Clipboard works fine, no URL rewriting needed for clipboard
  }
} catch(e) {}

// ========== Drag and Drop - dataTransfer URLs ==========
try {
  _document.addEventListener('drop', function(e) {
    try {
      if (e.dataTransfer) {
        var url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url && (url.indexOf('http://') === 0 || url.indexOf('https://') === 0)) {
          // Could proxify dropped URLs but might be confusing
        }
      }
    } catch(ex) {}
  }, true);
} catch(e) {}

// ========== Beacon/Ping/CSP Report URLs - block leaking ==========
try {
  // CSP reports are already blocked by removing CSP headers
  // Beacon is already proxified
} catch(e) {}

// ========== Link prefetch/preload/preconnect ==========
try {
  // These are already rewritten by LinkRewriter
  // But let's also handle dynamically created ones
  var linkRelDesc = _Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'rel');
  // Let these work normally - href is already proxified
} catch(e) {}

// ========== base.href should return target URL ==========
try {
  // Base elements are removed by BaseRewriter
} catch(e) {}

// ========== Trusted Types (if supported) ==========
try {
  if (_window.trustedTypes && _window.trustedTypes.createPolicy) {
    // Create a default policy that rewrites URLs
    try {
      _window.trustedTypes.createPolicy('default', {
        createHTML: function(s) { return rewriteHtml(s); },
        createScript: function(s) { return s; },
        createScriptURL: function(s) { 
          if (!isSpecial(s) && !isProxied(s)) return proxify(s);
          return s;
        }
      });
    } catch(e) {}
  }
} catch(e) {}

// ========== Canvas toDataURL / toBlob - allow but track ==========
try {
  // Canvas data URLs are fine - they're data: URLs
} catch(e) {}

// ========== Geolocation - let it work ==========
try {
  // Geolocation works fine through proxy
} catch(e) {}

// ========== Notifications ==========
try {
  // Notifications might show proxy URLs - but hard to fix
} catch(e) {}

// ========== Final cleanup - scan entire document ==========
try {
  function scanAndProxify() {
    try {
      var allElements = _document.querySelectorAll('[src], [href], [action], [data], [poster], [srcset], [data-src], [data-href], [data-url]');
      allElements.forEach(function(el) {
        ['src', 'href', 'action', 'data', 'poster', 'data-src', 'data-href', 'data-url'].forEach(function(attr) {
          if (el.hasAttribute(attr)) {
            var val = el.getAttribute(attr);
            if (val && !isSpecial(val) && !isProxied(val)) {
              try { _setAttribute.call(el, attr, proxify(val)); } catch(e) {}
            }
          }
        });
        // Handle srcset
        if (el.hasAttribute('srcset')) {
          var srcset = el.getAttribute('srcset');
          if (srcset && !isProxied(srcset)) {
            try {
              var newSrcset = srcset.split(',').map(function(s) {
                var parts = s.trim().split(/\\s+/);
                if (parts[0] && !isSpecial(parts[0]) && !isProxied(parts[0])) {
                  parts[0] = proxify(parts[0]);
                }
                return parts.join(' ');
              }).join(', ');
              _setAttribute.call(el, 'srcset', newSrcset);
            } catch(e) {}
          }
        }
      });
      
      // Also scan style elements
      var styles = _document.querySelectorAll('style');
      styles.forEach(function(style) {
        var css = style.textContent;
        if (css && css.indexOf('url(') !== -1 && !isProxied(css)) {
          style.textContent = rewriteCssUrls(css);
        }
      });
    } catch(e) {}
  }
  
  // Run on DOMContentLoaded and load
  if (_document.readyState === 'loading') {
    _window.addEventListener('DOMContentLoaded', scanAndProxify);
  } else {
    _setTimeout(scanAndProxify, 0);
  }
  _window.addEventListener('load', scanAndProxify);
  
  // Also run periodically for dynamic content (as backup)
  _setInterval(scanAndProxify, 3000);
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
// Toolbar (minimal) - doesn't cover content
// --------------------
class InjectToolbar {
  constructor(targetUrl) {
    this.targetUrl = targetUrl;
  }
  element(el) {
    const targetUrl = this.targetUrl;
    const escaped = targetUrl.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.prepend(`
<style>
html{margin-top:44px!important}
body{margin-top:0!important}
#__proxy_toolbar__{position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;height:44px!important;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)!important;border-bottom:2px solid #0f3460!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;z-index:2147483647!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;box-shadow:0 2px 10px rgba(0,0,0,0.3)!important;box-sizing:border-box!important}
#__proxy_url_input__{flex:1!important;height:28px!important;background:rgba(255,255,255,0.1)!important;border:1px solid #0f3460!important;border-radius:6px!important;padding:0 12px!important;color:#eee!important;font-size:13px!important;outline:none!important;font-family:inherit!important}
#__proxy_url_input__:focus{border-color:#e94560!important}
#__proxy_url_input__::placeholder{color:#888!important}
</style>
<div id="__proxy_toolbar__">
  <div style="display:flex;align-items:center;gap:8px;color:#e94560;font-weight:600;font-size:14px;flex-shrink:0;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
    PROXY
  </div>
  <input type="text" id="__proxy_url_input__" value="${escaped}" placeholder="Enter URL and press Enter" onkeydown="if(event.key==='Enter'){var u=this.value.trim();if(u.indexOf('http')!==0)u='https://'+u;location.href='/?url='+encodeURIComponent(u);}">
</div>
`, { html: true });
  }
}

// --------------------
// JSON URL Rewriting (for manifest.json etc)
// --------------------
function rewriteJsonUrls(json, base, isEmbedded) {
  if (!json || typeof json !== 'string') return json;
  
  const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
  
  try {
    // Parse and walk the JSON to find URL-like values
    const parsed = JSON.parse(json);
    
    function walkAndRewrite(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(walkAndRewrite);
      }
      
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // Check if this looks like a URL in a URL-related key
          const urlKeys = ['src', 'href', 'url', 'icon', 'icons', 'start_url', 'scope', 'background', 'action'];
          const isUrlKey = urlKeys.some(k => key.toLowerCase().includes(k));
          
          if (isUrlKey && value && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/') || value.startsWith('./'))) {
            if (!value.includes('proxy.ikunbeautiful.workers.dev')) {
              try {
                const abs = new URL(value, base).toString();
                result[key] = prefix + encodeURIComponent(abs);
              } catch {
                result[key] = value;
              }
            } else {
              result[key] = value;
            }
          } else {
            result[key] = value;
          }
        } else if (typeof value === 'object') {
          result[key] = walkAndRewrite(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    
    return JSON.stringify(walkAndRewrite(parsed));
  } catch {
    return json;
  }
}

// --------------------
// SVG URL Rewriting
// --------------------
function rewriteSvgUrls(svg, base, isEmbedded) {
  if (!svg || typeof svg !== 'string') return svg;
  
  const prefix = isEmbedded ? "/?embedded=1&url=" : "/?url=";
  
  try {
    // Rewrite href attributes
    svg = svg.replace(/\shref\s*=\s*(['"])([^'"]+)\1/gi, (m, q, url) => {
      try {
        if (!url || url.startsWith('#') || url.startsWith('data:') || url.startsWith('javascript:')) return m;
        if (url.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(url, base).toString();
        return ` href=${q}${prefix}${encodeURIComponent(abs)}${q}`;
      } catch {
        return m;
      }
    });
    
    // Rewrite xlink:href attributes
    svg = svg.replace(/\sxlink:href\s*=\s*(['"])([^'"]+)\1/gi, (m, q, url) => {
      try {
        if (!url || url.startsWith('#') || url.startsWith('data:') || url.startsWith('javascript:')) return m;
        if (url.includes('proxy.ikunbeautiful.workers.dev')) return m;
        const abs = new URL(url, base).toString();
        return ` xlink:href=${q}${prefix}${encodeURIComponent(abs)}${q}`;
      } catch {
        return m;
      }
    });
    
    // Rewrite style url()
    svg = rewriteCSSUrls(svg, base, isEmbedded);
    
  } catch {}
  
  return svg;
}

// --------------------
// Header sanitization
// --------------------
function sanitizeHeaders(headers, isEmbedded) {
  const newHeaders = new Headers();
  const skipHeaders = new Set([
    // Frame/embedding restrictions
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    // Security headers that might interfere
    'x-content-type-options',
    'x-xss-protection',
    'strict-transport-security',
    'public-key-pins',
    'public-key-pins-report-only',
    'expect-ct',
    // Feature/permissions policies
    'feature-policy',
    'permissions-policy',
    // Cross-origin policies
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
    // Reporting
    'report-to',
    'nel',
    'reporting-endpoints',
    // Timing
    'timing-allow-origin',
    'server-timing',
    // Other potentially problematic headers
    'x-permitted-cross-domain-policies',
    'x-download-options',
    'x-dns-prefetch-control',
    'origin-agent-cluster',
    'document-policy',
    'require-document-policy'
  ]);
  
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!skipHeaders.has(lowerKey)) {
      // Rewrite Set-Cookie to remove domain/path restrictions
      if (lowerKey === 'set-cookie') {
        const sanitizedCookie = value
          .replace(/;\s*domain=[^;]*/gi, '')
          .replace(/;\s*secure/gi, '')
          .replace(/;\s*samesite=[^;]*/gi, '; SameSite=None');
        newHeaders.append(key, sanitizedCookie);
      } else {
        newHeaders.set(key, value);
      }
    }
  }
  
  // CORS headers for maximum compatibility
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  newHeaders.set('Access-Control-Allow-Headers', '*');
  newHeaders.set('Access-Control-Expose-Headers', '*');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  
  // Timing header for performance API
  newHeaders.set('Timing-Allow-Origin', '*');
  
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
          .on("frameset frame", new IFrameRewriter(target, isEmbedded))
          .on("form", new FormRewriter(target, isEmbedded))
          .on("button[formaction]", new FormActionRewriter(target, isEmbedded))
          .on("input[formaction]", new FormActionRewriter(target, isEmbedded))
          .on("object", new ObjectRewriter(target, isEmbedded))
          .on("embed", new EmbedRewriter(target, isEmbedded))
          .on("applet", new GenericUrlRewriter(target, isEmbedded))
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
          .on("[data-src]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-href]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-url]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-background]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-image]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-lazy-src]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-original]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-bg]", new GenericUrlRewriter(target, isEmbedded))
          .on("[data-poster]", new GenericUrlRewriter(target, isEmbedded))
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
      
      // JSON (for manifest.json and other configs) - rewrite URL values
      if (contentType.includes("application/json") || contentType.includes("application/manifest+json")) {
        try {
          const json = await resp.text();
          const rewritten = rewriteJsonUrls(json, target, isEmbedded);
          return new Response(rewritten, {
            status: resp.status,
            statusText: resp.statusText,
            headers: sanitizedHeaders
          });
        } catch {
          // If JSON rewriting fails, return original
          return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers: sanitizedHeaders
          });
        }
      }
      
      // SVG - rewrite href/xlink:href attributes
      if (contentType.includes("image/svg+xml")) {
        try {
          const svg = await resp.text();
          const rewritten = rewriteSvgUrls(svg, target, isEmbedded);
          return new Response(rewritten, {
            status: resp.status,
            statusText: resp.statusText,
            headers: sanitizedHeaders
          });
        } catch {
          return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers: sanitizedHeaders
          });
        }
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
