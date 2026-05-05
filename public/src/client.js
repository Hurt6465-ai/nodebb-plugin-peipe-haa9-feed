/* =========================================================
   HAA9 unified v5 launch
   NodeBB 4.x / all category pages

   List/user-topic/composer script only. Topic detail code is intentionally excluded. v5: composer translate, user-topic avatar fix, study-group content lock.
   Do not load old HAA8/HAA9 hotfix/user-topic patches together with it.

   Fixes included:
   - TikTok iframe near-viewport preload, not click-only mount
   - first-click TikTok play reliability improvements
   - safer TikTok postMessage parsing/origin handling
   - stronger skeleton/loading state to avoid avatar-only flash
   - no early CSS takeover before items are marked by JS
   - stricter target topic route cleanup
   - user-topics logic limited to topics page
   ========================================================= */
(() => {
  'use strict';

  const CONFIG = {
    cid: 0,
    maxImages: 4,
    maxAudios: 3,
    maxTiktoks: 2,
    maxVoiceSeconds: 120,
    topicCacheMs: 5 * 60 * 1000,
    topicLocalCacheMs: 30 * 60 * 1000,
    profileCacheMs: 24 * 60 * 60 * 1000,
    partnerPresenceCacheMs: 60 * 1000,
    partnerProfilesEndpoint: '/api/peipe-haa9/profiles',
    essenceTag: '精华',
    studyCid: 7,
    studyGroupName: '学习小组',
    coverCacheMs: 3 * 24 * 60 * 60 * 1000,
    translateCacheMs: 3 * 24 * 60 * 60 * 1000,
    virtualRootMargin: '360px 0px 560px 0px',
    userTopicRootMargin: '480px 0px 760px 0px',
    tiktokPreloadRootMargin: '1800px 0px 2200px 0px',
    tiktokNeighborPreloadCount: 2,
    scanDelay: 120,
    imageMaxSide: 1440,
    imageMaxSizeMB: 0.45,
    imageQuality: 0.6,
    imageMinCompressBytes: 120 * 1024,
    imageUseWebp: true,
    tiktokReadyTimeoutMs: 18000,
    tiktokPreloadTimeoutMs: 14000,
    tiktokClickReadyTimeoutMs: 18000,
    tiktokIgnoreEarlyPauseMs: 5200,
    tiktokCommandDelayMs: 70,
    tiktokPreloadAutoplay: true
  };

  const TEXT = {
    user: '用户',
    follow: '关注',
    following: '已关注',
    followFail: '关注失败',
    unfollowFail: '取消关注失败',
    followed: '已关注',
    unfollowed: '已取消关注',
    loginFirst: '请先登录',
    likeFail: '点赞失败',
    unlikeFail: '取消点赞失败',
    justNow: '刚刚',
    minutesAgo: '分钟前',
    hoursAgo: '小时前',
    daysAgo: '天前',
    monthsAgo: '个月',
    yearsAgo: '年前',
    publish: '发布',
    publishing: '发布中...',
    publishOk: '发布成功',
    publishFail: '发布失败',
    enterSomething: '请输入内容、图片或语音',
    imageOnly: '这里只支持图片，不上传视频',
    processingImage: '处理图片中...',
    uploadImage: '正在上传图片...',
    uploadVoice: '正在上传语音...',
    camera: '拍照',
    gallery: '从相册选择',
    recordUnsupported: '当前浏览器不支持录音',
    micDenied: '麦克风权限未开启',
    voiceMsg: '语音消息',
    newPost: '新动态',
    placeholder: '写点什么，或粘贴 TikTok 链接',
    translating: '翻译中...',
    translateFail: '翻译失败',
    translateInput: '翻译输入',
    translateInputFail: '输入内容翻译失败',
    studyLockedTitle: '仅学习小组可查看内容',
    studyLockedText: '加入学习小组后可查看帖子内容',
    tiktokUnavailableCn: '视频加载失败，点播放重试。',
    tiktokUnavailable: '视频加载失败，点播放重试。',
    essence: '精华',
    essenceOnly: '只看精华'
  };

  const RE = {
    tiktokGlobal: /https?:\/\/(?:www\.)?tiktok\.com\/@[^/\s<>'"]+\/video\/(\d+)(?:\?[^\s<>'"]*)?/ig,
    tiktokOne: /https?:\/\/(?:www\.)?tiktok\.com\/@([^/\s<>'"]+)\/video\/(\d+)/i,
    tiktokToken: /(?:https?[-:\/]+)?(?:www[.-])?tiktok[.-]com[-\/\w@.%=&?]+/ig,
    audioExt: /\.(m4a|mp3|wav|ogg|oga|webm|aac)(?:[?#].*)?$/i,
    imageExt: /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i
  };

  const state = {
    bootTimer: 0,
    scanTimer: 0,
    i18nLoaded: false,
    i18nLoading: null,
    topicObserver: null,
    userTopicObserver: null,
    videoObserver: null,
    mutationObserver: null,
    profileCache: new Map(),
    profileInflight: new Map(),
    partnerProfilesDisabledAt: 0,
    partnerProfilesEndpointOk: '',
    topicCache: new Map(),
    topicInflight: new Map(),
    pidCache: new Map(),
    players: new Map(),
    audios: new Set(),
    fullscreen: null,
    activeAudio: null,
    encodeSupport: {},
    composer: {
      imageFiles: [],
      imageUrls: [],
      voiceBlob: null,
      voiceUrl: '',
      voiceDuration: 0,
      mediaRecorder: null,
      recordStream: null,
      recordChunks: [],
      recordStartAt: 0,
      recordTimer: 0,
      menuOpen: false,
      fabDragging: false,
      fabMoved: false,
      fabPointerId: null,
      fabStartX: 0,
      fabStartY: 0,
      fabLeft: 0,
      fabTop: 0
    }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isElement = value => value instanceof HTMLElement;
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const toInt = value => Number.parseInt(value, 10) || 0;

  function html(strings, ...values) {
    return strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
  }

  function createElement(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === false || value === null || value === undefined) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'trustedHtml' || key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, String(value));
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function safeJsonGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeJsonSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    return path.startsWith(base) ? path : base + path;
  }

  async function loadPluginI18n() {
    if (state.i18nLoaded) return;
    if (state.i18nLoading) return state.i18nLoading;
    state.i18nLoading = fetch(rel('/api/peipe-haa9/i18n'), { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (json && json.text && typeof json.text === 'object') Object.assign(TEXT, json.text);
        if (json && json.config && typeof json.config === 'object') Object.assign(CONFIG, json.config);
        state.i18nLoaded = true;
      })
      .catch(() => { state.i18nLoaded = true; })
      .finally(() => { state.i18nLoading = null; });
    return state.i18nLoading;
  }


  function ensureTikTokResourceHints() {
    if (!document.head || document.head.dataset.haa9TiktokHints === '1') return;
    document.head.dataset.haa9TiktokHints = '1';
    ['https://www.tiktok.com', 'https://www.tiktokcdn.com'].forEach(origin => {
      document.head.appendChild(createElement('link', { rel: 'preconnect', href: origin, crossorigin: 'anonymous' }));
      document.head.appendChild(createElement('link', { rel: 'dns-prefetch', href: origin }));
    });
  }

  function csrfToken() {
    return (window.config && (window.config.csrf_token || window.config.csrfToken)) ||
      ($('meta[name="csrf-token"]') && $('meta[name="csrf-token"]').getAttribute('content')) || '';
  }

  function currentUser() {
    return (window.app && window.app.user) || null;
  }

  function isLoggedIn() {
    const me = currentUser();
    return !!(me && Number(me.uid || 0) > 0);
  }

  function alertError(message) {
    if (window.app && typeof window.app.alertError === 'function') window.app.alertError(message);
    else window.alert(message);
  }

  function alertSuccess(message) {
    if (window.app && typeof window.app.alertSuccess === 'function') window.app.alertSuccess(message);
  }

  function currentCid() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const cid = Number(data.cid || (data.category && data.category.cid) || (data.topic && data.topic.cid) || 0);
    if (cid) return cid;
    const match = location.pathname.match(/\/category\/(\d+)(?:\/|$)/);
    return match ? Number(match[1]) : 0;
  }

  function isCategoryRoute() {
    if (document.body.classList.contains('page-topic')) return false;
    return document.body.classList.contains('page-category') || /\/category\/(\d+)(?:\/|$)/.test(location.pathname);
  }

  function isTargetCategoryPage() {
    if (!isCategoryRoute()) return false;
    if (Number(CONFIG.cid) === 0) return true;
    return currentCid() === Number(CONFIG.cid) || !!$(`li[component="category/topic"][data-cid="${Number(CONFIG.cid)}"]`);
  }

  function isTopicRoute() {
    return document.body.classList.contains('page-topic') || /\/topic\/\d+/i.test(location.pathname);
  }

  function isTargetTopicPage() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const cid = Number(data.cid || (data.topic && data.topic.cid) || 0);
    if (!document.body.classList.contains('page-topic')) return false;
    if (Number(CONFIG.cid) === 0) return true;
    return cid === Number(CONFIG.cid);
  }

  function isUserRoute() {
    return document.body.classList.contains('page-user') ||
      document.body.classList.contains('page-account') ||
      /\/user\/[^/]+(?:\/topics)?(?:\/|$|\?)/i.test(location.pathname);
  }

  function isUserTopicsRoute() {
    if (!isUserRoute()) return false;
    if (/\/user\/[^/]+\/topics(?:\/|$|\?)/i.test(location.pathname)) return true;
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const template = String(data.template || data.name || data.route || '').toLowerCase();
    if (template.includes('topics')) return true;
    return !!$('[component="user/topics"], [component="account/topics"], .user-topics, .topics-list, .topic-list');
  }

  function shouldHandleUserTopics() {
    if (isCategoryRoute() || isTopicRoute()) return false;
    return isUserTopicsRoute();
  }

  function isTargetTopicItem(li) {
    return isElement(li) && li.matches('li[component="category/topic"]') &&
      (Number(CONFIG.cid) === 0 || Number(li.dataset.cid || currentCid()) === Number(CONFIG.cid));
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function parseTime(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value > 9999999999 ? value : value * 1000;
    const text = String(value).trim();
    if (/^\d+$/.test(text)) {
      const number = Number(text);
      return Number.isFinite(number) ? (number > 9999999999 ? number : number * 1000) : 0;
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function relativeTime(value) {
    const time = parseTime(value);
    if (!time) return norm(value);
    const diff = Math.max(0, Date.now() - time);
    const minute = 60000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;
    if (diff >= year) return `${Math.floor(diff / year)}${TEXT.yearsAgo}`;
    if (diff >= month) return `${Math.floor(diff / month)}${TEXT.monthsAgo}`;
    if (diff >= day) return `${Math.floor(diff / day)}${TEXT.daysAgo}`;
    if (diff >= hour) return `${Math.floor(diff / hour)}${TEXT.hoursAgo}`;
    if (diff >= minute) return `${Math.max(1, Math.floor(diff / minute))}${TEXT.minutesAgo}`;
    return TEXT.justNow;
  }

  function absoluteTime(value) {
    const time = parseTime(value);
    if (!time) return norm(value);
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function timeMetaFromTopic(li) {
    const node = $('.timeago[title], time[datetime], [data-timestamp], [data-time], [data-iso]', li);
    const raw = li.dataset.timestamp ||
      (node && (node.getAttribute('data-timestamp') || node.getAttribute('datetime') || node.getAttribute('title') || node.getAttribute('data-time') || node.getAttribute('data-iso'))) || '';
    const visible = node ? norm(node.textContent) : '';
    return { relative: raw ? relativeTime(raw) : visible, absolute: raw ? absoluteTime(raw) : visible, raw };
  }

  function stripTikTokUrls(text) {
    return String(text || '')
      .replace(RE.tiktokGlobal, '')
      .replace(RE.tiktokToken, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isAutoGeneratedText(text) {
    const raw = norm(String(text || '').replace(/\u00a0/g, ' '));
    if (!raw) return true;
    const clean = norm(raw.replace(/[•・·|｜_／/\\-]+/g, ' ').replace(/[：]/g, ':').replace(/\s*:\s*/g, ':'));
    return /^(?:新动态|图片分享|图片动态|语音消息|语音动态|voice message|audio message|image|photo|picture)(?:\s*:?\s*\d{1,2}:\d{2}(?::\d{2})?)?$/i.test(clean);
  }

  function cleanDisplayText(text) {
    const lines = String(text || '')
      .replace(RE.tiktokGlobal, '')
      .replace(RE.tiktokToken, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[\s*(?:语音消息|语音动态|voice\s*message|audio\s*message)[^\]]*\]\([^)]+\)/ig, '')
      .split(/[\r\n]+/)
      .map(line => norm(line))
      .filter(line => line && !isAutoGeneratedText(line));
    const joined = lines.join('\n');
    return isAutoGeneratedText(joined) ? '' : joined;
  }

  function cleanTextForTranslate(text) {
    return cleanDisplayText(text).replace(/https?:\/\/\S+/g, '').trim();
  }

  function collectTikToks(text) {
    const seen = new Set();
    const out = [];
    String(text || '').replace(RE.tiktokGlobal, (match, videoId) => {
      if (videoId && !seen.has(videoId)) {
        seen.add(videoId);
        out.push({ videoId, url: match.replace(/&amp;/g, '&') });
      }
      return match;
    });
    return out.slice(0, CONFIG.maxTiktoks);
  }

  function getTopicId(node) {
    if (!isElement(node)) return '';
    const direct = node.dataset.tid || node.dataset.topicId || node.getAttribute('data-tid') || node.getAttribute('data-topic-id');
    if (direct && /^\d+$/.test(String(direct))) return String(direct);
    const link = $('a[href*="/topic/"]', node) || (node.matches('a[href*="/topic/"]') ? node : null);
    const match = link && String(link.getAttribute('href') || '').match(/\/topic\/(\d+)(?:\/|$)/);
    return match ? match[1] : '';
  }

  function getTopicHref(node) {
    const link = $('h3[component="topic/header"] a, [component="topic/title"] a, .topic-title a, a[href^="/topic/"], a[href*="/topic/"]', node);
    return (link && link.getAttribute('href')) || '#';
  }

  function topicTitleFromItem(node) {
    if (!isElement(node)) return '';
    const titleNode = $('h3[component="topic/header"] a, [component="topic/title"] a, .topic-title a, a[href^="/topic/"], a[href*="/topic/"]', node);
    const title = norm((titleNode && (titleNode.getAttribute('title') || titleNode.textContent)) || node.getAttribute('data-title') || node.dataset.title || '');
    return cleanDisplayText(title);
  }

  function getCounts(li) {
    const commentsNode = $('[component="topic/post-count"], [component="topic/posts"], .stats-postcount .fs-5, .post-count, .posts-count, [data-post-count], [data-postcount]', li);
    const likesNode = $('.stats-votes .fs-5, [component="topic/vote-count"], [component="post/vote-count"], .vote-count, .votes-count, [data-vote-count], [data-votecount]', li);
    const dataComments = li.dataset.postCount || li.dataset.postcount || li.dataset.posts || li.getAttribute('data-post-count') || li.getAttribute('data-postcount') || '';
    const dataLikes = li.dataset.voteCount || li.dataset.votecount || li.dataset.votes || li.getAttribute('data-vote-count') || li.getAttribute('data-votecount') || '';
    const comments = commentsNode ? toInt((norm(commentsNode.textContent || commentsNode.getAttribute('data-post-count') || '').match(/\d+/) || ['0'])[0]) : toInt(dataComments);
    const likes = likesNode ? toInt((norm(likesNode.textContent || likesNode.getAttribute('data-vote-count') || '').match(/-?\d+/) || ['0'])[0]) : toInt(dataLikes);
    return { comments, likes };
  }

  function parseDurationFromUrl(url) {
    try {
      const parsed = new URL(String(url || ''), location.origin);
      const raw = parsed.searchParams.get('haa8dur') || parsed.searchParams.get('dur') || parsed.searchParams.get('duration');
      const value = toInt(raw);
      return value > 0 ? Math.min(CONFIG.maxVoiceSeconds, value) : 0;
    } catch (_) {
      const match = String(url || '').match(/[?&](?:haa8dur|dur|duration)=(\d+)/i);
      return match ? Math.min(CONFIG.maxVoiceSeconds, toInt(match[1])) : 0;
    }
  }

  function appendDurationParam(url, seconds) {
    const duration = Math.max(1, Math.min(CONFIG.maxVoiceSeconds, Math.round(Number(seconds) || 0)));
    try {
      const parsed = new URL(url, location.origin);
      parsed.searchParams.set('haa8dur', String(duration));
      return parsed.origin === location.origin ? parsed.pathname + parsed.search + parsed.hash : parsed.toString();
    } catch (_) {
      return url + (String(url).includes('?') ? '&' : '?') + 'haa8dur=' + encodeURIComponent(duration);
    }
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function topicMediaCacheKey(tid) {
    return `haa9-topic-media-cache:${tid}`;
  }

  function readTopicMediaLocalCache(tid) {
    const cached = safeJsonGet(topicMediaCacheKey(tid));
    if (!cached || cached.expiresAt <= Date.now() || !cached.value) return null;
    return cached.value;
  }

  function writeTopicMediaLocalCache(tid, media) {
    if (!tid || !media) return;
    safeJsonSet(topicMediaCacheKey(tid), { value: media, expiresAt: Date.now() + CONFIG.topicLocalCacheMs });
  }

  function extractFirstPostContent(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const candidates = [];
    if (Array.isArray(payload.posts) && payload.posts[0]) candidates.push(payload.posts[0]);
    ['mainPost', 'postData', 'topic'].forEach(key => payload[key] && candidates.push(payload[key]));
    ['response', 'data'].forEach(rootKey => {
      const root = payload[rootKey];
      if (!root || typeof root !== 'object') return;
      if (Array.isArray(root.posts) && root.posts[0]) candidates.push(root.posts[0]);
      ['mainPost', 'postData', 'topic'].forEach(key => root[key] && candidates.push(root[key]));
    });
    for (const post of candidates) {
      const content = post && (post.content || post.raw || post.markdown || post.text);
      if (content) return String(content);
    }
    return String(payload.content || payload.raw || '');
  }

  function payloadCid(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    const candidates = [
      payload.cid,
      payload.category && payload.category.cid,
      payload.topic && payload.topic.cid,
      payload.response && payload.response.cid,
      payload.response && payload.response.topic && payload.response.topic.cid,
      payload.data && payload.data.cid,
      payload.data && payload.data.topic && payload.data.topic.cid
    ];
    for (const value of candidates) {
      const cid = Number(value || 0);
      if (cid) return cid;
    }
    if (Array.isArray(payload.posts) && payload.posts[0]) return Number(payload.posts[0].cid || 0);
    if (payload.response && Array.isArray(payload.response.posts) && payload.response.posts[0]) return Number(payload.response.posts[0].cid || 0);
    return 0;
  }

  function parseMediaFromContent(content) {
    const raw = String(content || '');
    const holder = createElement('div');
    holder.innerHTML = raw;
    const out = { cid: 0, text: '', images: [], audios: [], tiktoks: collectTikToks(raw) };

    $$('img[src]', holder).forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src && !out.images.includes(src)) out.images.push(src);
    });

    $$('audio[src]', holder).forEach(audio => {
      const src = audio.getAttribute('src') || '';
      if (src && !out.audios.some(item => item.url === src)) out.audios.push({ url: src, duration: parseDurationFromUrl(src), label: TEXT.voiceMsg });
    });

    $$('source[src]', holder).forEach(source => {
      const src = source.getAttribute('src') || '';
      if (src && RE.audioExt.test(src) && !out.audios.some(item => item.url === src)) out.audios.push({ url: src, duration: parseDurationFromUrl(src), label: TEXT.voiceMsg });
    });

    $$('a[href]', holder).forEach(link => {
      const href = link.getAttribute('href') || '';
      if (RE.audioExt.test(href) && !out.audios.some(item => item.url === href)) {
        out.audios.push({ url: href, duration: parseDurationFromUrl(href), label: norm(link.textContent) || TEXT.voiceMsg });
      } else if (RE.imageExt.test(href) && !out.images.includes(href)) {
        out.images.push(href);
      }
    });

    (raw.match(/!\[[^\]]*\]\(([^)]+)\)/g) || []).forEach(item => {
      const match = item.match(/!\[[^\]]*\]\(([^)]+)\)/);
      if (match && match[1] && !out.images.includes(match[1])) out.images.push(match[1]);
    });

    (raw.match(/\[[^\]]*\]\(([^)]+)\)/g) || []).forEach(item => {
      const match = item.match(/\[([^\]]*)\]\(([^)]+)\)/);
      if (!match || !match[2]) return;
      if (RE.audioExt.test(match[2]) && !out.audios.some(audio => audio.url === match[2])) {
        out.audios.push({ url: match[2], duration: parseDurationFromUrl(match[2]), label: norm(match[1]) || TEXT.voiceMsg });
      }
    });

    let text = holder.textContent || raw;
    text = text
      .replace(RE.tiktokGlobal, '')
      .replace(RE.tiktokToken, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[\s*(?:语音消息|语音动态|voice\s*message|audio\s*message)[^\]]*\]\([^)]+\)/ig, '')
      .replace(/\bimage\b/ig, '');

    out.text = cleanDisplayText(text);
    out.images = out.images.slice(0, CONFIG.maxImages);
    out.audios = out.audios.slice(0, CONFIG.maxAudios);
    out.tiktoks = out.tiktoks.slice(0, CONFIG.maxTiktoks);
    return out;
  }

  function lockedStudyMedia(title = '') {
    return {
      cid: Number(CONFIG.studyCid || 7),
      title: cleanDisplayText(title || ''),
      text: TEXT.studyLockedText,
      images: [],
      audios: [],
      tiktoks: [],
      locked: true
    };
  }

  function findPostIdInPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const directKeys = ['mainPid', 'main_pid', 'pid', 'postId', 'post_id'];
    for (const key of directKeys) {
      if (payload[key] && /^\d+$/.test(String(payload[key]))) return String(payload[key]);
    }
    if (Array.isArray(payload.posts)) {
      const post = payload.posts.find(item => item && item.pid && /^\d+$/.test(String(item.pid)));
      if (post) return String(post.pid);
    }
    for (const key of ['topic', 'data', 'response']) {
      const found = findPostIdInPayload(payload[key]);
      if (found) return found;
    }
    return '';
  }

  async function fetchTopicMedia(tid) {
    const key = String(tid || '');
    if (!key) return { cid: 0, text: '', images: [], audios: [], tiktoks: [] };

    const mem = state.topicCache.get(key);
    if (mem && mem.expiresAt > Date.now()) return mem.value;

    const local = readTopicMediaLocalCache(key);
    if (local) {
      state.topicCache.set(key, { expiresAt: Date.now() + CONFIG.topicCacheMs, value: local });
      return local;
    }

    if (state.topicInflight.has(key)) return state.topicInflight.get(key);

    const promise = (async () => {
      const urls = [rel(`/api/topic/${encodeURIComponent(key)}`), rel(`/api/v3/topics/${encodeURIComponent(key)}`)];
      let lastError = null;
      for (const url of urls) {
        try {
          const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
          if (res.status === 403) {
            const media = lockedStudyMedia();
            state.topicCache.set(key, { expiresAt: Date.now() + CONFIG.topicCacheMs, value: media });
            writeTopicMediaLocalCache(key, media);
            return media;
          }
          if (!res.ok) throw new Error(`topic api ${res.status}`);
          const json = await res.json();
          const media = parseMediaFromContent(extractFirstPostContent(json));
          media.cid = payloadCid(json);
          const pid = findPostIdInPayload(json);
          if (pid) state.pidCache.set(key, pid);
          state.topicCache.set(key, { expiresAt: Date.now() + CONFIG.topicCacheMs, value: media });
          writeTopicMediaLocalCache(key, media);
          return media;
        } catch (error) {
          lastError = error;
        }
      }
      console.warn('HAA9 topic media fetch failed:', lastError);
      return { cid: 0, text: '', images: [], audios: [], tiktoks: [] };
    })().finally(() => state.topicInflight.delete(key));

    state.topicInflight.set(key, promise);
    return promise;
  }

  function flagFromCountryCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return '';
    return Array.from(normalized).map(char => String.fromCodePoint(0x1F1E6 + char.charCodeAt(0) - 65)).join('');
  }

  function countryCodeFromProfile(profile = {}) {
    if (profile.flagEmoji && /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(String(profile.flagEmoji))) return String(profile.flagEmoji).match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)[0];
    const raw = norm(profile.countryCode || profile.country_code || profile.country || profile.country_name || profile.nationality || profile.region || profile.language_flag || profile.location || '');
    if (!raw) return '';
    const emojiMatch = raw.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
    if (emojiMatch) return emojiMatch[0];
    const direct = raw.match(/\b[A-Z]{2}\b/i);
    if (direct) return direct[0].toUpperCase();
    const lower = raw.toLowerCase();
    const pairs = [
      ['myanmar', 'MM'], ['burma', 'MM'], ['缅甸', 'MM'], ['china', 'CN'], ['中国', 'CN'],
      ['singapore', 'SG'], ['新加坡', 'SG'], ['thailand', 'TH'], ['泰国', 'TH'], ['laos', 'LA'], ['老挝', 'LA'],
      ['vietnam', 'VN'], ['越南', 'VN'], ['cambodia', 'KH'], ['柬埔寨', 'KH'], ['malaysia', 'MY'], ['马来西亚', 'MY'],
      ['philippines', 'PH'], ['菲律宾', 'PH'], ['indonesia', 'ID'], ['印尼', 'ID'], ['印度尼西亚', 'ID'],
      ['japan', 'JP'], ['日本', 'JP'], ['korea', 'KR'], ['韩国', 'KR'], ['united states', 'US'], ['usa', 'US'], ['美国', 'US'],
      ['united kingdom', 'GB'], ['uk', 'GB'], ['英国', 'GB'], ['france', 'FR'], ['法国', 'FR'], ['germany', 'DE'], ['德国', 'DE'], ['india', 'IN'], ['印度', 'IN']
    ];
    const found = pairs.find(([name]) => lower.includes(name));
    return found ? found[1] : '';
  }

  function flagEmoji(profile) {
    const value = countryCodeFromProfile(profile);
    if (!value) return '';
    return /^[A-Z]{2}$/.test(value) ? flagFromCountryCode(value) : value;
  }

  function parseLangList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    const text = String(value || '').trim();
    if (!text || text === '[]') return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {}
    return text.split(/[\/,、|]+/).map(norm).filter(Boolean);
  }

  function toLangCode(value) {
    const raw = norm(value).toLowerCase();
    const map = {
      中文: 'ZH', 汉语: 'ZH', 普通话: 'ZH', chinese: 'ZH', mandarin: 'ZH', zh: 'ZH',
      英语: 'EN', 英文: 'EN', english: 'EN', en: 'EN',
      缅甸语: 'MY', 缅语: 'MY', burmese: 'MY', myanmar: 'MY', my: 'MY',
      日语: 'JA', japanese: 'JA', ja: 'JA', 韩语: 'KO', korean: 'KO', ko: 'KO',
      泰语: 'TH', thai: 'TH', th: 'TH', 越南语: 'VI', vietnamese: 'VI', vi: 'VI',
      法语: 'FR', french: 'FR', fr: 'FR', 德语: 'DE', german: 'DE', de: 'DE',
      西班牙语: 'ES', spanish: 'ES', es: 'ES', 老挝语: 'LO', lao: 'LO', lo: 'LO',
      高棉语: 'KM', khmer: 'KM', km: 'KM', 马来语: 'MS', malay: 'MS', ms: 'MS',
      菲律宾语: 'TL', tagalog: 'TL', tl: 'TL'
    };
    if (map[raw]) return map[raw];
    if (/^[a-z]{2,4}$/i.test(raw)) return raw.toUpperCase();
    return norm(value).slice(0, 3).toUpperCase();
  }

  function languagePair(profile = {}) {
    const native = [
      ...parseLangList(profile.nativeCodes),
      ...parseLangList(profile.nativeCode),
      ...parseLangList(profile.language_fluent),
      ...parseLangList(profile.native_language),
      ...parseLangList(profile.language_native)
    ].map(toLangCode);
    const learning = [
      ...parseLangList(profile.learnCodes),
      ...parseLangList(profile.learnCode),
      ...parseLangList(profile.language_learning),
      ...parseLangList(profile.learning_language),
      ...parseLangList(profile.language_target),
      ...parseLangList(profile.target_language)
    ].map(toLangCode);
    return {
      native: Array.from(new Set(native.filter(Boolean))).join('/'),
      learning: Array.from(new Set(learning.filter(Boolean))).join('/')
    };
  }

  function categoryUser(li) {
    const link = $(':scope > .d-flex.p-0 .flex-shrink-0 a[href^="/user/"], a[href^="/user/"]', li);
    const href = link ? link.getAttribute('href') || '' : '';
    const slug = href.startsWith('/user/') ? (href.split('/').filter(Boolean)[1] || '') : '';
    const uidNode = $('[data-uid], [data-user-id], [data-userid]', li);
    const uid = li.dataset.uid || li.getAttribute('data-uid') ||
      (link && (link.dataset.uid || link.getAttribute('data-uid'))) ||
      (uidNode && (uidNode.dataset.uid || uidNode.dataset.userId || uidNode.dataset.userid || uidNode.getAttribute('data-user-id') || uidNode.getAttribute('data-userid'))) || '';
    const displayName = norm((link && (link.getAttribute('title') || link.textContent)) || li.getAttribute('data-username') || '');
    return { uid: uid ? String(uid) : '', userslug: slug, username: displayName, displayName };
  }

  function userFromHref(href) {
    const raw = String(href || '').trim();
    if (!raw) return null;
    let path = raw;
    try { path = new URL(raw, location.origin).pathname; } catch (_) {}
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('user');
    if (idx === -1 || !parts[idx + 1]) return null;
    return { userslug: decodeURIComponent(parts[idx + 1]), username: '', displayName: '' };
  }

  function currentProfileUser() {
    const data = (window.ajaxify && window.ajaxify.data) || {};
    const u = data.user || data.account || data.profile || data;
    const fromPath = userFromHref(location.pathname);
    return {
      uid: String((u && (u.uid || u.userId || u.userid)) || ''),
      userslug: String((u && u.userslug) || (fromPath && fromPath.userslug) || '').replace(/^@/, ''),
      username: norm((u && (u.displayname || u.username)) || ''),
      displayName: norm((u && (u.displayname || u.username)) || '')
    };
  }

  function userFromTopicItem(item) {
    const directSlug = item.getAttribute('data-userslug') || item.dataset.userslug || '';
    const directUid = item.getAttribute('data-uid') || item.dataset.uid || '';
    const link = $('a[href^="/user/"], a[href*="/user/"]', item);
    const fromLink = link ? userFromHref(link.getAttribute('href') || link.href) : null;
    const profile = currentProfileUser();
    return {
      uid: String(directUid || profile.uid || ''),
      userslug: String(directSlug || (fromLink && fromLink.userslug) || profile.userslug || ''),
      username: norm((link && (link.getAttribute('title') || link.textContent)) || profile.username || ''),
      displayName: norm((link && (link.getAttribute('title') || link.textContent)) || profile.displayName || profile.username || '')
    };
  }

  function isOwnUser(user) {
    const me = currentUser();
    if (!me) return false;
    const uidA = String(user.uid || '');
    const uidB = String(me.uid || '');
    const slugA = String(user.userslug || '').toLowerCase();
    const slugB = String(me.userslug || '').toLowerCase();
    const nameB = String(me.username || '').toLowerCase();
    return (uidA && uidB && uidA === uidB) || (slugA && (slugA === slugB || slugA === nameB));
  }

  function profileCacheKey(user) {
    return `haa9-profile:${user.userslug || user.uid || ''}`;
  }

  function normalizeProfile(payload) {
    const user = payload && (payload.user || payload.response?.user || payload.response || payload.data?.user || payload.data || payload);
    return user && typeof user === 'object' ? user : {};
  }

  function normalizePartnerProfile(profile = {}, fallbackUser = {}) {
    const out = Object.assign({}, profile);
    out.uid = String(out.uid || out.userId || out.userid || fallbackUser.uid || '');
    out.userslug = String(out.userslug || fallbackUser.userslug || '').replace(/^@/, '');
    out.username = norm(out.username || fallbackUser.username || fallbackUser.displayName || out.userslug || '');
    out.displayname = norm(out.displayname || out.displayName || out.username || fallbackUser.displayName || fallbackUser.username || out.userslug || '');
    out.displayName = out.displayname;
    if (out.isOnline === true) out.status = 'online';
    if (!out.status && out.statusText === '当前在线') out.status = 'online';
    if (out.countryCode && !out.country_code) out.country_code = out.countryCode;
    if (out.flagEmoji && !out.language_flag) out.language_flag = out.flagEmoji;
    return out;
  }

  function partnerProfilesEndpoints() {
    const configured = CONFIG.partnerProfilesEndpoint || window.HAA9_PARTNER_PROFILES_ENDPOINT || '';
    const list = [configured, state.partnerProfilesEndpointOk,
      '/api/peipe-haa9/profiles',
      '/api/plugins/peipe-haa9/profiles',
      '/api/peipe-partners/profiles',
      '/api/plugins/peipe-partners/profiles',
      '/api/peipe/partners/profiles',
      '/api/language-partners/profiles'
    ].filter(Boolean);
    return Array.from(new Set(list));
  }

  function extractPartnerUsers(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.users)) return payload.users;
    if (Array.isArray(payload.profiles)) return payload.profiles;
    if (payload.user && typeof payload.user === 'object') return [payload.user];
    if (payload.profile && typeof payload.profile === 'object') return [payload.profile];
    if (payload.usersByUid && typeof payload.usersByUid === 'object') return Object.values(payload.usersByUid);
    if (payload.data && Array.isArray(payload.data.users)) return payload.data.users;
    return [];
  }

  function pickPartnerUser(payload, requestUser) {
    const users = extractPartnerUsers(payload);
    const uid = String(requestUser.uid || '');
    const slug = String(requestUser.userslug || '').toLowerCase();
    return users.find(item => {
      if (!item) return false;
      const itemUid = String(item.uid || item.userId || item.userid || '');
      const itemSlug = String(item.userslug || '').toLowerCase();
      return (uid && itemUid === uid) || (slug && itemSlug === slug);
    }) || users[0] || null;
  }

  async function requestPartnerProfile(user) {
    if (!user || (!user.uid && !user.userslug)) return null;
    if (state.partnerProfilesDisabledAt && Date.now() - state.partnerProfilesDisabledAt < 5 * 60 * 1000) return null;
    const payload = { uids: user.uid ? [Number(user.uid)] : [], userslugs: user.userslug ? [String(user.userslug)] : [] };
    const headers = { accept: 'application/json', 'content-type': 'application/json; charset=utf-8', 'x-requested-with': 'XMLHttpRequest' };
    const token = csrfToken();
    if (token) headers['x-csrf-token'] = token;
    for (const endpoint of partnerProfilesEndpoints()) {
      try {
        const res = await fetch(rel(endpoint), { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`partner profile ${res.status}`);
        const json = await res.json();
        const found = pickPartnerUser(json, user);
        if (found) {
          state.partnerProfilesEndpointOk = endpoint;
          return normalizePartnerProfile(found, user);
        }
      } catch (_) {}
    }
    state.partnerProfilesDisabledAt = Date.now();
    return null;
  }

  async function fetchProfile(user) {
    const key = user.userslug || user.uid;
    if (!key) return {};
    if (state.profileCache.has(key)) return state.profileCache.get(key);
    const stored = safeJsonGet(profileCacheKey(user));
    if (stored && stored.expiresAt > Date.now() && stored.data) {
      state.profileCache.set(key, stored.data);
      return stored.data;
    }
    if (state.profileInflight.has(key)) return state.profileInflight.get(key);
    const promise = (async () => {
      const partner = await requestPartnerProfile(user);
      if (partner && (partner.uid || partner.userslug)) {
        state.profileCache.set(key, partner);
        safeJsonSet(profileCacheKey(user), { expiresAt: Date.now() + CONFIG.profileCacheMs, data: partner });
        return partner;
      }
      const api = user.userslug ? rel(`/api/user/${encodeURIComponent(user.userslug)}`) : rel(`/api/v3/users/${encodeURIComponent(user.uid)}`);
      try {
        const res = await fetch(api, { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`profile ${res.status}`);
        const json = await res.json();
        const data = normalizePartnerProfile(normalizeProfile(json), user);
        state.profileCache.set(key, data);
        safeJsonSet(profileCacheKey(user), { expiresAt: Date.now() + CONFIG.profileCacheMs, data });
        return data;
      } catch (_) {
        return {};
      }
    })().finally(() => state.profileInflight.delete(key));
    state.profileInflight.set(key, promise);
    return promise;
  }

  function followStorage() { return safeJsonGet('haa9-follow-state', {}); }
  function legacyFollowStorage() { return safeJsonGet('haa8-follow-states', {}); }

  function readFollow(user, profile = {}) {
    const keys = [];
    if (user.uid) keys.push(`uid:${user.uid}`);
    if (user.userslug) keys.push(`slug:${String(user.userslug).toLowerCase()}`);
    for (const stored of [followStorage(), legacyFollowStorage()]) {
      for (const key of keys) if (stored[key] !== undefined) return !!stored[key];
    }
    const profileKeys = ['isFollowing', 'is_following', 'following', 'isFollowed', 'followed'];
    const found = profileKeys.find(key => profile[key] !== undefined && profile[key] !== null);
    return found ? ['1', 'true', 'yes', 'following', 'followed'].includes(String(profile[found]).toLowerCase()) : false;
  }

  function writeFollow(user, following) {
    const next = !!following;
    const stored = followStorage();
    const legacy = legacyFollowStorage();
    if (user.uid) {
      stored[`uid:${user.uid}`] = next;
      legacy[`uid:${user.uid}`] = next;
    }
    if (user.userslug) {
      stored[`slug:${String(user.userslug).toLowerCase()}`] = next;
      legacy[`slug:${String(user.userslug).toLowerCase()}`] = next;
    }
    safeJsonSet('haa9-follow-state', stored);
    safeJsonSet('haa8-follow-states', legacy);
  }

  function updateFollowButtons(user, following) {
    const uid = String(user.uid || '');
    const slug = String(user.userslug || '').toLowerCase();
    $$('.haa9-follow').forEach(button => {
      const sameUid = uid && button.dataset.uid === uid;
      const sameSlug = slug && String(button.dataset.userslug || '').toLowerCase() === slug;
      if (!sameUid && !sameSlug) return;
      button.classList.toggle('is-following', !!following);
      button.dataset.following = following ? '1' : '0';
      button.textContent = following ? TEXT.following : TEXT.follow;
      button.title = following ? TEXT.following : TEXT.follow;
    });
  }

  async function requestFollow(user, following) {
    const uid = String(user && user.uid || '').trim();
    if (!uid) throw new Error('missing uid');
    const headers = { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' };
    const token = csrfToken();
    if (token) headers['x-csrf-token'] = token;
    const res = await fetch(rel(`/api/v3/users/${encodeURIComponent(uid)}/follow`), { method: following ? 'PUT' : 'DELETE', credentials: 'same-origin', headers });
    if (!res.ok) throw new Error(`follow ${res.status}`);
  }

  function makeFollowButton(user, profile) {
    const followUser = Object.assign({}, user, { uid: String(user.uid || profile.uid || profile.userId || profile.userid || '') });
    if (isOwnUser(followUser)) return null;
    const following = readFollow(followUser, profile);
    return createElement('button', {
      class: `haa9-follow${following ? ' is-following' : ''}`,
      type: 'button',
      text: following ? TEXT.following : TEXT.follow,
      title: following ? TEXT.following : TEXT.follow,
      dataset: { uid: followUser.uid || '', userslug: followUser.userslug || '', following: following ? '1' : '0' },
      onclick: async event => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        if (!isLoggedIn()) return alertError(TEXT.loginFirst);
        if (button.classList.contains('is-loading')) return;
        const next = button.dataset.following !== '1';
        if (!followUser.uid) return alertError('缺少用户 ID，无法关注');
        button.classList.add('is-loading');
        try {
          await requestFollow(followUser, next);
          writeFollow(followUser, next);
          updateFollowButtons(followUser, next);
          alertSuccess(next ? TEXT.followed : TEXT.unfollowed);
        } catch (_) {
          alertError(next ? TEXT.followFail : TEXT.unfollowFail);
        } finally {
          button.classList.remove('is-loading');
        }
      }
    });
  }

  function decorateAvatar(li, profile) {
    const host = $(':scope > .d-flex.p-0 .flex-shrink-0.position-relative, :scope > .d-flex.p-0 .flex-shrink-0, :scope > .d-flex .flex-shrink-0', li);
    if (!host) return;
    host.classList.add('haa9-avatar-host');
    $$('.haa9-flag, .haa9-status-dot', host).forEach(node => node.remove());
    const flag = flagEmoji(profile);
    if (flag) host.appendChild(createElement('span', { class: 'haa9-flag', text: flag }));
    if (!$('[component="user/status"]', host)) {
      const status = norm(profile.isOnline ? 'online' : (profile.status || (profile.statusText === '当前在线' ? 'online' : ''))).toLowerCase();
      if (status) host.appendChild(createElement('span', { class: `haa9-status-dot is-${status}` }));
    }
    const link = $('a[href*="/user/"]', host);
    if (link) {
      const user = userFromHref(link.getAttribute('href') || link.href);
      if (user && user.userslug) link.setAttribute('href', rel(`/user/${encodeURIComponent(user.userslug)}/topics`));
    }
  }

  function makeUserHeader(user, profile, extraClass = '', options = {}) {
    const pair = languagePair(profile);
    const name = user.displayName || user.username || profile.displayname || profile.username || user.userslug || TEXT.user;
    const wrap = createElement('div', { class: `haa9-user ${extraClass}`.trim() });
    const row = createElement('div', { class: 'haa9-user-row' });
    row.appendChild(createElement('a', { class: 'haa9-name', href: user.userslug ? rel(`/user/${encodeURIComponent(user.userslug)}/topics`) : '#', text: name }));
    const follow = makeFollowButton(Object.assign({}, user, { uid: String(user.uid || profile.uid || profile.userId || profile.userid || '') }), profile);
    if (follow) row.appendChild(follow);
    if (options.time && options.time.relative) {
      row.appendChild(createElement('span', {
        class: 'haa9-header-time',
        text: options.time.relative,
        title: options.time.absolute || options.time.relative || ''
      }));
    }
    wrap.appendChild(row);
    if (pair.native || pair.learning) {
      const lang = createElement('div', { class: 'haa9-lang' });
      if (pair.native && pair.learning) {
        lang.appendChild(document.createTextNode(pair.native + ' '));
        lang.appendChild(createElement('span', { class: 'haa9-lang-arrow', trustedHtml: '&#8644;' }));
        lang.appendChild(document.createTextNode(' ' + pair.learning));
      } else {
        lang.textContent = pair.native || pair.learning;
      }
      wrap.appendChild(lang);
    }
    return wrap;
  }

  function profilePicture(profile = {}, user = {}, item = null) {
    const direct = profile.picture || profile.uploadedpicture || profile.image || profile.avatar || user.picture || '';
    if (direct) return direct;
    const img = item && $('img.avatar, .avatar img, img[src]', item);
    return img ? (img.getAttribute('src') || img.src || '') : '';
  }

  function makeAvatarFallbackText(user = {}, profile = {}) {
    const name = user.displayName || user.username || profile.displayname || profile.username || user.userslug || TEXT.user;
    return norm(name).slice(0, 1).toUpperCase() || 'U';
  }

  function makeUserTopicHeader(user, profile, item, options = {}) {
    const merged = Object.assign({}, user, {
      uid: String(profile.uid || profile.userId || profile.userid || user.uid || ''),
      username: user.username || profile.username || '',
      displayName: user.displayName || profile.displayname || profile.displayName || profile.username || user.userslug || ''
    });
    const head = createElement('div', { class: 'haa9-user-topic-head' });
    const href = merged.userslug ? rel(`/user/${encodeURIComponent(merged.userslug)}/topics`) : '#';
    const avatar = createElement('a', { class: 'haa9-user-topic-avatar-host', href, title: merged.displayName || merged.username || TEXT.user });
    const src = profilePicture(profile, merged, item);
    if (src) avatar.appendChild(createElement('img', { src, alt: merged.displayName || merged.username || TEXT.user, loading: 'lazy' }));
    else avatar.appendChild(createElement('span', { class: 'haa9-user-topic-avatar-fallback', text: makeAvatarFallbackText(merged, profile) }));
    const flag = flagEmoji(profile);
    if (flag) avatar.appendChild(createElement('span', { class: 'haa9-flag', text: flag }));
    const status = norm(profile.isOnline ? 'online' : (profile.status || (profile.statusText === '当前在线' ? 'online' : ''))).toLowerCase();
    if (status) avatar.appendChild(createElement('span', { class: `haa9-status-dot is-${status}` }));
    head.appendChild(avatar);
    head.appendChild(makeUserHeader(merged, profile || {}, 'haa9-user-topic-user', options));
    return head;
  }

  function voteStorage() { return safeJsonGet('haa9-vote-state', {}); }
  function legacyVoteStorage() { return safeJsonGet('haa8-vote-states', {}); }

  function readVote(pid, tid) {
    for (const stored of [voteStorage(), legacyVoteStorage()]) {
      if (pid && stored[`pid:${pid}`] !== undefined) return !!stored[`pid:${pid}`];
      if (tid && stored[`tid:${tid}`] !== undefined) return !!stored[`tid:${tid}`];
    }
    return null;
  }

  function writeVote(pid, tid, voted) {
    const next = !!voted;
    const stored = voteStorage();
    const legacy = legacyVoteStorage();
    if (pid) {
      stored[`pid:${pid}`] = next;
      legacy[`pid:${pid}`] = next;
    }
    if (tid) {
      stored[`tid:${tid}`] = next;
      legacy[`tid:${tid}`] = next;
    }
    safeJsonSet('haa9-vote-state', stored);
    safeJsonSet('haa8-vote-states', legacy);
  }

  function nativeVoted(li) {
    return !!$('[component="post/upvote"].upvoted, [component="post/upvote"].active, [data-voted="1"], [data-voted="true"], .upvoted', li);
  }

  function postIdFromTopicItem(li) {
    const direct = li.dataset.pid || li.dataset.mainPid || li.getAttribute('data-pid') || li.getAttribute('data-main-pid') || '';
    if (/^\d+$/.test(String(direct))) return String(direct);
    const node = $('[data-main-pid], [data-pid]', li);
    const value = node && (node.getAttribute('data-main-pid') || node.getAttribute('data-pid'));
    return /^\d+$/.test(String(value || '')) ? String(value) : '';
  }

  async function resolveVotePid(li, tid) {
    const direct = postIdFromTopicItem(li);
    if (direct) return direct;
    if (!tid) throw new Error('missing tid');
    if (state.pidCache.has(tid)) return state.pidCache.get(tid);
    const res = await fetch(rel(`/api/topic/${encodeURIComponent(tid)}`), { credentials: 'same-origin', headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error(`topic ${res.status}`);
    const json = await res.json();
    const pid = findPostIdInPayload(json);
    if (!pid) throw new Error('missing pid');
    state.pidCache.set(tid, pid);
    return pid;
  }

  function setLikeButton(button, voted, count) {
    const value = Math.max(0, toInt(count));
    button.classList.toggle('is-active', !!voted);
    button.dataset.voted = voted ? '1' : '0';
    button.dataset.count = String(value);
    button.innerHTML = `<i class="${voted ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i><span>${value}</span>`;
  }

  function syncLikeButtons(pid, tid, voted, delta, except = null) {
    $$('.haa9-action-like').forEach(button => {
      const samePid = pid && button.dataset.pid === String(pid);
      const sameTid = tid && button.dataset.tid === String(tid);
      if (!samePid && !sameTid) return;
      if (pid) button.dataset.pid = String(pid);
      if (button === except) return;
      setLikeButton(button, voted, toInt(button.dataset.count) + delta);
    });
  }

  async function requestVote(pid, voted) {
    const res = await fetch(rel(`/api/v3/posts/${encodeURIComponent(pid)}/vote`), {
      method: voted ? 'PUT' : 'DELETE',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
        'x-csrf-token': csrfToken(),
        'x-requested-with': 'XMLHttpRequest',
        'x-haa9-vote': '1'
      },
      body: JSON.stringify({ delta: 1 })
    });
    if (!res.ok) throw new Error(`vote ${res.status}`);
  }

  function makeMetaRow(li, options = {}) {
    const tid = getTopicId(li);
    const href = getTopicHref(li);
    const pid = postIdFromTopicItem(li);
    const counts = getCounts(li);
    const time = timeMetaFromTopic(li);
    const persisted = readVote(pid, tid);
    const voted = persisted !== null ? persisted : nativeVoted(li);

    const row = createElement('div', { class: 'haa9-meta-row' });
    if (!options.hideTime) row.appendChild(createElement('span', { class: 'haa9-time', text: time.relative || '', title: time.absolute || time.relative || '' }));

    const actions = createElement('div', { class: 'haa9-actions' });
    actions.appendChild(createElement('a', {
      class: 'haa9-action haa9-action-comment',
      href,
      html: `<i class="fa-regular fa-comment" aria-hidden="true"></i><span>${counts.comments}</span>`
    }));

    const like = createElement('button', {
      class: 'haa9-action haa9-action-like',
      type: 'button',
      dataset: { tid, pid, voted: voted ? '1' : '0', count: String(counts.likes) },
      onclick: async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!isLoggedIn()) return alertError(TEXT.loginFirst);
        if (like.classList.contains('is-loading')) return;
        const current = like.dataset.voted === '1';
        const next = !current;
        const oldCount = toInt(like.dataset.count);
        const delta = next ? 1 : -1;
        setLikeButton(like, next, oldCount + delta);
        like.classList.add('is-loading');
        try {
          const resolvedPid = await resolveVotePid(li, tid);
          like.dataset.pid = resolvedPid;
          await requestVote(resolvedPid, next);
          writeVote(resolvedPid, tid, next);
          syncLikeButtons(resolvedPid, tid, next, delta, like);
        } catch (_) {
          setLikeButton(like, current, oldCount);
          alertError(next ? TEXT.likeFail : TEXT.unlikeFail);
        } finally {
          like.classList.remove('is-loading');
        }
      }
    });
    setLikeButton(like, voted, counts.likes);
    actions.appendChild(like);
    row.appendChild(actions);
    return row;
  }

  function getTranslateSettings() {
    const saved = safeJsonGet('x-topic-translate-settings') || {};
    const rawTarget = saved.targetLang || saved.target || saved.to || navigator.language || 'zh-CN';
    const rawSource = saved.sourceLang || saved.source || saved.from || 'auto';
    const normalize = (value, fallback) => {
      const raw = norm(value).toLowerCase().replace(/_/g, '-');
      return raw ? raw.split('-')[0] || fallback : fallback;
    };
    return { sourceLang: normalize(rawSource, 'auto'), targetLang: normalize(rawTarget, 'zh') };
  }

  function normalizeTranslateOutput(out) {
    if (out === null || out === undefined) return '';
    if (typeof out === 'string') return out;
    if (typeof out.text === 'string') return out.text;
    if (typeof out.result === 'string') return out.result;
    if (typeof out.translation === 'string') return out.translation;
    if (typeof out.translatedText === 'string') return out.translatedText;
    return String(out || '');
  }

  function getExternalTranslator() {
    if (typeof window.xTranslateText === 'function') return window.xTranslateText;
    if (window.xTopicFix && typeof window.xTopicFix.translateText === 'function') return window.xTopicFix.translateText;
    if (window.XTopicFix && typeof window.XTopicFix.translateText === 'function') return window.XTopicFix.translateText;
    return null;
  }

  function translateCacheKey(text) {
    const settings = getTranslateSettings();
    const external = getExternalTranslator() ? 'external' : 'google';
    return `haa9-translate:${external}:${settings.sourceLang}:${settings.targetLang}:${encodeURIComponent(norm(text)).slice(0, 220)}`;
  }

  async function translateText(text) {
    const clean = cleanTextForTranslate(text);
    if (!clean) return '';
    const key = translateCacheKey(clean);
    const cached = safeJsonGet(key);
    if (cached && cached.expiresAt > Date.now() && typeof cached.text === 'string') return cached.text;

    const external = getExternalTranslator();
    let translated = '';
    if (external) {
      translated = normalizeTranslateOutput(await Promise.resolve(external(clean)));
    } else {
      const settings = getTranslateSettings();
      const sl = settings.sourceLang && settings.sourceLang !== 'auto' ? settings.sourceLang : 'auto';
      const tl = settings.targetLang || 'zh';
      const url = 'https://translate.googleapis.com/translate_a/single?' + new URLSearchParams({ client: 'gtx', sl, tl, dt: 't', q: clean }).toString();
      const res = await fetch(url, { method: 'GET', credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) throw new Error(`translate ${res.status}`);
      const data = await res.json();
      const parts = Array.isArray(data && data[0]) ? data[0] : [];
      translated = parts.map(item => item && item[0] ? item[0] : '').join('');
    }
    translated = norm(translated);
    if (translated) safeJsonSet(key, { text: translated, expiresAt: Date.now() + CONFIG.translateCacheMs });
    return translated;
  }

  function makeTranslateButton(textSource, box) {
    const button = createElement('button', {
      class: 'haa9-text-translate-btn haa8-list-translate-btn',
      type: 'button',
      title: '翻译',
      'aria-label': '翻译',
      html: '<i class="fa-solid fa-language" aria-hidden="true"></i><span>翻译</span>'
    });
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const raw = typeof textSource === 'function' ? textSource() : String(textSource || '');
      const clean = cleanTextForTranslate(raw);
      if (!clean) return;
      if (box.classList.contains('is-show') && box.dataset.loaded === '1') {
        box.classList.remove('is-show');
        button.classList.remove('is-active');
        button.setAttribute('title', '翻译');
        button.setAttribute('aria-label', '翻译');
        return;
      }
      button.classList.add('is-loading', 'is-active');
      box.classList.add('is-show');
      if (box.dataset.loaded !== '1') {
        box.textContent = TEXT.translating;
        try {
          const out = await translateText(clean);
          box.textContent = out || '';
          box.dataset.loaded = out ? '1' : '0';
          if (!out) box.classList.remove('is-show');
        } catch (error) {
          console.warn('HAA9 translate failed:', error);
          box.textContent = TEXT.translateFail;
        }
      }
      button.classList.remove('is-loading');
      button.setAttribute('title', '隐藏翻译');
      button.setAttribute('aria-label', '隐藏翻译');
    });
    return button;
  }

  function attachTranslateToTextNode(node) {
    if (!isElement(node)) return;
    if (node.dataset.haa9TranslateReady === '1') return;
    if (node.closest('#haa9-root')) return;
    if (node.closest('.haa9-text-translate-box, .haa8-list-translate-box')) return;
    if (node.querySelector('.haa8-list-translate-btn, .haa9-text-translate-btn')) {
      node.dataset.haa9TranslateReady = '1';
      return;
    }
    const raw = String(node.textContent || '').trim();
    const clean = cleanTextForTranslate(raw);
    if (!clean || clean.length < 2) return;

    node.dataset.haa9TranslateReady = '1';
    const span = createElement('span', { class: 'haa9-text-main haa8-list-title', text: raw });
    const box = createElement('div', { class: 'haa9-text-translate-box haa8-list-translate-box' });
    const button = makeTranslateButton(() => span.textContent || raw, box);
    node.textContent = '';
    node.classList.add('haa8-list-title-line');
    node.appendChild(span);
    node.appendChild(button);
    node.insertAdjacentElement('afterend', box);
  }

  function restoreTranslateButtons(root = document) {
    $$('.haa9-text, .haa8-list-title-line, .haa9-list-title-line', root).forEach(node => {
      if (node.matches('.haa8-list-title-line, .haa9-list-title-line')) {
        if (node.dataset.haa9TranslateReady === '1') return;
        const title = $('.haa8-list-title, .haa9-list-title, .haa9-text-main', node);
        if (title) {
          const raw = title.textContent || '';
          if (!cleanTextForTranslate(raw)) return;
          node.dataset.haa9TranslateReady = '1';
          const box = createElement('div', { class: 'haa9-text-translate-box haa8-list-translate-box' });
          node.appendChild(makeTranslateButton(() => title.textContent || raw, box));
          node.insertAdjacentElement('afterend', box);
          return;
        }
      }
      attachTranslateToTextNode(node);
    });
  }

  function createAudioCard(item) {
    const src = typeof item === 'string' ? item : item.url;
    const initialDuration = Number((item && item.duration) || parseDurationFromUrl(src) || 0);
    const card = createElement('button', { class: 'haa9-audio', type: 'button', 'aria-label': (item && item.label) || 'audio' });
    card.innerHTML = html`<span class="haa9-audio-icon"><i class="fa-solid fa-play"></i></span><span class="haa9-audio-wave">${Array.from({ length: 12 }, (_, index) => `<i style="height:${8 + ((index * 7) % 18)}px"></i>`).join('')}</span><span class="haa9-audio-time">${formatDuration(initialDuration)}</span>`;
    const audio = new Audio(src);
    audio.preload = 'metadata';
    state.audios.add(audio);
    card.__haa9Audio = audio;

    const sync = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : initialDuration;
      const current = audio.paused || audio.ended ? 0 : audio.currentTime;
      const ratio = duration ? Math.min(1, current / duration) : 0;
      const bars = $$('.haa9-audio-wave i', card);
      const active = Math.ceil(ratio * bars.length);
      bars.forEach((bar, index) => bar.classList.toggle('is-active', index < active));
      const time = $('.haa9-audio-time', card);
      if (time) time.textContent = formatDuration(current > 0 ? current : duration);
    };

    ['loadedmetadata', 'durationchange', 'timeupdate', 'canplay'].forEach(event => audio.addEventListener(event, sync));
    audio.addEventListener('play', () => {
      if (state.activeAudio && state.activeAudio !== audio) state.activeAudio.pause();
      state.activeAudio = audio;
      card.classList.add('is-playing');
      const icon = $('.haa9-audio-icon i', card);
      if (icon) icon.className = 'fa-solid fa-pause';
      sync();
    });
    audio.addEventListener('pause', () => {
      card.classList.remove('is-playing');
      const icon = $('.haa9-audio-icon i', card);
      if (icon) icon.className = 'fa-solid fa-play';
      sync();
    });
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      card.classList.remove('is-playing');
      const icon = $('.haa9-audio-icon i', card);
      if (icon) icon.className = 'fa-solid fa-play';
      sync();
    });
    card.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
    });
    setTimeout(sync, 80);
    setTimeout(sync, 900);
    return card;
  }

  function canonicalTikTokUrl(url) {
    const match = String(url || '').replace(/&amp;/g, '&').match(RE.tiktokOne);
    return match ? `https://www.tiktok.com/@${match[1]}/video/${match[2]}` : String(url || '');
  }

  function tiktokPlayerUrl(videoId, autoplay = false) {
    const params = new URLSearchParams({
      autoplay: autoplay ? '1' : '0',
      muted: '1',
      loop: '1',
      rel: '0',
      controls: '0',
      progress_bar: '0',
      play_button: '0',
      volume_control: '0',
      fullscreen_button: '0',
      timestamp: '0',
      music_info: '0',
      description: '0',
      native_context_menu: '0',
      closed_caption: '0',
      playsinline: '1'
    });
    return `https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?${params.toString()}`;
  }

  function postPlayerMessage(iframe, type, value) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ 'x-tiktok-player': true, type, value }, '*');
  }

  function removeTikTokIframe(player) {
    if (!player) return;
    window.clearTimeout(player.timeout);
    player.timeout = 0;
    if (player.iframe && player.iframe.parentNode) player.iframe.parentNode.removeChild(player.iframe);
    player.iframe = null;
    player.ready = false;
    player.hasVisibleFrame = false;
    if (player.card) player.card.classList.remove('is-frame-visible');
  }

  function armTikTokTimeout(id, forUserPlay) {
    const player = state.players.get(id);
    if (!player) return;
    window.clearTimeout(player.timeout);
    player.timeout = window.setTimeout(() => {
      const latest = state.players.get(id);
      if (!latest || latest.ready) return;

      // Silent preloads are allowed to fail without showing an error. Otherwise
      // every nearby TikTok would turn into an error card before the user taps it.
      if (!latest.wantPlay) {
        // Keep the hidden iframe alive. On slow mobile networks TikTok can become
        // ready after our soft timeout; removing it makes the first tap restart
        // from zero and feels much slower.
        latest.preloadTimedOut = true;
        setVideoState(id, { status: 'paused', ready: false, wantPlay: false });
        return;
      }

      setVideoState(id, { status: 'unavailable', ready: false, wantPlay: false });
    }, forUserPlay ? (CONFIG.tiktokClickReadyTimeoutMs || CONFIG.tiktokReadyTimeoutMs) : (CONFIG.tiktokPreloadTimeoutMs || CONFIG.tiktokReadyTimeoutMs));
  }

  function pauseOtherVideos(currentId) {
    state.players.forEach((player, id) => {
      if (id === currentId) return;
      if (player.iframe) postPlayerMessage(player.iframe, 'pause');
      if (player.status !== 'unavailable') setVideoState(id, { status: 'paused', wantPlay: false });
    });
  }

  function setVideoState(id, patch) {
    const player = state.players.get(id);
    if (!player) return;
    Object.assign(player, patch);

    // Once the user has actually played a TikTok, keep the iframe's current
    // frame visible when paused. Preloaded videos still show the cached cover.
    if (player.status === 'playing' && player.ready) player.hasVisibleFrame = true;
    if (player.status === 'unavailable' || !player.iframe) player.hasVisibleFrame = false;

    const card = player.card;
    const showFrame = !!(player.iframe && player.ready && player.hasVisibleFrame && player.status !== 'unavailable');
    card.dataset.status = player.status;
    card.dataset.ready = player.ready ? '1' : '0';
    card.dataset.frameVisible = showFrame ? '1' : '0';
    card.classList.toggle('is-mounted', !!player.iframe);
    card.classList.toggle('is-frame-visible', showFrame);
    card.classList.toggle('is-playing', player.status === 'playing');
    card.classList.toggle('is-paused', player.status === 'paused');
    card.classList.toggle('is-loading', player.status === 'loading');
    card.classList.toggle('is-unavailable', player.status === 'unavailable');

    const playIcon = $('.haa9-video-play i', card);
    if (playIcon) playIcon.className = player.status === 'playing' ? 'fa-solid fa-pause' : 'fa-solid fa-play';

    const sound = $('.haa9-video-sound', card);
    if (sound) {
      sound.classList.toggle('is-on', !player.muted);
      sound.classList.toggle('is-ready', !!player.ready);
      sound.innerHTML = player.muted ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>' : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
      sound.setAttribute('title', player.muted ? '开启声音' : '关闭声音');
      sound.setAttribute('aria-label', player.muted ? '开启声音' : '关闭声音');
    }

    // The iframe and cover must never be semi-visible together. Keep the
    // cover only for cold/preloaded states. After first real playback, paused
    // state shows the actual paused video frame, not the thumbnail cover.
    const cover = $('.haa9-video-cover', card);
    if (cover) cover.classList.toggle('is-hidden', showFrame);

    const msg = $('.haa9-video-msg', card);
    if (msg) {
      msg.textContent = player.status === 'unavailable' ? TEXT.tiktokUnavailable : '';
      msg.classList.toggle('is-visible', player.status === 'unavailable');
    }
  }

  async function loadTikTokCover(videoId, url, img) {
    const key = `haa9-cover:${videoId}`;
    const stored = safeJsonGet(key);
    const now = Date.now();
    const storedUrl = stored && stored.url ? stored.url : '';
    const isFreshByCachedAt = !!(storedUrl && stored.cachedAt && now - Number(stored.cachedAt) < CONFIG.coverCacheMs);
    const isFreshByExpiresAt = !!(storedUrl && stored.expiresAt > now && (stored.expiresAt - now) <= CONFIG.coverCacheMs + 60000);
    if (isFreshByCachedAt || isFreshByExpiresAt) {
      img.src = storedUrl;
      return;
    }
    try {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalTikTokUrl(url))}`, { cache: 'force-cache' });
      if (!res.ok) throw new Error('cover');
      const json = await res.json();
      if (json.thumbnail_url) {
        safeJsonSet(key, { url: json.thumbnail_url, cachedAt: now, expiresAt: now + CONFIG.coverCacheMs });
        img.src = json.thumbnail_url;
        return;
      }
      if (storedUrl) img.src = storedUrl;
    } catch (_) {
      // Better to show an older cached thumbnail than a blank black card if
      // TikTok oEmbed is temporarily blocked or slow.
      if (storedUrl) img.src = storedUrl;
    }
  }

  function preloadTikTokPlayer(id, options = {}) {
    const player = state.players.get(id);
    if (!player) return null;
    const shell = $('.haa9-video-shell', player.card);
    if (!shell) return null;

    const userInitiated = !!options.userInitiated;
    const force = !!options.force;
    if (userInitiated) player.hasUserInteracted = true;

    if (player.iframe && !force) {
      if (options.autoplay && !player.ready) {
        postPlayerMessage(player.iframe, 'mute');
        postPlayerMessage(player.iframe, 'play');
        window.setTimeout(() => {
          const latest = state.players.get(id);
          if (latest && latest.iframe && !latest.hasUserInteracted && !latest.wantPlay) postPlayerMessage(latest.iframe, 'pause');
        }, 900);
      }
      if (userInitiated) armTikTokTimeout(id, true);
      return player.iframe;
    }

    if (force) removeTikTokIframe(player);

    const iframe = createElement('iframe', {
      class: 'haa9-video-frame',
      src: tiktokPlayerUrl(player.videoId, !!(options.autoplay || CONFIG.tiktokPreloadAutoplay)),
      allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
      loading: 'eager',
      referrerpolicy: 'strict-origin-when-cross-origin',
      title: 'TikTok Player',
      fetchpriority: userInitiated ? 'high' : 'auto'
    });
    shell.appendChild(iframe);

    player.iframe = iframe;
    player.ready = false;
    player.muted = true;
    player.hasVisibleFrame = false;
    player.preloadTimedOut = false;
    player.playRequestedAt = userInitiated ? Date.now() : 0;

    setVideoState(id, { status: userInitiated ? 'loading' : 'paused', ready: false, muted: true });
    armTikTokTimeout(id, userInitiated);
    return iframe;
  }

  function sendTikTokPlayCommands(player, withSound = false) {
    if (!player || !player.iframe) return;
    if (withSound) postPlayerMessage(player.iframe, 'unMute');
    else postPlayerMessage(player.iframe, 'mute');
    postPlayerMessage(player.iframe, 'play');
    window.setTimeout(() => {
      postPlayerMessage(player.iframe, 'play');
      if (withSound) postPlayerMessage(player.iframe, 'unMute');
    }, CONFIG.tiktokCommandDelayMs);
    window.setTimeout(() => {
      postPlayerMessage(player.iframe, 'play');
      if (withSound) postPlayerMessage(player.iframe, 'unMute');
    }, Math.max(360, CONFIG.tiktokCommandDelayMs * 4));
  }

  function mountTikTokPlayer(id) {
    const player = state.players.get(id);
    if (!player) return null;

    player.hasUserInteracted = true;
    player.wantPlay = true;
    player.playRequestedAt = Date.now();

    const mustRecreate = player.status === 'unavailable' || !player.iframe;
    if (mustRecreate) {
      preloadTikTokPlayer(id, { userInitiated: true, autoplay: true, force: player.status === 'unavailable' });
      return player.iframe;
    }

    armTikTokTimeout(id, true);

    if (!player.ready) {
      setVideoState(id, { status: 'loading' });
      if (player.iframe) sendTikTokPlayCommands(player);
      return player.iframe;
    }

    pauseOtherVideos(id);
    setVideoState(id, { status: 'playing', ready: true });
    sendTikTokPlayCommands(player);
    return player.iframe;
  }

  function requestTikTokPlay(id) {
    const player = state.players.get(id);
    if (!player) return;
    mountTikTokPlayer(id);
  }

  function requestTikTokPause(id) {
    const player = state.players.get(id);
    if (!player) return;
    player.wantPlay = false;
    if (player.iframe) postPlayerMessage(player.iframe, 'pause');
    if (player.status !== 'unavailable') setVideoState(id, { status: 'paused' });
  }

  function toggleTikTokPlay(id) {
    const player = state.players.get(id);
    if (!player) return;
    if (player.status === 'playing') requestTikTokPause(id);
    else requestTikTokPlay(id);
  }

  function preloadNearbyTikTokPlayers(centerId, radius = CONFIG.tiktokNeighborPreloadCount || 2) {
    if (navigator.connection && navigator.connection.saveData) return;
    const cards = $$('.haa9-video[data-player-id]');
    if (!cards.length) return;
    const index = cards.findIndex(card => card.dataset.playerId === centerId);
    if (index === -1) return;
    const start = Math.max(0, index - radius);
    const end = Math.min(cards.length - 1, index + radius);
    for (let i = start; i <= end; i += 1) {
      const id = cards[i] && cards[i].dataset ? cards[i].dataset.playerId : '';
      if (!id) continue;
      preloadTikTokPlayer(id, { userInitiated: false, autoplay: true });
    }
  }

  function observeTikTokPreload(card) {
    if (navigator.connection && navigator.connection.saveData) return;
    if (!('IntersectionObserver' in window)) {
      window.setTimeout(() => preloadTikTokPlayer(card.dataset.playerId), 500);
      return;
    }
    if (!state.videoObserver) {
      state.videoObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const id = entry.target.dataset.playerId;
          preloadTikTokPlayer(id, { userInitiated: false, autoplay: true });
          preloadNearbyTikTokPlayers(id);
          state.videoObserver.unobserve(entry.target);
        });
      }, { root: null, rootMargin: CONFIG.tiktokPreloadRootMargin, threshold: 0.01 });
    }
    state.videoObserver.observe(card);
  }


  function ensureTikTokFullscreenRoot() {
    let root = $('#haa9-tiktok-fullscreen');
    if (root) return root;

    root = createElement('div', { id: 'haa9-tiktok-fullscreen', 'aria-hidden': 'true' });
    root.innerHTML = html`
      <div class="haa9-tiktok-fs-backdrop"></div>
      <div class="haa9-tiktok-fs-stage-wrap"><div class="haa9-tiktok-fs-stage"></div></div>`;
    document.body.appendChild(root);

    const close = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      closeTikTokFullscreen({ userGesture: true });
    };
    $('.haa9-tiktok-fs-backdrop', root)?.addEventListener('click', event => {
      if (event.target && event.target.closest && event.target.closest('.haa9-video-sound')) return;
      close(event);
    });

    const stageWrap = $('.haa9-tiktok-fs-stage-wrap', root);
    let startX = 0;
    let startY = 0;
    let active = false;
    const startGesture = event => {
      if (!state.fullscreen) return;
      const point = event.touches ? event.touches[0] : event;
      if (!point) return;
      active = true;
      startX = point.clientX;
      startY = point.clientY;
    };
    const endGesture = event => {
      if (!active || !state.fullscreen) return;
      const point = event.changedTouches ? event.changedTouches[0] : event;
      active = false;
      if (!point) return;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const horizontalClose = absDx > 72 && absDx > (absDy * 0.9);
      const verticalClose = dy > 64 && absDy >= absDx;
      if (horizontalClose || verticalClose || (absDx > 40 && dy > 40)) closeTikTokFullscreen({ userGesture: true });
    };
    if (stageWrap) {
      stageWrap.addEventListener('touchstart', startGesture, { passive: true });
      stageWrap.addEventListener('touchend', endGesture, { passive: true });
      stageWrap.addEventListener('pointerdown', startGesture);
      stageWrap.addEventListener('pointerup', endGesture);
    }

    // Capture gestures at the overlay root as well. Some mobile browsers do not
    // reliably bubble touch events from iframe-adjacent layers, so this makes
    // left/right/down swipe-to-close much more dependable.
    root.addEventListener('touchstart', startGesture, { passive: true, capture: true });
    root.addEventListener('touchend', endGesture, { passive: true, capture: true });
    root.addEventListener('pointerdown', startGesture, true);
    root.addEventListener('pointerup', endGesture, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && root.classList.contains('is-open')) closeTikTokFullscreen({ userGesture: true });
    });

    return root;
  }

  function openTikTokFullscreen(id) {
    const player = state.players.get(id);
    if (!player || !player.card || !player.card.parentNode) return;
    if (state.fullscreen && state.fullscreen.id === id) {
      requestTikTokPlay(id);
      return;
    }
    if (state.fullscreen) closeTikTokFullscreen({ skipHistory: true });

    const root = ensureTikTokFullscreenRoot();
    const stage = $('.haa9-tiktok-fs-stage', root);
    if (!stage) return;

    const placeholder = createElement('div', { class: 'haa9-video-fs-placeholder' });
    player.card.parentNode.insertBefore(placeholder, player.card);
    stage.appendChild(player.card);
    player.card.classList.add('is-fullscreen');

    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('haa9-tiktok-fs-open');

    state.fullscreen = { id, card: player.card, placeholder, closing: false };

    requestTikTokPlay(id);
    window.setTimeout(() => {
      const latest = state.players.get(id);
      if (!latest || !latest.iframe || !state.fullscreen || state.fullscreen.id !== id) return;
      postPlayerMessage(latest.iframe, 'unMute');
      postPlayerMessage(latest.iframe, 'play');
      setVideoState(id, { muted: false, status: 'playing' });
    }, 90);
    window.setTimeout(() => {
      const latest = state.players.get(id);
      if (!latest || !latest.iframe || !state.fullscreen || state.fullscreen.id !== id) return;
      postPlayerMessage(latest.iframe, 'unMute');
      postPlayerMessage(latest.iframe, 'play');
      setVideoState(id, { muted: false });
    }, 520);
  }

  function closeTikTokFullscreen(options = {}) {
    const current = state.fullscreen;
    if (!current || current.closing) return;
    current.closing = true;

    const root = $('#haa9-tiktok-fullscreen');
    const stage = root && $('.haa9-tiktok-fs-stage', root);
    if (current.card) current.card.classList.remove('is-fullscreen');
    if (current.placeholder && current.placeholder.parentNode && current.card) current.placeholder.parentNode.insertBefore(current.card, current.placeholder);
    if (current.placeholder && current.placeholder.parentNode) current.placeholder.parentNode.removeChild(current.placeholder);
    if (stage) stage.innerHTML = '';
    if (root) {
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('haa9-tiktok-fs-open');
    requestTikTokPause(current.id);
    state.fullscreen = null;
  }

  function createVideoCard(item, extraClass = '') {
    const videoId = item.videoId || item;
    const sourceUrl = item.url || `https://www.tiktok.com/@unknown/video/${videoId}`;
    const id = `haa9-${videoId}-${Math.random().toString(36).slice(2)}`;
    const card = createElement('div', { class: `haa9-video ${extraClass}`.trim(), dataset: { videoId, playerId: id, status: 'paused', ready: '0' } });
    card.innerHTML = html`
      <div class="haa9-video-shell">
        <div class="haa9-video-cover"><img alt="TikTok cover"></div>
        <button class="haa9-video-hotspot" type="button" aria-label="播放或暂停"></button>
        <button class="haa9-video-play" type="button" aria-label="播放"><i class="fa-solid fa-play" aria-hidden="true"></i></button>
        <button class="haa9-video-sound" type="button" aria-label="开启声音" title="开启声音"><i class="fa-solid fa-volume-xmark" aria-hidden="true"></i></button>
        <div class="haa9-video-msg"></div>
      </div>`;
    state.players.set(id, {
      id,
      videoId,
      sourceUrl,
      card,
      iframe: null,
      ready: false,
      muted: true,
      status: 'paused',
      wantPlay: false,
      hasUserInteracted: false,
      hasVisibleFrame: false,
      preloadTimedOut: false,
      playRequestedAt: 0,
      timeout: 0
    });

    const img = $('.haa9-video-cover img', card);
    if (img) loadTikTokCover(videoId, sourceUrl, img);

    const handleMainVideoTap = event => {
      event.preventDefault();
      event.stopPropagation();

      if (!card.classList.contains('is-fullscreen')) {
        openTikTokFullscreen(id);
        return;
      }

      // Fullscreen tap zones:
      // - center / upper screen: pause or resume
      // - lower screen: exit fullscreen
      const y = Number(event.clientY || (event.changedTouches && event.changedTouches[0] && event.changedTouches[0].clientY) || 0);
      const viewportH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      const isLowerExitZone = y > viewportH * 0.68;
      const isExplicitPlayButton = !!(event.target && event.target.closest && event.target.closest('.haa9-video-play'));

      if (isLowerExitZone && !isExplicitPlayButton) {
        closeTikTokFullscreen({ userGesture: true });
        return;
      }

      toggleTikTokPlay(id);
    };

    $('.haa9-video-play', card).addEventListener('click', handleMainVideoTap);
    $('.haa9-video-hotspot', card).addEventListener('click', handleMainVideoTap);

    $('.haa9-video-sound', card).addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const player = state.players.get(id);
      if (!player) return;
      if (!player.iframe || player.status === 'unavailable') mountTikTokPlayer(id);
      if (!player.ready || !player.iframe) return;
      const nextMuted = !player.muted;
      postPlayerMessage(player.iframe, nextMuted ? 'mute' : 'unMute');
      setVideoState(id, { muted: nextMuted });
    });

    setVideoState(id, { status: 'paused', muted: true });
    observeTikTokPreload(card);
    window.setTimeout(() => {
      if (!document.body.contains(card)) return;
      if (navigator.connection && navigator.connection.saveData) return;
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight + 1500 && rect.bottom > -300) {
        preloadTikTokPlayer(id, { userInitiated: false, autoplay: true });
        preloadNearbyTikTokPlayers(id);
      }
    }, 180);
    return card;
  }

  if (!window.__haa9TikTokMessageHandlerInstalledV4) {
    window.__haa9TikTokMessageHandlerInstalledV4 = true;
    window.addEventListener('message', event => {
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return; }
      }
      if (!data || !data['x-tiktok-player']) return;
      let host = '';
      try { host = new URL(event.origin).hostname; } catch (_) {}
      if (!/(^|\.)tiktok\.com$|(^|\.)tiktokcdn\.com$/.test(host)) return;

      state.players.forEach(player => {
        if (!player.iframe || player.iframe.contentWindow !== event.source) return;

        if (data.type === 'onPlayerReady') {
          window.clearTimeout(player.timeout);
          player.timeout = 0;
          player.ready = true;
          player.preloadTimedOut = false;
          const wantsFullscreenSound = !!(state.fullscreen && state.fullscreen.id === player.id);
          if (wantsFullscreenSound) postPlayerMessage(player.iframe, 'unMute');
          else postPlayerMessage(player.iframe, 'mute');
          if (player.wantPlay) {
            pauseOtherVideos(player.id);
            setVideoState(player.id, { status: 'playing', ready: true, muted: !wantsFullscreenSound });
            player.playRequestedAt = Date.now();
            sendTikTokPlayCommands(player, wantsFullscreenSound);
          } else {
            setVideoState(player.id, { status: 'paused', ready: true, muted: true });
            window.setTimeout(() => {
              const latest = state.players.get(player.id);
              if (latest && latest.iframe && !latest.wantPlay) postPlayerMessage(latest.iframe, 'pause');
            }, 120);
          }
          return;
        }

        if (data.type === 'onStateChange') {
          const raw = data.value;
          const value = typeof raw === 'number' ? raw : Number(raw);
          const word = String(raw || '').toLowerCase();

          if (value === 1 || word === 'playing') {
            window.clearTimeout(player.timeout);
            player.timeout = 0;
            if (!player.wantPlay && !player.hasUserInteracted) {
              postPlayerMessage(player.iframe, 'pause');
              setVideoState(player.id, { status: 'paused', ready: true, muted: true });
              return;
            }
            pauseOtherVideos(player.id);
            setVideoState(player.id, { status: 'playing', ready: true });
            return;
          }

          if (value === 3 || word === 'buffering') {
            if (player.wantPlay) setVideoState(player.id, { status: 'loading', ready: true });
            return;
          }

          if ([0, 2].includes(value) || word === 'ended' || word === 'paused') {
            const justAskedToPlay = player.wantPlay && Date.now() - Number(player.playRequestedAt || 0) < CONFIG.tiktokIgnoreEarlyPauseMs;
            if (justAskedToPlay) {
              sendTikTokPlayCommands(player);
              return;
            }
            setVideoState(player.id, { status: 'paused', wantPlay: false, ready: true });
            return;
          }
        }

        if (data.type === 'onMute') {
          setVideoState(player.id, { muted: !!data.value });
          return;
        }

        if (data.type === 'onPlayerError' || data.type === 'onError') {
          // A preload error should stay invisible until the user actually taps play.
          if (!player.wantPlay && !player.hasUserInteracted) {
            removeTikTokIframe(player);
            player.preloadTimedOut = true;
            setVideoState(player.id, { status: 'paused', ready: false, wantPlay: false });
            return;
          }
          setVideoState(player.id, { status: 'unavailable', ready: false, wantPlay: false });
        }
      });
    });
  }

  function createImageGrid(images = []) {
    const list = images.slice(0, CONFIG.maxImages).filter(Boolean);
    const count = list.length;
    const strip = createElement('div', { class: 'haa9-image-list haa9-image-grid haa9-bleed', dataset: { count: String(count) } });
    list.forEach((src, index) => {
      const button = createElement('button', { class: 'haa9-image', type: 'button', dataset: { src, index: String(index) } });
      button.appendChild(createElement('img', { src, alt: `image ${index + 1}`, loading: 'lazy' }));
      strip.appendChild(button);
    });
    return strip;
  }

  function createContent(media, options = {}) {
    const text = cleanDisplayText(media.text || '');
    const title = cleanDisplayText(media.title || '');
    const hasText = !!text;
    const hasImages = media.images && media.images.length;
    const hasAudios = media.audios && media.audios.length;
    const hasTiktoks = media.tiktoks && media.tiktoks.length;
    if (!hasText && !hasImages && !hasAudios && !hasTiktoks && !media.locked) return null;

    const box = createElement('div', { class: `haa9-content ${options.extraClass || ''}${media.locked ? ' haa9-locked-content' : ''}`.trim() });
    if (media.locked) {
      if (title) box.appendChild(createElement('div', { class: 'haa9-text haa9-locked-title', text: title }));
      box.appendChild(createElement('div', { class: 'haa9-study-locked', html: `${icon('fa-lock')}<span>${TEXT.studyLockedText}</span>` }));
      return box;
    }
    if (hasText) box.appendChild(createElement('div', { class: 'haa9-text', text }));

    if (hasAudios) {
      const list = createElement('div', { class: 'haa9-audio-list' });
      media.audios.forEach(audio => list.appendChild(createAudioCard(audio)));
      box.appendChild(list);
    }

    if (hasImages) {
      box.appendChild(createImageGrid(media.images));
    }

    if (hasTiktoks) {
      const videos = createElement('div', { class: 'haa9-video-list haa9-bleed' });
      media.tiktoks.forEach(item => videos.appendChild(createVideoCard(item, options.videoClass || '')));
      box.appendChild(videos);
    }

    restoreTranslateButtons(box);
    return box;
  }

  function baseRow(item) {
    return $(':scope > .d-flex.p-0, :scope > .d-flex, :scope > .card, :scope > .topic-row, :scope > .list-group-item', item) || item.firstElementChild || item;
  }

  function mainColumn(li) {
    const row = baseRow(li);
    return $(':scope > .flex-grow-1', row) || row;
  }

  function ensureTopicSkeleton(li) {
    if (!li || $('.haa9-skeleton-content', li) || li.dataset.haa9Ready === '1') return;
    li.dataset.haa9Topic = '1';
    li.dataset.haa9Loading = '1';
    const row = baseRow(li);
    const skeleton = createElement('div', { class: 'haa9-content haa9-skeleton-content', 'aria-hidden': 'true' });
    skeleton.innerHTML = '<span class="haa9-skeleton-line w1"></span><span class="haa9-skeleton-line w2"></span><span class="haa9-skeleton-media"></span>';
    if (row && row.parentNode === li) row.insertAdjacentElement('afterend', skeleton);
    else li.appendChild(skeleton);
  }

  function cleanupTopic(li) {
    $$('.haa9-user, .haa9-content, .haa9-meta-row, .haa9-skeleton-content', li).forEach(node => node.remove());
  }

  function markNative(li, ready) {
    li.dataset.haa9Ready = ready ? '1' : '0';
    li.dataset.haa9Topic = '1';
    li.dataset.haa9Loading = ready ? '0' : '1';
  }

  async function hydrateTopic(li) {
    if (!isTargetTopicItem(li)) return;
    if (li.dataset.haa9Hydrating === '1') return;
    const tid = getTopicId(li);
    if (!tid) return;

    ensureTopicSkeleton(li);
    li.dataset.haa9Hydrating = '1';

    try {
      const user = categoryUser(li);
      const [profile, media] = await Promise.all([fetchProfile(user), fetchTopicMedia(tid)]);
      if (!document.body.contains(li)) return;
      cleanupTopic(li);
      const mergedUser = Object.assign({}, user, { uid: String(profile.uid || profile.userId || profile.userid || user.uid || '') });
      decorateAvatar(li, profile);
      const headerTime = timeMetaFromTopic(li);
      mainColumn(li).prepend(makeUserHeader(mergedUser, profile, '', { time: headerTime }));

      media.title = media.title || topicTitleFromItem(li);
      const row = baseRow(li);
      const content = createContent(media);
      if (content) row.insertAdjacentElement('afterend', content);
      else row.insertAdjacentElement('afterend', createElement('div', { class: 'haa9-content haa9-empty-content' }));

      const meta = makeMetaRow(li, { hideTime: true });
      const target = content || $('.haa9-empty-content', li);
      if (target) target.insertAdjacentElement('afterend', meta);
      else row.insertAdjacentElement('afterend', meta);

      markNative(li, true);
      li.dataset.haa9Hydrated = '1';
      restoreTranslateButtons(li);
    } catch (error) {
      console.warn('HAA9 hydrate failed:', error);
      li.dataset.haa9Loading = '0';
    } finally {
      li.dataset.haa9Hydrating = '0';
    }
  }

  function pauseTopicMedia(li) {
    $$('.haa9-video', li).forEach(card => {
      const id = card.dataset.playerId;
      const player = state.players.get(id);
      if (player && player.iframe) postPlayerMessage(player.iframe, 'pause');
      if (player) setVideoState(id, { status: 'paused', wantPlay: false });
    });
    $$('.haa9-audio', li).forEach(card => {
      const audio = card.__haa9Audio;
      if (audio) audio.pause();
    });
  }

  function listRoot() {
    return $('[component="category/topic/list"]') || $('ul[component="category"]') || $('.category > ul') || document.body;
  }

  function observeTopics() {
    const topics = $$('li[component="category/topic"]', listRoot()).filter(isTargetTopicItem);
    if (!('IntersectionObserver' in window)) {
      topics.forEach(li => {
        ensureTopicSkeleton(li);
        hydrateTopic(li);
      });
      return;
    }
    if (!state.topicObserver) {
      state.topicObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const li = entry.target;
          if (entry.isIntersecting) hydrateTopic(li);
          else if (li.dataset.haa9Hydrated === '1') pauseTopicMedia(li);
        });
      }, { root: null, rootMargin: CONFIG.virtualRootMargin, threshold: 0.01 });
    }
    topics.forEach(li => {
      ensureTopicSkeleton(li);
      if (li.dataset.haa9Observed === '1') return;
      li.dataset.haa9Observed = '1';
      state.topicObserver.observe(li);
    });
  }

  function closestTopicItemFromLink(link) {
    if (!isElement(link)) return null;
    return link.closest('li[component="category/topic"], li[component="user/topic"], li[data-tid], [data-tid], .topic-row, .topic-list-item, .category-item, .card, li');
  }

  function userTopicItems(root = document) {
    const direct = $$('li[component="category/topic"], li[component="user/topic"], li[data-tid], [data-tid][component*="topic" i], .topic-row, .topic-list-item', root);
    const fromLinks = $$('a[href*="/topic/"]', root).map(closestTopicItemFromLink).filter(Boolean);
    return Array.from(new Set([...direct, ...fromLinks])).filter(item => isElement(item)).filter(item => !!getTopicId(item)).filter(item => !item.closest('#haa9-root'));
  }

  function hasTargetCid(item, media) {
    const direct = Number(item.dataset.cid || item.getAttribute('data-cid') || 0);
    if (direct) return Number(CONFIG.cid) === 0 || direct === Number(CONFIG.cid);
    const mediaCid = Number(media && media.cid || 0);
    if (mediaCid) return Number(CONFIG.cid) === 0 || mediaCid === Number(CONFIG.cid);
    return true;
  }

  function ensureUserTopicSkeleton(item) {
    if (!isElement(item) || $('.haa9-user-topic-skeleton', item)) return;
    item.dataset.haa9UserTopicReady = '1';
    item.dataset.haa9Loading = '1';
    const row = baseRow(item);
    const skeleton = createElement('div', { class: 'haa9-content haa9-user-topic-skeleton haa9-skeleton-content', 'aria-hidden': 'true' });
    skeleton.innerHTML = '<span class="haa9-skeleton-line w1"></span><span class="haa9-skeleton-line w2"></span>';
    if (row && row.parentNode === item) row.insertAdjacentElement('afterend', skeleton);
    else item.appendChild(skeleton);
  }

  async function decorateUserTopicUser(item) {
    if (!isElement(item) || $('.haa9-user-topic-head', item)) return;
    const user = userFromTopicItem(item);
    if (!user.userslug && !user.uid) return;
    const profile = await fetchProfile(user);
    if (!document.body.contains(item) || $('.haa9-user-topic-head', item)) return;
    const row = baseRow(item);
    const header = makeUserTopicHeader(user, profile || {}, item);
    if (row && row.parentNode === item) row.insertAdjacentElement('beforebegin', header);
    else item.prepend(header);
  }

  async function hydrateUserTopicItem(item) {
    if (!shouldHandleUserTopics() || !isElement(item)) return;
    if (item.dataset.haa9UserTopicsHydrating === '1' || item.dataset.haa9UserTopicsHydrated === '1') return;
    const tid = getTopicId(item);
    if (!tid) return;

    item.dataset.haa9UserTopicsHydrating = '1';
    ensureUserTopicSkeleton(item);

    try {
      const user = userFromTopicItem(item);
      const [profile, media] = await Promise.all([fetchProfile(user), fetchTopicMedia(tid)]);
      if (!document.body.contains(item)) return;
      if (!hasTargetCid(item, media)) {
        item.dataset.haa9UserTopicsHydrated = '1';
        $('.haa9-user-topic-skeleton', item)?.remove();
        item.dataset.haa9Loading = '0';
        return;
      }
      $$('.haa9-user-topic-head, .haa9-user-topic-user, .haa9-user-topic-content, .haa9-user-topic-media, .haa9-user-topic-skeleton, .haa9-meta-row', item).forEach(node => node.remove());
      const row = baseRow(item);
      const header = makeUserTopicHeader(user, profile || {}, item, { time: timeMetaFromTopic(item) });
      if (row && row.parentNode === item) row.insertAdjacentElement('beforebegin', header);
      else item.prepend(header);

      media.title = media.title || topicTitleFromItem(item);
      const block = createContent(media, { extraClass: 'haa9-user-topic-content', videoClass: 'haa9-user-topic-video' }) ||
        createElement('div', { class: 'haa9-content haa9-user-topic-content haa9-empty-content' });
      if (row && row.parentNode === item) row.insertAdjacentElement('afterend', block);
      else item.appendChild(block);

      const meta = makeMetaRow(item, { hideTime: true });
      block.insertAdjacentElement('afterend', meta);

      item.dataset.haa9UserTopicsHydrated = '1';
      item.dataset.haa9Topic = '1';
      item.dataset.haa9Loading = '0';
      item.classList.add('haa9-user-topic-ready');
      document.body.classList.add('haa9-mode', 'haa9-user-topics-mode');
      restoreTranslateButtons(item);
    } catch (error) {
      console.warn('HAA9 user topic hydrate failed:', error);
      item.dataset.haa9Loading = '0';
    } finally {
      item.dataset.haa9UserTopicsHydrating = '0';
      $('.haa9-user-topic-skeleton', item)?.remove();
    }
  }

  function pauseUserTopicMedia(item) {
    $$('.haa9-user-topic-video', item).forEach(card => {
      const id = card.dataset.playerId;
      const player = state.players.get(id);
      if (!player) return;
      if (player.iframe) postPlayerMessage(player.iframe, 'pause');
      setVideoState(id, { status: 'paused', wantPlay: false });
    });
    $$('.haa9-audio', item).forEach(card => {
      if (card.__haa9Audio) card.__haa9Audio.pause();
    });
  }

  function observeUserTopicItems() {
    if (!shouldHandleUserTopics()) return;
    document.body.classList.add('haa9-mode', 'haa9-user-topics-mode');
    const items = userTopicItems(document);
    if (!('IntersectionObserver' in window)) {
      items.forEach(hydrateUserTopicItem);
      return;
    }
    if (!state.userTopicObserver) {
      state.userTopicObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const item = entry.target;
          if (entry.isIntersecting) hydrateUserTopicItem(item);
          else pauseUserTopicMedia(item);
        });
      }, { root: null, rootMargin: CONFIG.userTopicRootMargin, threshold: 0.01 });
    }
    items.forEach(item => {
      if (item.dataset.haa9UserTopicsObserved === '1') return;
      item.dataset.haa9UserTopicsObserved = '1';
      ensureUserTopicSkeleton(item);
      state.userTopicObserver.observe(item);
    });
  }

  function hideLoadNewPosts() {
    const selectors = [
      '[component="category/new-posts"]', '[component="category/new_posts"]', '[component="category/load-more"]', '[component="category/load_more"]',
      '[component="category/update"]', '[component="category/updates"]', '[data-action="new-posts"]', '[data-action="new_posts"]',
      '[data-action="load-more"]', '[data-action="load_more"]', '[data-action="loadMore"]', '[data-action="update"]', '[data-action="updates"]'
    ];
    $$(selectors.join(',')).forEach(node => {
      if (node.closest('#haa9-root')) return;
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('opacity', '0', 'important');
      node.setAttribute('aria-hidden', 'true');
    });
    $$('a, button, .btn, .alert, .alert-info').forEach(node => {
      const text = norm(node.textContent);
      if (!text || !/(加载新的帖子|加载新帖子|new posts|load new posts)/i.test(text)) return;
      if (node.closest('#haa9-root')) return;
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('opacity', '0', 'important');
      node.setAttribute('aria-hidden', 'true');
    });
  }

  function debounceScan(delay = CONFIG.scanDelay) {
    window.clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(run, delay);
  }

  function observeMutations() {
    if (state.mutationObserver) return;
    state.mutationObserver = new MutationObserver(mutations => {
      let shouldScan = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!isElement(node)) continue;
          if (node.matches?.('li[component="category/topic"], .haa9-text, [data-tid], a[href*="/topic/"]') ||
              node.querySelector?.('li[component="category/topic"], .haa9-text, [data-tid], a[href*="/topic/"]')) {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) break;
      }
      if (shouldScan) debounceScan(160);
    });
    state.mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function cleanupCategoryUi() {
    document.body.classList.remove('haa9-mode', 'haa9-user-topics-mode');
    $('#haa9-root')?.remove();
    $('#haa9-essence-filter')?.remove();
    $('#haa9-essence-toolbar-fallback')?.remove();
    if (state.fullscreen) closeTikTokFullscreen({ userGesture: true });
    state.players.forEach((player, id) => {
      if (player && player.iframe) postPlayerMessage(player.iframe, 'pause');
      if (!player || !player.card || !document.body.contains(player.card)) {
        removeTikTokIframe(player);
        state.players.delete(id);
      }
    });
  }

  function icon(name) {
    return `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
  }

  function essenceTagName() {
    return CONFIG.essenceTag || TEXT.essence || '精华';
  }

  function sameTagName(value, target = essenceTagName()) {
    const clean = text => {
      let raw = String(text || '').trim().replace(/^#/, '');
      try { raw = decodeURIComponent(raw); } catch (_) {}
      return raw.replace(/[\s_\-]+/g, '').toLowerCase();
    };
    return !!clean(value) && clean(value) === clean(target);
  }

  function essenceFilterActive() {
    try {
      const url = new URL(location.href);
      const values = [url.searchParams.get('tag'), url.searchParams.get('tags'), url.searchParams.get('filter')].filter(Boolean);
      if (values.some(value => sameTagName(value))) return true;
      return /(?:^|\/)tags?\//i.test(url.pathname) && sameTagName(url.pathname.split('/').pop() || '');
    } catch (_) {
      return false;
    }
  }

  function nativeEssenceHref() {
    const tag = essenceTagName();
    const links = $$('a[href*="/tags/"], a[href*="/tag/"], [component="tag/filter"] a, .tag-list a, .dropdown-menu a').filter(link => {
      const text = norm(link.getAttribute('data-tag') || link.getAttribute('title') || link.textContent || '');
      return sameTagName(text, tag);
    });
    const found = links.find(link => link.href || link.getAttribute('href'));
    if (found) return found.getAttribute('href') || found.href;
    const url = new URL(location.href);
    url.searchParams.set('tag', tag);
    return url.pathname + url.search + url.hash;
  }

  function navigateEssenceFilter(nextActive) {
    const url = new URL(location.href);
    if (nextActive) {
      const nativeHref = nativeEssenceHref();
      if (window.ajaxify && typeof window.ajaxify.go === 'function') ajaxify.go(nativeHref);
      else window.location.assign(nativeHref);
      return;
    }
    ['tag', 'tags', 'filter'].forEach(key => {
      const value = url.searchParams.get(key);
      if (value && sameTagName(value)) url.searchParams.delete(key);
    });
    const path = url.pathname + url.search + url.hash;
    if (window.ajaxify && typeof window.ajaxify.go === 'function') ajaxify.go(path);
    else window.location.assign(path);
  }

  function toolbarActionChildren(host) {
    if (!isElement(host) || host.closest('#haa9-root') || host.closest('li[component="category/topic"]')) return [];
    return Array.from(host.children || []).filter(child => {
      if (!isElement(child) || child.id === 'haa9-essence-filter' || child.id === 'haa9-essence-toolbar-fallback') return false;
      if (child.matches('.dropdown-menu, .modal, script, style')) return false;
      if (child.matches('button, a, .btn, .btn-group, .dropdown, li')) return true;
      return !!child.querySelector(':scope > button, :scope > a, :scope > .btn, :scope > .btn-group, :scope > .dropdown');
    });
  }

  function toolbarButtonCount(host) {
    if (!isElement(host) || host.closest('#haa9-root') || host.closest('li[component="category/topic"]')) return 0;
    return $$('button, a, .btn', host).filter(node => {
      if (!isElement(node) || node.id === 'haa9-essence-filter') return false;
      if (node.closest('.dropdown-menu, #haa9-root, li[component="category/topic"]')) return false;
      return true;
    }).length;
  }

  function compactToolbarHost(seed) {
    if (!isElement(seed)) return null;
    const candidates = [];
    let node = seed;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (!isElement(node) || node === document.body || node === document.documentElement) break;
      if (node.closest('#haa9-root') || node.closest('li[component="category/topic"]')) break;
      if (node.matches('.dropdown-menu, .modal')) continue;
      const actionChildren = toolbarActionChildren(node).length;
      const buttons = toolbarButtonCount(node);
      if (actionChildren >= 2 || buttons >= 2 || node.matches('[component="category/controls"], [component="category/tools"], .category-tools, .category-controls, .btn-toolbar')) candidates.push(node);
      if (node.matches('[component="category/header"], .category-header, main, body')) break;
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const scoreA = toolbarActionChildren(a).length * 100 + toolbarButtonCount(a);
      const scoreB = toolbarActionChildren(b).length * 100 + toolbarButtonCount(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (a.querySelectorAll('*').length || 0) - (b.querySelectorAll('*').length || 0);
    });
    return candidates[0];
  }

  function findToolbarByKnownSelectors() {
    const selectors = [
      '[component="category/controls"]', '[component="category/tools"]', '[component="category/header"] .category-tools', '[component="category/header"] .category-controls',
      '.category-header .category-tools', '.category-header .category-controls', '.category-tools', '.category-controls',
      '[component="category/header"] .btn-toolbar', '.category-header .btn-toolbar', '.topic-list-header .btn-toolbar',
      '[component="category/sort"]', '[component="category/watch"]', '[component="category/tag"]',
      'button[title*="排序"], a[title*="排序"], button[aria-label*="排序"], a[aria-label*="排序"]',
      'button[title*="关注"], a[title*="关注"], button[aria-label*="关注"], a[aria-label*="关注"]',
      'button[title*="标签"], a[title*="标签"], button[aria-label*="标签"], a[aria-label*="标签"]'
    ];
    for (const selector of selectors) {
      const node = $(selector);
      if (!node || node.closest('#haa9-root') || node.closest('li[component="category/topic"]')) continue;
      const host = compactToolbarHost(node) || node;
      if (host && host !== document.body && host !== document.documentElement) return host;
    }
    return null;
  }

  function findToolbarByIconRow() {
    const root = listRoot();
    const buttons = $$('button, a, .btn').filter(node => {
      if (!isElement(node) || node.id === 'haa9-essence-filter') return false;
      if (node.closest('#haa9-root, li[component="category/topic"], .post-container')) return false;
      if (root && root.contains(node)) return false;
      const signal = `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''} ${node.textContent || ''} ${node.innerHTML || ''}`;
      return /(排序|关注|标签|分类|筛选|fa-(?:tags?|sort|filter|sliders|bell|eye|list|comments?|inbox|folder|bars))/i.test(signal);
    });
    for (const node of buttons) {
      const host = compactToolbarHost(node);
      if (host) return host;
    }
    return null;
  }

  function toolbarInsertAfter(host) {
    const children = toolbarActionChildren(host);
    if (!children.length) return null;
    const tagChild = children.find(child => /(标签|tag|fa-tags?)/i.test(`${child.getAttribute('title') || ''} ${child.getAttribute('aria-label') || ''} ${child.textContent || ''} ${child.innerHTML || ''}`));
    if (tagChild) tagChild.classList.add('haa9-native-tag-hidden');
    return tagChild || children[children.length - 1];
  }

  function findCategoryToolbarPlacement() {
    const host = findToolbarByKnownSelectors() || findToolbarByIconRow();
    if (host) return { host, after: toolbarInsertAfter(host), fallback: false };
    let fallback = $('#haa9-essence-toolbar-fallback');
    if (!fallback) {
      fallback = createElement('div', { id: 'haa9-essence-toolbar-fallback', class: 'haa9-essence-toolbar-fallback' });
      const root = listRoot();
      if (root && root.parentNode) root.parentNode.insertBefore(fallback, root);
      else document.body.appendChild(fallback);
    }
    return { host: fallback, after: null, fallback: true };
  }

  function syncEssenceToolbarButton() {
    const button = $('#haa9-essence-filter');
    if (!button) return;
    const active = essenceFilterActive();
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.title = active ? (TEXT.cancelEssence || '取消只看精华') : TEXT.essenceOnly;
  }

  function ensureEssenceToolbar() {
    if (!isTargetCategoryPage()) return;
    const placement = findCategoryToolbarPlacement();
    if (!placement || !placement.host) return;
    let button = $('#haa9-essence-filter');
    if (!button) {
      button = createElement('button', {
        id: 'haa9-essence-filter',
        class: 'btn btn-sm btn-light haa9-essence-filter',
        type: 'button',
        html: `${icon('fa-star')}<span class="haa9-essence-text">${TEXT.essence}</span>`,
        onclick: event => {
          event.preventDefault();
          event.stopPropagation();
          navigateEssenceFilter(!essenceFilterActive());
        }
      });
    }
    button.classList.toggle('is-native-toolbar', !placement.fallback);
    if (placement.after && placement.after.parentElement === placement.host) placement.after.insertAdjacentElement('afterend', button);
    else if (button.parentElement !== placement.host) placement.host.appendChild(button);
    syncEssenceToolbarButton();
  }

  function ensureComposer() {
    if (!isTargetCategoryPage()) return;
    if ($('#haa9-root')) return;
    const root = createElement('div', { id: 'haa9-root' });
    root.innerHTML = html`
      <button type="button" id="haa9-fab" aria-label="${TEXT.publish}" title="${TEXT.publish}">${icon('fa-pen')}</button>
      <div id="haa9-overlay"></div>
      <section id="haa9-composer" role="dialog" aria-modal="true">
        <div class="haa9-composer-head"><span class="haa9-grip"></span><button type="button" id="haa9-close" aria-label="close">${icon('fa-xmark')}</button></div>
        <div id="haa9-record"><span class="haa9-record-dot"></span><span class="haa9-record-wave"><i></i><i></i><i></i><i></i></span><span id="haa9-record-time">00:00</span></div>
        <div id="haa9-preview"><div id="haa9-image-preview" class="haa9-preview-card haa9-image-preview-grid"><button type="button" id="haa9-remove-image" class="haa9-preview-remove">${icon('fa-xmark')}</button><div class="haa9-preview-images"></div></div><div id="haa9-voice-preview" class="haa9-preview-card"><button type="button" id="haa9-remove-voice" class="haa9-preview-remove">${icon('fa-xmark')}</button><div class="haa9-voice-preview-inner"></div></div></div>
        <textarea id="haa9-text" placeholder="${TEXT.placeholder}"></textarea>
        <div class="haa9-compose-actions">
          <div class="haa9-image-picker"><button type="button" class="haa9-tool" id="haa9-image-btn" aria-label="image">${icon('fa-image')}</button><div id="haa9-image-menu"><button type="button" id="haa9-camera-btn">${TEXT.camera}</button><button type="button" id="haa9-gallery-btn">${TEXT.gallery}</button></div></div>
          <button type="button" class="haa9-tool" id="haa9-voice-btn" aria-label="voice">${icon('fa-microphone')}</button>
          <button type="button" class="haa9-tool" id="haa9-compose-translate-btn" aria-label="${TEXT.translateInput}" title="${TEXT.translateInput}">${icon('fa-language')}</button>
          <div id="haa9-meta"></div>
          <button type="button" id="haa9-send">${TEXT.publish}</button>
        </div>
        <input type="file" id="haa9-camera-input" accept="image/*" capture="environment">
        <input type="file" id="haa9-gallery-input" accept="image/*" multiple>
      </section>`;
    document.body.appendChild(root);
    bindComposer();
  }

  function restoreFabPosition() {
    const fab = $('#haa9-fab');
    if (!fab) return;
    const saved = safeJsonGet('haa9-fab-position', null);
    if (!saved || typeof saved.left !== 'number' || typeof saved.top !== 'number') return;
    const maxLeft = Math.max(8, window.innerWidth - fab.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - fab.offsetHeight - 8);
    fab.style.left = `${Math.min(maxLeft, Math.max(8, saved.left))}px`;
    fab.style.top = `${Math.min(maxTop, Math.max(8, saved.top))}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  function bindFabDrag() {
    const fab = $('#haa9-fab');
    if (!fab || fab.dataset.dragReady === '1') return;
    fab.dataset.dragReady = '1';
    restoreFabPosition();
    fab.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      state.composer.fabPointerId = event.pointerId;
      state.composer.fabDragging = true;
      state.composer.fabMoved = false;
      state.composer.fabStartX = event.clientX;
      state.composer.fabStartY = event.clientY;
      const rect = fab.getBoundingClientRect();
      state.composer.fabLeft = rect.left;
      state.composer.fabTop = rect.top;
      fab.setPointerCapture?.(event.pointerId);
    });
    fab.addEventListener('pointermove', event => {
      if (!state.composer.fabDragging || state.composer.fabPointerId !== event.pointerId) return;
      const dx = event.clientX - state.composer.fabStartX;
      const dy = event.clientY - state.composer.fabStartY;
      if (Math.abs(dx) + Math.abs(dy) > 6) state.composer.fabMoved = true;
      const maxLeft = window.innerWidth - fab.offsetWidth - 8;
      const maxTop = window.innerHeight - fab.offsetHeight - 8;
      const left = Math.min(maxLeft, Math.max(8, state.composer.fabLeft + dx));
      const top = Math.min(maxTop, Math.max(8, state.composer.fabTop + dy));
      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    });
    const end = event => {
      if (!state.composer.fabDragging || state.composer.fabPointerId !== event.pointerId) return;
      state.composer.fabDragging = false;
      state.composer.fabPointerId = null;
      const rect = fab.getBoundingClientRect();
      safeJsonSet('haa9-fab-position', { left: rect.left, top: rect.top });
      setTimeout(() => { state.composer.fabMoved = false; }, 0);
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
  }

  function bindComposer() {
    bindFabDrag();
    $('#haa9-fab').addEventListener('click', event => {
      if (state.composer.fabMoved) {
        event.preventDefault();
        return;
      }
      openComposer();
    });
    $('#haa9-overlay').addEventListener('click', closeComposer);
    $('#haa9-close').addEventListener('click', closeComposer);
    $('#haa9-text').addEventListener('input', autoSizeComposer);
    $('#haa9-image-btn').addEventListener('click', event => {
      event.stopPropagation();
      state.composer.menuOpen = !state.composer.menuOpen;
      $('#haa9-image-menu').classList.toggle('is-open', state.composer.menuOpen);
    });
    document.addEventListener('click', () => {
      state.composer.menuOpen = false;
      $('#haa9-image-menu')?.classList.remove('is-open');
    });
    $('#haa9-camera-btn').addEventListener('click', event => { event.stopPropagation(); $('#haa9-camera-input').click(); $('#haa9-image-menu').classList.remove('is-open'); });
    $('#haa9-gallery-btn').addEventListener('click', event => { event.stopPropagation(); $('#haa9-gallery-input').click(); $('#haa9-image-menu').classList.remove('is-open'); });
    $('#haa9-camera-input').addEventListener('change', handleImageInput);
    $('#haa9-gallery-input').addEventListener('change', handleImageInput);
    $('#haa9-remove-image').addEventListener('click', () => setPendingImages([]));
    $('#haa9-remove-voice').addEventListener('click', () => setPendingVoice(null, 0));
    $('#haa9-voice-btn').addEventListener('click', toggleRecording);
    $('#haa9-compose-translate-btn').addEventListener('click', translateComposerText);
    $('#haa9-send').addEventListener('click', sendTopic);
  }

  function openComposer() {
    $('#haa9-overlay').classList.add('is-open');
    $('#haa9-composer').classList.add('is-open');
    autoSizeComposer();
    setTimeout(() => $('#haa9-text')?.focus(), 40);
  }

  function closeComposer() {
    $('#haa9-overlay')?.classList.remove('is-open');
    $('#haa9-composer')?.classList.remove('is-open');
    stopRecording(true);
  }

  function autoSizeComposer() {
    const input = $('#haa9-text');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(118, Math.min(260, input.scrollHeight))}px`;
  }

  async function translateComposerText(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const input = $('#haa9-text');
    const button = $('#haa9-compose-translate-btn');
    const raw = input ? input.value.trim() : '';
    if (!raw || !button || button.classList.contains('is-loading')) return;
    button.classList.add('is-loading');
    button.disabled = true;
    const oldMeta = $('#haa9-meta') ? $('#haa9-meta').textContent : '';
    if ($('#haa9-meta')) $('#haa9-meta').textContent = TEXT.translating;
    try {
      const out = await translateText(raw);
      if (out) {
        input.value = out;
        autoSizeComposer();
        input.focus();
      }
    } catch (error) {
      console.warn('HAA9 composer translate failed:', error);
      alertError(TEXT.translateInputFail || TEXT.translateFail);
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
      if ($('#haa9-meta')) $('#haa9-meta').textContent = oldMeta;
    }
  }

  function setPendingImages(files = []) {
    (state.composer.imageUrls || []).forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean).slice(0, CONFIG.maxImages);
    state.composer.imageFiles = list;
    state.composer.imageUrls = list.map(file => URL.createObjectURL(file));
    const card = $('#haa9-image-preview');
    if (!card) return;
    card.classList.toggle('is-show', list.length > 0);
    const grid = $('.haa9-preview-images', card);
    if (!grid) return;
    grid.innerHTML = '';
    state.composer.imageUrls.forEach(url => grid.appendChild(createElement('img', { src: url, alt: 'preview' })));
  }

  function setPendingImage(file) {
    setPendingImages(file ? [file] : []);
  }

  function setPendingVoice(blob, duration) {
    if (state.composer.voiceUrl) URL.revokeObjectURL(state.composer.voiceUrl);
    state.composer.voiceBlob = blob || null;
    state.composer.voiceDuration = Math.max(0, Math.min(CONFIG.maxVoiceSeconds, Math.round(Number(duration) || 0)));
    state.composer.voiceUrl = blob ? URL.createObjectURL(blob) : '';
    const preview = $('#haa9-voice-preview');
    const inner = $('.haa9-voice-preview-inner', preview || document);
    if (!preview || !inner) return;
    inner.innerHTML = '';
    preview.classList.toggle('is-show', !!blob);
    if (blob) inner.appendChild(createAudioCard({ url: state.composer.voiceUrl, duration: state.composer.voiceDuration }));
  }

  function resetComposer() {
    $('#haa9-text').value = '';
    autoSizeComposer();
    setPendingImages([]);
    setPendingVoice(null, 0);
    $('#haa9-meta').textContent = '';
  }

  async function canEncode(type) {
    if (state.encodeSupport[type] !== undefined) return state.encodeSupport[type];
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (!canvas.toBlob) {
      state.encodeSupport[type] = false;
      return false;
    }
    const ok = await new Promise(resolve => canvas.toBlob(blob => resolve(!!blob && blob.type === type), type, 0.8));
    state.encodeSupport[type] = ok;
    return ok;
  }

  function extForMime(type) {
    if (type === 'image/webp') return '.webp';
    if (type === 'image/png') return '.png';
    return '.jpg';
  }

  async function compressWithLibrary(file, targetType) {
    if (typeof window.imageCompression !== 'function') return null;
    return window.imageCompression(file, {
      maxSizeMB: CONFIG.imageMaxSizeMB,
      maxWidthOrHeight: CONFIG.imageMaxSide,
      useWebWorker: true,
      fileType: targetType,
      initialQuality: CONFIG.imageQuality,
      alwaysKeepResolution: false,
      preserveExif: false
    });
  }

  async function compressWithCanvas(file, targetType) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const width0 = img.naturalWidth || img.width;
      const height0 = img.naturalHeight || img.height;
      const scale = Math.min(1, CONFIG.imageMaxSide / Math.max(width0, height0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width0 * scale));
      canvas.height = Math.max(1, Math.round(height0 * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.toBlob) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise(resolve => canvas.toBlob(resolve, targetType, CONFIG.imageQuality));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressImage(file) {
    if (!file || !/^image\//i.test(file.type)) return file;
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;
    if (file.size < CONFIG.imageMinCompressBytes) return file;
    const targetType = CONFIG.imageUseWebp && await canEncode('image/webp') ? 'image/webp' : 'image/jpeg';
    try {
      let blob = await compressWithLibrary(file, targetType);
      if (!blob) blob = await compressWithCanvas(file, targetType);
      if (!blob || blob.size >= file.size * 0.95) return file;
      const base = String(file.name || `image-${Date.now()}`).replace(/\.[^.]+$/, '');
      return new File([blob], `${base}${extForMime(targetType)}`, { type: targetType, lastModified: Date.now() });
    } catch (error) {
      console.warn('HAA9 image compression failed:', error);
      return file;
    }
  }

  async function handleImageInput(event) {
    const files = Array.from(event.target.files || []).slice(0, CONFIG.maxImages);
    event.target.value = '';
    if (!files.length) return;
    if (files.some(file => !/^image\//i.test(file.type))) return alertError(TEXT.imageOnly);
    $('#haa9-meta').textContent = TEXT.processingImage;
    try {
      const next = [];
      for (const file of files) {
        next.push(await compressImage(file));
        $('#haa9-meta').textContent = `${TEXT.processingImage} ${next.length}/${files.length}`;
      }
      setPendingImages(next);
    } finally {
      $('#haa9-meta').textContent = '';
    }
  }

  function recorderMime() {
    if (!window.MediaRecorder) return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || '';
  }

  function updateRecordUi() {
    const elapsed = Math.min(CONFIG.maxVoiceSeconds, Math.floor((Date.now() - state.composer.recordStartAt) / 1000));
    $('#haa9-record-time').textContent = formatDuration(elapsed);
    $('#haa9-meta').textContent = `${formatDuration(elapsed)} / ${formatDuration(CONFIG.maxVoiceSeconds)}`;
    if (elapsed >= CONFIG.maxVoiceSeconds) stopRecording(false);
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return alertError(TEXT.recordUnsupported);
    try {
      setPendingVoice(null, 0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = recorderMime();
      state.composer.recordStream = stream;
      state.composer.recordChunks = [];
      state.composer.recordStartAt = Date.now();
      state.composer.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      state.composer.mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size) state.composer.recordChunks.push(event.data);
      };
      state.composer.mediaRecorder.onstop = () => {
        const duration = Math.max(1, Math.min(CONFIG.maxVoiceSeconds, Math.round((Date.now() - state.composer.recordStartAt) / 1000)));
        if (state.composer.recordStream) state.composer.recordStream.getTracks().forEach(track => track.stop());
        state.composer.recordStream = null;
        window.clearInterval(state.composer.recordTimer);
        $('#haa9-record').classList.remove('is-show');
        $('#haa9-voice-btn').classList.remove('is-recording');
        $('#haa9-voice-btn').innerHTML = icon('fa-microphone');
        if (state.composer.recordChunks.length) {
          const type = state.composer.recordChunks[0].type || mimeType || 'audio/webm';
          setPendingVoice(new Blob(state.composer.recordChunks, { type }), duration);
        }
        $('#haa9-meta').textContent = '';
      };
      state.composer.mediaRecorder.start(250);
      $('#haa9-record').classList.add('is-show');
      $('#haa9-voice-btn').classList.add('is-recording');
      $('#haa9-voice-btn').innerHTML = icon('fa-stop');
      updateRecordUi();
      state.composer.recordTimer = window.setInterval(updateRecordUi, 250);
    } catch (error) {
      console.warn(error);
      alertError(TEXT.micDenied);
    }
  }

  function stopRecording(silent = false) {
    const recorder = state.composer.mediaRecorder;
    if (recorder && recorder.state === 'recording') {
      try { recorder.stop(); } catch (_) {}
      return;
    }
    if (state.composer.recordStream) state.composer.recordStream.getTracks().forEach(track => track.stop());
    state.composer.recordStream = null;
    window.clearInterval(state.composer.recordTimer);
    $('#haa9-record')?.classList.remove('is-show');
    $('#haa9-voice-btn')?.classList.remove('is-recording');
    if ($('#haa9-voice-btn')) $('#haa9-voice-btn').innerHTML = icon('fa-microphone');
    if (!silent && $('#haa9-meta')) $('#haa9-meta').textContent = '';
  }

  function toggleRecording() {
    const recorder = state.composer.mediaRecorder;
    if (recorder && recorder.state === 'recording') stopRecording(false);
    else startRecording();
  }

  function looksLikeUploadUrl(value) {
    const text = norm(value);
    return !!text && text !== 'false' && (/^(https?:)?\//i.test(text) || /^\/assets\//i.test(text));
  }

  function extractUploadUrl(payload) {
    const queue = [payload];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (!current || seen.has(current)) continue;
      if (looksLikeUploadUrl(current)) return norm(current);
      if (typeof current !== 'object') continue;
      seen.add(current);
      if (Array.isArray(current)) queue.push(...current);
      else Object.values(current).forEach(value => {
        if (looksLikeUploadUrl(value)) queue.unshift(value);
        else if (value && typeof value === 'object') queue.push(value);
      });
    }
    return '';
  }

  async function uploadToNodeBB(file) {
    const form = new FormData();
    form.append('files[]', file);
    form.append('cid', String(currentCid() || ''));
    const res = await fetch(rel('/api/post/upload'), { method: 'POST', credentials: 'same-origin', body: form, headers: { 'x-csrf-token': csrfToken(), 'x-requested-with': 'XMLHttpRequest' } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json && (json.error || json.message || (json.status && json.status.message))) || `upload ${res.status}`);
    const url = extractUploadUrl(json);
    if (!url) throw new Error('upload url missing');
    return url;
  }

  function buildTitle(text) {
    const clean = norm(stripTikTokUrls(text).replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[[^\]]*\]\([^)]+\)/g, ''));
    return clean ? clean.slice(0, 80) : TEXT.newPost;
  }

  async function createTopic(payload) {
    const res = await fetch(rel('/api/v3/topics'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken(), 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json && (json.error || json.message || (json.status && json.status.message))) || `${TEXT.publishFail}: ${res.status}`);
    return json.response || json;
  }

  async function sendTopic() {
    const input = $('#haa9-text');
    const button = $('#haa9-send');
    const text = norm(input.value);
    if (!text && !(state.composer.imageFiles && state.composer.imageFiles.length) && !state.composer.voiceBlob) return alertError(TEXT.enterSomething);
    button.disabled = true;
    button.textContent = TEXT.publishing;
    try {
      const lines = [];
      if (text) lines.push(text);
      if (state.composer.voiceBlob) {
        $('#haa9-meta').textContent = TEXT.uploadVoice;
        const ext = /ogg/i.test(state.composer.voiceBlob.type) ? 'ogg' : 'webm';
        const file = new File([state.composer.voiceBlob], `voice-${Date.now()}.${ext}`, { type: state.composer.voiceBlob.type || 'audio/webm' });
        const url = appendDurationParam(await uploadToNodeBB(file), state.composer.voiceDuration || 1);
        lines.push(`[${TEXT.voiceMsg} · ${formatDuration(state.composer.voiceDuration || 1)}](${url})`);
      }
      if (state.composer.imageFiles && state.composer.imageFiles.length) {
        for (let i = 0; i < state.composer.imageFiles.length; i += 1) {
          $('#haa9-meta').textContent = `${TEXT.uploadImage} ${i + 1}/${state.composer.imageFiles.length}`;
          const url = await uploadToNodeBB(state.composer.imageFiles[i]);
          lines.push(`![image](${url})`);
        }
      }
      await createTopic({ cid: currentCid(), title: buildTitle(text), content: lines.join('\n\n'), tags: [] });
      alertSuccess(TEXT.publishOk);
      resetComposer();
      closeComposer();
      state.topicCache.clear();
      window.setTimeout(() => {
        if (window.ajaxify && typeof window.ajaxify.refresh === 'function') ajaxify.refresh();
        else window.location.reload();
      }, 120);
    } catch (error) {
      console.warn(error);
      alertError(error && error.message ? error.message : TEXT.publishFail);
    } finally {
      button.disabled = false;
      button.textContent = TEXT.publish;
      $('#haa9-meta').textContent = '';
    }
  }

  function bindLightbox() {
    if ($('#haa9-lightbox')) return;
    const box = createElement('div', { id: 'haa9-lightbox', role: 'dialog', 'aria-label': '图片预览' });
    box.innerHTML = html`
      <button type="button" class="haa9-lightbox-zone haa9-lightbox-zone-left" aria-label="上一张"></button>
      <button type="button" class="haa9-lightbox-zone haa9-lightbox-zone-right" aria-label="下一张"></button>
      <img alt="image">
      <div class="haa9-lightbox-counter"></div>
      <button type="button" class="haa9-lightbox-bottom" aria-label="退出全屏">点击底部退出</button>`;
    document.body.appendChild(box);
    const img = $('img', box);
    const counter = $('.haa9-lightbox-counter', box);
    let gallery = [];
    let index = 0;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const show = nextIndex => {
      if (!gallery.length) return;
      index = (nextIndex + gallery.length) % gallery.length;
      img.src = gallery[index];
      counter.textContent = gallery.length > 1 ? `${index + 1}/${gallery.length}` : '';
    };
    const close = event => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      box.classList.remove('is-show');
      document.body.classList.remove('haa9-lightbox-open');
      img.removeAttribute('src');
      gallery = [];
      index = 0;
    };
    const open = (button, event) => {
      if (!button) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const grid = button.closest('.haa9-image-grid, .haa9-image-list') || button.parentElement;
      gallery = grid ? $$('.haa9-image', grid).map(item => item.dataset.src || ($('img', item) && $('img', item).src) || '').filter(Boolean) : [];
      const src = button.dataset.src || ($('img', button) && $('img', button).src) || '';
      if (!gallery.length && src) gallery = [src];
      const found = Math.max(0, gallery.indexOf(src));
      show(found);
      box.classList.add('is-show');
      document.body.classList.add('haa9-lightbox-open');
    };

    document.addEventListener('click', event => {
      if (event.target.closest && event.target.closest('#haa9-lightbox')) return;
      const button = event.target.closest && event.target.closest('.haa9-image');
      if (!button) return;
      open(button, event);
    }, true);

    $('.haa9-lightbox-zone-left', box).addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); show(index - 1); });
    $('.haa9-lightbox-zone-right', box).addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); show(index + 1); });
    $('.haa9-lightbox-bottom', box).addEventListener('click', close);
    box.addEventListener('click', event => {
      if (!box.classList.contains('is-show')) return;
      if (event.target.closest('.haa9-lightbox-zone, .haa9-lightbox-bottom')) return;
      const x = event.clientX || 0;
      const y = event.clientY || 0;
      const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      event.preventDefault();
      event.stopPropagation();
      if (y > h * 0.78) return close(event);
      if (x < w * 0.42) show(index - 1);
      else if (x > w * 0.58) show(index + 1);
    });
    const start = event => {
      const point = event.touches ? event.touches[0] : event;
      if (!point) return;
      tracking = true;
      startX = point.clientX;
      startY = point.clientY;
    };
    const end = event => {
      if (!tracking) return;
      tracking = false;
      const point = event.changedTouches ? event.changedTouches[0] : event;
      if (!point) return;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        if (dx < 0) show(index + 1);
        else show(index - 1);
      } else if (dy > 64 && Math.abs(dy) > Math.abs(dx)) {
        close(event);
      }
    };
    box.addEventListener('touchstart', start, { passive: true });
    box.addEventListener('touchend', end, { passive: false });
    box.addEventListener('pointerdown', start);
    box.addEventListener('pointerup', end);
    document.addEventListener('keydown', event => {
      if (!box.classList.contains('is-show')) return;
      if (event.key === 'Escape') close(event);
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });
  }

  function installNativeSyncHooks() {
    if (window.__haa9StableHooksInstalledV3 || typeof window.fetch !== 'function') return;
    window.__haa9StableHooksInstalledV3 = true;
    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const headers = (init && init.headers) || {};
      const voteByUs = headers && (headers['x-haa9-vote'] || headers['X-Haa9-Vote']);
      const voteMatch = String(url).match(/\/api\/v3\/posts\/(\d+)\/vote(?:\?|$)/);
      const followMatch = String(url).match(/\/api\/v3\/users\/(\d+)\/follow(?:\?|$)/);
      const promise = originalFetch.apply(this, arguments);
      promise.then(response => {
        if (!response || !response.ok) return response;
        if (voteMatch && !voteByUs && (method === 'PUT' || method === 'DELETE')) {
          const pid = voteMatch[1];
          const next = method === 'PUT';
          writeVote(pid, '', next);
          $$('.haa9-action-like').forEach(button => {
            if (button.dataset.pid !== String(pid)) return;
            const was = button.dataset.voted === '1';
            const delta = was === next ? 0 : (next ? 1 : -1);
            setLikeButton(button, next, toInt(button.dataset.count) + delta);
          });
        }
        if (followMatch && (method === 'PUT' || method === 'DELETE')) {
          const uid = followMatch[1];
          const next = method === 'PUT';
          writeFollow({ uid }, next);
          updateFollowButtons({ uid }, next);
        }
        return response;
      }).catch(() => {});
      return promise;
    };
  }

  function run() {
    if (isTargetCategoryPage()) {
      ensureComposer();
      ensureEssenceToolbar();
      bindLightbox();
      ensureTikTokResourceHints();
      ensureTikTokFullscreenRoot();
      observeTopics();
      hideLoadNewPosts();
      document.body.classList.add('haa9-mode');
    } else if (!shouldHandleUserTopics()) {
      cleanupCategoryUi();
    }

    if (shouldHandleUserTopics()) {
      $('#haa9-root')?.remove();
      $('#haa9-essence-filter')?.remove();
      $('#haa9-essence-toolbar-fallback')?.remove();
      bindLightbox();
      ensureTikTokResourceHints();
      ensureTikTokFullscreenRoot();
      observeUserTopicItems();
      document.body.classList.add('haa9-mode', 'haa9-user-topics-mode');
    }

    syncEssenceToolbarButton();
    restoreTranslateButtons(document);
    hideLoadNewPosts();
    observeMutations();
  }

  function boot() {
    window.clearTimeout(state.bootTimer);
    state.bootTimer = window.setTimeout(() => {
      if (!state.i18nLoaded) loadPluginI18n().finally(run);
      else run();
    }, 80);
  }

  installNativeSyncHooks();

  if (window.jQuery) {
    window.jQuery(window).on(
      'action:ajaxify.end action:topics.loaded action:category.loaded action:posts.loaded action:topic.loaded action:user.loaded',
      boot
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  [250, 800, 1600, 3000, 5200].forEach(ms => window.setTimeout(boot, ms));
})();

