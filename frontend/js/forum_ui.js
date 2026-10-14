/**
 * DevOnboard - Developer Community Forum UI Controller
 * Implements SRS Section 4.5 (REQ-FR-1 to REQ-FR-5)
 */

window.ForumUI = {
  currentCategory: 'all',
  searchQuery: '',

  init: function () {
    this.bindEvents();
  },

  bindEvents: function () {
    // Filter tags
    document.querySelectorAll('.forum-filter-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        document.querySelectorAll('.forum-filter-tag').forEach(t => t.classList.remove('selected'));
        tag.classList.add('selected');
        this.currentCategory = tag.getAttribute('data-cat') || 'all';
        this.load();
      });
    });

    // Search bar
    const searchInput = document.getElementById('forum-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.load();
      });
    }

    // New discussion button
    const newPostBtn = document.getElementById('btn-new-post');
    if (newPostBtn) {
      newPostBtn.addEventListener('click', () => {
        window.App.openModal('new-forum-post-modal');
      });
    }
  },

  load: async function () {
    const feed = document.getElementById('forum-posts-feed');
    if (!feed) return;

    let url = `/api/forum?category=${this.currentCategory}`;
    if (this.searchQuery) {
      url += `&q=${encodeURIComponent(this.searchQuery)}`;
    }

    const posts = await window.App.apiGet(url);
    if (!posts || posts.length === 0) {
      feed.innerHTML = `
        <div class="card" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No discussion threads found in this category. Start a conversation to unblock newcomers!
        </div>
      `;
      return;
    }

    feed.innerHTML = posts.map(p => {
      const tagClass = `tag-${p.category}`;
      const repliesHtml = (p.replies || []).map(r => `
        <div style="background: rgba(15, 23, 42, 0.4); border-left: 2px solid var(--accent-cyan); padding: 10px 14px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin-top: 10px; font-size: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <img src="${r.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 20px; height: 20px; border-radius: 50%;" />
            <span style="font-weight: 600; font-size: 0.8rem; color: #fff;">${r.author_name}</span>
            <span style="font-size: 0.7rem; color: var(--text-dim);">${r.created_at || 'Just now'}</span>
          </div>
          <div style="color: #cbd5e1;">${this.escapeHtml(r.content)}</div>
        </div>
      `).join('');

      return `
        <div class="forum-post-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <span class="forum-tag ${tagClass}">${p.category}</span>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-bottom: 6px;">
                ${this.escapeHtml(p.title || 'Discussion')}
              </h3>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="window.ForumUI.upvote('${p.post_id}', this)">
              ▲ <span class="upvote-count">${p.upvotes || 0}</span>
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.78rem; color: var(--text-dim);">
            <img src="${p.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 22px; height: 22px; border-radius: 50%;" />
            <span>${p.author_name} (${p.author_role})</span>
            <span>·</span>
            <span>${p.created_at || 'Recently'}</span>
          </div>

          <p style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 14px;">
            ${this.escapeHtml(p.content)}
          </p>

          <!-- Replies Section -->
          ${repliesHtml ? `
            <div style="margin-top: 14px; border-top: 1px solid var(--border-glass); padding-top: 10px;">
              <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-dim); margin-bottom: 6px;">
                Replies (${p.replies.length}):
              </div>
              ${repliesHtml}
            </div>
          ` : ''}

          <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="window.ForumUI.openReplyModal('${p.post_id}', '${this.escapeHtml(p.title || 'Thread')}')">
              💬 Reply to Thread
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  upvote: async function (postId, btn) {
    const res = await window.App.apiPost('/api/forum/upvote', { post_id: postId });
    if (res && res.status === 'upvoted') {
      const countEl = btn.querySelector('.upvote-count');
      if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
      btn.style.color = 'var(--accent-cyan)';
    }
  },

  submitNewPost: async function () {
    const title = document.getElementById('new-post-title').value.trim();
    const content = document.getElementById('new-post-content').value.trim();
    const category = document.getElementById('new-post-cat').value;

    if (!content) {
      window.App.showToast("Please provide content for your discussion post.", "error");
      return;
    }

    const res = await window.App.apiPost('/api/forum/create', {
      title: title,
      content: content,
      category: category
    });

    if (res && res.status === 'created') {
      window.App.showToast("Discussion post published!", "success");
      window.App.closeModal('new-forum-post-modal');
      document.getElementById('new-post-title').value = '';
      document.getElementById('new-post-content').value = '';
      this.load();
    }
  },

  openReplyModal: function (postId, threadTitle) {
    document.getElementById('reply-parent-id').value = postId;
    document.getElementById('reply-thread-title').textContent = threadTitle;
    window.App.openModal('forum-reply-modal');
  },

  submitReply: async function () {
    const parentId = document.getElementById('reply-parent-id').value;
    const content = document.getElementById('reply-content').value.trim();

    if (!content) return;

    const res = await window.App.apiPost('/api/forum/create', {
      content: content,
      parent_post_id: parentId
    });

    if (res && res.status === 'created') {
      window.App.showToast("Reply posted!", "success");
      window.App.closeModal('forum-reply-modal');
      document.getElementById('reply-content').value = '';
      this.load();
    }
  },

  escapeHtml: function (text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.ForumUI.init();
});
