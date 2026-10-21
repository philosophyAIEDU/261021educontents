// 공개 사이트에서 "글"(public_posts)을 Firestore에서 읽어 보여 준다.
// public_posts 는 누구나 읽을 수 있고, 쓰기는 교수님 계정만 된다 (firestore.rules).
// 교수님이 관리자 페이지 결과물 탭의 "사이트에 게시"로 올린 글만 여기에 보인다.
// firebaseConfig 가 아직 없으면 글 영역을 숨기고 나머지 사이트는 그대로 보인다.

const config = window.SITE_FIREBASE;
const $ = (id) => document.getElementById(id);

function el(tag, { text, cls, href } = {}, children = []) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    if (href) e.href = href;
    children.forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
}

// 인라인 표시: **굵게** 만 살리고 나머지는 글자 그대로 (innerHTML 을 쓰지 않는다)
function inline(text) {
    const frag = document.createDocumentFragment();
    text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) frag.appendChild(el('strong', { text: part.slice(2, -2) }));
        else if (part) frag.appendChild(document.createTextNode(part));
    });
    return frag;
}

// 결과물 본문(마크다운 일부)을 안전하게 그린다: 제목, 목록, 인용, 문단
function renderMarkdown(src) {
    const root = document.createDocumentFragment();
    let list = null, para = [];
    const flush = () => {
        if (para.length) { const p = el('p'); p.appendChild(inline(para.join(' '))); root.appendChild(p); para = []; }
        list = null;
    };
    for (const raw of src.replace(/\r/g, '').split('\n')) {
        const line = raw.trimEnd();
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        if (!line.trim()) { flush(); continue; }
        if (h) { flush(); const t = el(h[1].length <= 2 ? 'h2' : 'h3'); t.appendChild(inline(h[2])); root.appendChild(t); continue; }
        if (li) {
            if (para.length) { const p = el('p'); p.appendChild(inline(para.join(' '))); root.appendChild(p); para = []; }
            if (!list) { list = el(/^\s*\d+\./.test(line) ? 'ol' : 'ul'); root.appendChild(list); }
            const item = el('li'); item.appendChild(inline(li[1])); list.appendChild(item); continue;
        }
        if (line.startsWith('>')) { flush(); const q = el('blockquote'); q.appendChild(inline(line.replace(/^>\s?/, ''))); root.appendChild(q); continue; }
        list = null;
        para.push(line.trim());
    }
    flush();
    return root;
}

const plain = (md) => md.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*>]\s+/gm, '').replace(/\s+/g, ' ').trim();
const fmtDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('ko-KR') : '');

async function main() {
    const listBox = $('post-list'), postBox = $('post');
    if (!config || Object.values(config).some((v) => String(v).includes('YOUR_'))) {
        if (postBox) postBox.replaceChildren(el('p', { cls: 'empty', text: '아직 글을 볼 수 없습니다.' }));
        return;
    }
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js');
    const { getFirestore, collection, getDocs, getDoc, doc, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
    const db = getFirestore(initializeApp(config));

    if (listBox) {
        const snap = await getDocs(query(collection(db, 'public_posts'), orderBy('publishedAt', 'desc'), limit(30)));
        if (snap.empty) return; // 게시한 글이 없으면 글 영역을 숨긴 채로 둔다
        $('posts').hidden = false;
        if ($('nav-posts')) $('nav-posts').hidden = false;
        listBox.replaceChildren(...snap.docs.map((s) => {
            const d = s.data();
            const excerpt = plain(d.body || '').slice(0, 120);
            return el('a', { cls: 'post-card', href: `post.html?id=${encodeURIComponent(s.id)}` }, [
                el('div', { cls: 'meta' }, [el('span', { cls: 'tag', text: d.type || '글' }), fmtDate(d.publishedAt)]),
                el('div', { cls: 'title', text: d.title || '' }),
                el('p', { cls: 'excerpt', text: excerpt + (excerpt.length >= 120 ? '…' : '') }),
            ]);
        }));
    }

    if (postBox) {
        const id = new URLSearchParams(location.search).get('id');
        const snap = id ? await getDoc(doc(db, 'public_posts', id)) : null;
        if (!snap?.exists()) { postBox.replaceChildren(el('p', { cls: 'empty', text: '글을 찾을 수 없습니다.' })); return; }
        const d = snap.data();
        document.title = `${d.title} — ${document.title.replace(/^글 — /, '')}`;
        const body = el('div', { cls: 'body' });
        body.appendChild(renderMarkdown(d.body || ''));
        postBox.replaceChildren(
            el('span', { cls: 'tag', text: d.type || '글' }),
            el('h1', { text: d.title || '' }),
            el('div', { cls: 'meta', text: fmtDate(d.publishedAt) }),
            body,
        );
    }
}

main().catch((e) => {
    console.error(e);
    const box = $('post') ?? $('post-list');
    if (box) box.replaceChildren(el('p', { cls: 'empty', text: '글을 불러오지 못했습니다.' }));
});
