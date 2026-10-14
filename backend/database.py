import sqlite3
import os
import json
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'devonboard.db')

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    # Users Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL, -- 'mentee', 'mentor', 'admin'
        avatar TEXT,
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Projects Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        admin_id TEXT,
        repository_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(user_id)
    )
    """)

    # Project Members
    c.execute("""
    CREATE TABLE IF NOT EXISTS project_members (
        membership_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        project_role TEXT DEFAULT 'contributor',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
    """)

    # Documents Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        doc_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_type TEXT DEFAULT 'markdown',
        raw_text TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        uploaded_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
    )
    """)

    # Document Chunks
    c.execute("""
    CREATE TABLE IF NOT EXISTS document_chunks (
        chunk_id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        section_title TEXT,
        chunk_text TEXT NOT NULL,
        word_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    )
    """)

    # FTS5 table for fast lexical BM25 search
    try:
        c.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
            chunk_id UNINDEXED,
            doc_id UNINDEXED,
            project_id UNINDEXED,
            section_title,
            chunk_text,
            tokenize='porter unicode61'
        )
        """)
    except Exception as e:
        print(f"Warning: FTS5 initialization note: {e}")

    # Skill Taxonomy (24 core skills as used in Paper Section IV-B)
    c.execute("""
    CREATE TABLE IF NOT EXISTS skills (
        skill_id TEXT PRIMARY KEY,
        skill_name TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL
    )
    """)

    # User Skills (Mentor depth x_m & Mentee gaps g_e)
    c.execute("""
    CREATE TABLE IF NOT EXISTS user_skills (
        user_skill_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        depth REAL DEFAULT 1.0, -- for mentors: self-declared depth x_m in [0, 1]
        is_gap INTEGER DEFAULT 0, -- 1 for mentee target gap g_e
        is_teaching INTEGER DEFAULT 0, -- 1 if mentor teaches this
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
    )
    """)

    # Mentor Profiles (Section III-C: x_m, a_m, r_m, N_m, rho_m, l_m, c)
    c.execute("""
    CREATE TABLE IF NOT EXISTS mentor_profiles (
        user_id TEXT PRIMARY KEY,
        declared_capacity INTEGER DEFAULT 4, -- c
        active_mentees INTEGER DEFAULT 0,     -- l_m
        responsiveness_prior REAL DEFAULT 0.85, -- rho_m in [0, 1]
        mean_rating REAL DEFAULT 4.8,          -- r_m (normalized to [0,1] or 1-5 scale)
        session_count INTEGER DEFAULT 8,       -- N_m
        availability_slots TEXT,              -- JSON array of 14 binary slots (e.g. [1,0,1,...])
        headline TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
    """)

    # Mentee Profiles (g_e, a_e, onboarding readiness)
    c.execute("""
    CREATE TABLE IF NOT EXISTS mentee_profiles (
        user_id TEXT PRIMARY KEY,
        availability_slots TEXT,              -- JSON array of 14 binary slots
        readiness_score INTEGER DEFAULT 45,   -- 0 - 100%
        target_role TEXT,
        current_step TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
    """)

    # Skill Help Requests (REQ-SM-2)
    c.execute("""
    CREATE TABLE IF NOT EXISTS skill_requests (
        request_id TEXT PRIMARY KEY,
        mentee_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        topic TEXT NOT NULL,
        urgency TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
        status TEXT DEFAULT 'open',     -- 'open', 'matched', 'resolved'
        matched_mentor_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mentee_id) REFERENCES users(user_id),
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    )
    """)

    # Mentoring Sessions (REQ-SB-1 to REQ-SB-5)
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        mentee_id TEXT NOT NULL,
        mentor_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        slot_idx INTEGER DEFAULT 0,
        status TEXT DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled'
        calendar_event_id TEXT,
        meet_link TEXT,
        rating REAL,                     -- 1 to 5 stars
        review_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mentee_id) REFERENCES users(user_id),
        FOREIGN KEY (mentor_id) REFERENCES users(user_id),
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    )
    """)

    # Community Forum (REQ-FR-1 to REQ-FR-5)
    c.execute("""
    CREATE TABLE IF NOT EXISTS forum_posts (
        post_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general', -- 'setup', 'architecture', 'first-pr', 'tooling', 'general'
        parent_post_id TEXT,
        upvotes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        FOREIGN KEY (author_id) REFERENCES users(user_id)
    )
    """)

    # Audit Log (Paper Section III-A & Fig 1: Records query, retrieved passages, gate metrics, decisions)
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        log_id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        top_chunk_id TEXT,
        cov_score REAL,
        marg_score REAL,
        combined_conf REAL,
        threshold REAL,
        gate_decision TEXT, -- 'ACCEPTED', 'ABSTAIN_ESCALATED'
        escalated_to_mentor_id TEXT,
        answer_preview TEXT,
        retrieval_method TEXT DEFAULT 'char_4gram+lexical',
        latency_ms REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Onboarding Checklist Items (REQ-WS-3)
    c.execute("""
    CREATE TABLE IF NOT EXISTS onboarding_checklists (
        item_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL,
        task_title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
    """)

    conn.commit()
    conn.close()
    print("Database schema successfully verified and initialized.")

if __name__ == '__main__':
    init_db()
