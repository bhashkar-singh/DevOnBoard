/**
 * DevOnboard - Project Workspace & Documentation UI Controller
 * Implements SRS Section 4.6 (REQ-WS-1 to REQ-WS-4)
 */

window.WorkspaceUI = {
  init: function () {
    this.bindEvents();
  },

  bindEvents: function () {
    const uploadForm = document.getElementById('upload-doc-form');
    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitDocumentUpload();
      });
    }

    const fileInput = document.getElementById('doc-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            document.getElementById('doc-content-input').value = evt.target.result;
            document.getElementById('doc-name-input').value = file.name;
          };
          reader.readAsText(file);
        }
      });
    }
  },

  load: async function () {
    const data = await window.App.apiGet('/api/workspace');
    if (!data) return;

    this.renderDocuments(data.documents || []);
    this.renderMembers(data.members || []);
  },

  renderDocuments: function (docs) {
    const container = document.getElementById('workspace-docs-list');
    if (!container) return;

    if (docs.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); padding: 14px;">No documents uploaded to this workspace.</div>`;
      return;
    }

    container.innerHTML = docs.map(d => `
      <div class="card" style="padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>📄</span> <span>${d.filename}</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">
            ID: <code>${d.doc_id}</code> · Version: ${d.version} · Uploaded: ${d.created_at || 'Recently'}
          </div>
        </div>
        <div style="text-align: right;">
          <span class="gate-badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); font-size: 0.75rem;">
            ${d.chunk_count} Passages Indexed
          </span>
        </div>
      </div>
    `).join('');
  },

  renderMembers: function (members) {
    const container = document.getElementById('workspace-members-list');
    if (!container) return;

    container.innerHTML = members.map(m => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-glass);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
          <div>
            <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">${m.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${m.email}</div>
          </div>
        </div>
        <span class="gate-badge" style="background: rgba(99, 102, 241, 0.15); color: var(--accent-indigo); font-size: 0.72rem;">
          ${m.role.toUpperCase()}
        </span>
      </div>
    `).join('');
  },

  submitDocumentUpload: async function () {
    const filename = document.getElementById('doc-name-input').value.trim() || 'New_Contributor_Doc.md';
    const content = document.getElementById('doc-content-input').value.trim();

    if (!content) {
      window.App.showToast("Please provide document content to index.", "error");
      return;
    }

    const res = await window.App.apiPost('/api/workspace/upload', {
      filename: filename,
      raw_text: content
    });

    if (res && res.status === 'uploaded_and_indexed') {
      window.App.showToast(`Indexed ${res.chunks_created} passages into Character 4-gram & Lexical store!`, 'success');
      document.getElementById('doc-name-input').value = '';
      document.getElementById('doc-content-input').value = '';
      await this.load();
      await window.App.fetchHealth();
    }
  },

  viewDocPath: function (path) {
    window.App.switchTab('project-workspace');
    window.App.showToast(`Exploring documentation path: ${path}`, 'info');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.WorkspaceUI.init();
});
