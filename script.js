const proxy = "https://proxy.ikunbeautiful.workers.dev/?url=";
let tabs = [], activeTab = null;
let history = JSON.parse(localStorage.getItem("browserHistory") || "[]");
let bookmarks = JSON.parse(localStorage.getItem("browserBookmarks") || "[]");

// ---------- Dark Mode ----------
const themeBtn = document.getElementById("theme");
function setTheme(dark){document.body.classList.toggle("dark",dark);themeBtn.innerHTML=`<span class="material-icons">${dark?"light_mode":"dark_mode"}</span>`;localStorage.setItem("darkMode",dark?"1":"0");}
setTheme(localStorage.getItem("darkMode")==="1");
themeBtn.onclick=()=>setTheme(!document.body.classList.contains("dark"));

// ---------- Tab Hover Preview ----------
const preview = document.getElementById("tabPreview");

// ---------- Tabs ----------
function favicon(url){try{return "https://www.google.com/s2/favicons?domain="+new URL(url).hostname;}catch{return"";}}

function renderTabs(){
  const tabsDiv=document.getElementById("tabs");
  tabsDiv.innerHTML="";
  tabs.forEach(t=>{
    const tabEl=document.createElement("div");
    tabEl.className="tab"+(t===activeTab?" active":"");
    tabEl.innerHTML=`<img src="${favicon(t.url)}"><span>${t.title||t.url}</span><button>&times;</button>`;

    // Click & close
    tabEl.onclick=()=>switchTab(t.id);
    tabEl.querySelector("button").onclick=e=>{e.stopPropagation();closeTab(t.id);};

    // Hover preview
    tabEl.onmouseenter=(e)=>{
      if(t.iframe.src.startsWith(window.location.origin)){
        preview.innerHTML='';
        const clone=t.iframe.cloneNode(true);
        clone.style.pointerEvents='none';
        preview.appendChild(clone);
      } else {
        preview.innerHTML=`<div style="padding:10px;">${t.title||t.url}</div>`;
      }
      preview.style.display='block';
      preview.style.left=e.pageX+'px';
      preview.style.top=(e.pageY+20)+'px';
    };
    tabEl.onmousemove=(e)=>{preview.style.left=e.pageX+'px';preview.style.top=(e.pageY+20)+'px';};
    tabEl.onmouseleave=()=>{preview.style.display='none';};

    tabsDiv.appendChild(tabEl);
  });
  attachDragEvents();
}

// Drag to reorder tabs
let dragSrcEl=null;
function handleDragStart(e){dragSrcEl=e.currentTarget;e.dataTransfer.effectAllowed='move';}
function handleDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
function handleDrop(e){e.stopPropagation();if(dragSrcEl!==e.currentTarget){const fromIndex=tabs.findIndex(t=>t.id==dragSrcEl.dataset.id);const toIndex=tabs.findIndex(t=>t.id==e.currentTarget.dataset.id);tabs.splice(toIndex,0,tabs.splice(fromIndex,1)[0]);renderTabs();attachDragEvents();}}
function attachDragEvents(){document.querySelectorAll('.tab').forEach(tab=>{tab.draggable=true;tab.dataset.id=tabs.find(t=>t.title===tab.querySelector('span').innerText).id;tab.addEventListener('dragstart',handleDragStart);tab.addEventListener('dragover',handleDragOver);tab.addEventListener('drop',handleDrop);});}

function newTab(url="https://proxy.jimmyqrg.com/default/"){
  const id=Date.now();
  const iframe=document.createElement("iframe");
  iframe.src=proxy+encodeURIComponent(url);
  iframe.style.display="none";
  iframe.dataset.id=id;
  iframe.onload=()=>{try{const t=iframe.contentDocument.title;if(t) activeTab.title=t;}catch(e){activeTab.title=new URL(activeTab.url).hostname;}renderTabs();attachDragEvents();}
  document.getElementById("iframes").appendChild(iframe);
  const tab={id,url,title:url,iframe};
  tabs.push(tab);
  switchTab(id);
}

function switchTab(id){tabs.forEach(t=>t.iframe.style.display="none");activeTab=tabs.find(t=>t.id===id);if(activeTab){activeTab.iframe.style.display="block";document.getElementById("url").value=activeTab.url;renderTabs();attachDragEvents();}}
function closeTab(id){const idx=tabs.findIndex(t=>t.id===id);if(idx===-1)return;tabs[idx].iframe.remove();tabs.splice(idx,1);if(activeTab.id===id)switchTab(tabs[Math.max(0,idx-1)]?.id);}

// ---------- History & Bookmarks ----------
function saveHistory(url){history.push(url);localStorage.setItem("browserHistory",JSON.stringify(history));renderHistory();}
function renderHistory(){const h=document.getElementById("history");h.innerHTML="";history.slice().reverse().forEach(u=>{const d=document.createElement("div");d.className="item";d.innerHTML=`<img src="${favicon(u)}">${u}`;d.onclick=()=>navigate(u);h.appendChild(d);});}
function renderBookmarks(){const b=document.getElementById("bookmarks");b.innerHTML="";bookmarks.forEach(u=>{const d=document.createElement("div");d.className="item";d.innerHTML=`<img src="${favicon(u)}">${u}`;d.onclick=()=>navigate(u);b.appendChild(d);});}
function addBookmark(url){if(!bookmarks.includes(url)){bookmarks.push(url);localStorage.setItem("browserBookmarks",JSON.stringify(bookmarks));renderBookmarks();}}
document.getElementById("clearHistory").onclick=()=>{history=[];localStorage.setItem("browserHistory","[]");renderHistory();}

// ---------- Sidebar Toggle ----------
const sidebar=document.getElementById("sidebar");
const toggleBtn=document.getElementById("toggleSidebar");
toggleBtn.onclick=()=>{sidebar.classList.toggle("collapsed");toggleBtn.querySelector("span").innerText=sidebar.classList.contains("collapsed")?"chevron_right":"chevron_left";};

// ---------- Navigation ----------
function navigate(url){if(!url.startsWith("http")) url="https://"+url;if(!activeTab) newTab(url);activeTab.url=url;activeTab.iframe.src=proxy+encodeURIComponent(url);document.getElementById("url").value=url;saveHistory(url);renderTabs();attachDragEvents();}

// Controls
document.getElementById("go").onclick=()=>navigate(document.getElementById("url").value);
document.getElementById("newtab").onclick=()=>newTab();
document.getElementById("back").onclick=()=>{if(!activeTab)return;activeTab.iframe.contentWindow.history.back();};
document.getElementById("forward").onclick=()=>{if(!activeTab)return;activeTab.iframe.contentWindow.history.forward();};
document.getElementById("reload").onclick=()=>{if(!activeTab)return;activeTab.iframe.src=proxy+encodeURIComponent(activeTab.url);};
document.getElementById("home").onclick=()=>navigate("default/");
document.getElementById("bookmark").onclick=()=>activeTab&&addBookmark(activeTab.url);
document.getElementById("url").addEventListener("keydown",e=>{if(e.key==="Enter") navigate(e.target.value);});

// Init
renderHistory();renderBookmarks();newTab();
