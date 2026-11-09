var __LCP_REMOTE_ENTRY_FILE__="chart.js";
var __LCP_REMOTE_CURRENT_SCRIPT__=typeof document!=="undefined"?document.currentScript:null;
if(!__LCP_REMOTE_CURRENT_SCRIPT__&&typeof document!=="undefined"){var __LCP_REMOTE_SCRIPTS__=document.getElementsByTagName("script");for(var __LCP_REMOTE_I__=__LCP_REMOTE_SCRIPTS__.length-1;__LCP_REMOTE_I__>=0;__LCP_REMOTE_I__--){var __LCP_REMOTE_SRC__=__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__].src||__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__].getAttribute("src")||"";if(__LCP_REMOTE_SRC__.indexOf(__LCP_REMOTE_ENTRY_FILE__)>=0){__LCP_REMOTE_CURRENT_SCRIPT__=__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__];break}}}
var __LCP_REMOTE_BASE_MAP__=typeof globalThis!=="undefined"&&globalThis.__LCP_REMOTE_COMPONENT_BASE_URL_MAP__||{};
var __LCP_REMOTE_MAPPED_BASE_URL__=__LCP_REMOTE_BASE_MAP__[__LCP_REMOTE_ENTRY_FILE__]||"";
var __LCP_REMOTE_SCRIPT_SRC__=__LCP_REMOTE_CURRENT_SCRIPT__&&(__LCP_REMOTE_CURRENT_SCRIPT__.src||__LCP_REMOTE_CURRENT_SCRIPT__.getAttribute("src"))||"";
var __LCP_REMOTE_SCRIPT_BASE_URL__=__LCP_REMOTE_SCRIPT_SRC__&&__LCP_REMOTE_SCRIPT_SRC__.lastIndexOf("/")>=0?__LCP_REMOTE_SCRIPT_SRC__.slice(0,__LCP_REMOTE_SCRIPT_SRC__.lastIndexOf("/")+1):"";
var __LCP_REMOTE_BASE_URL__=__LCP_REMOTE_MAPPED_BASE_URL__||__LCP_REMOTE_SCRIPT_BASE_URL__;
var __LCP_REMOTE_ASSET_URL__=function(p){if(!p||/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(p))return p;if(!__LCP_REMOTE_BASE_URL__)return p;return __LCP_REMOTE_BASE_URL__+p.replace(/^\.\//,"")};
(function(){if(typeof document==="undefined")return;["assets/chart.css"].forEach(function(p){var href=__LCP_REMOTE_ASSET_URL__(p);if(document.querySelector('link[data-lcp-remote-style="'+href+'"]'))return;var link=document.createElement("link");link.rel="stylesheet";link.href=href;link.setAttribute("data-lcp-remote-style",href);document.head.appendChild(link);});})();
var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(R,V){return {view:V.LCGUI,icon:__LCP_REMOTE_ASSET_URL__("assets/icon.svg")}}(React,LightChaserUI);
