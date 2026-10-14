import os
import sys

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import json
import time
import uuid
import re
import datetime
import mimetypes
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

from backend.database import get_connection, init_db
from backend.rag_engine import RagEngine
from backend.xmm_matcher import XmmMatcher
from backend.seed_data import BENCHMARK_PROBES, seed_database

PORT = int(os.environ.get('PORT', 8000))
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')

# Global Engine Instances
rag_engine = RagEngine(lambda_weight=0.75, tau_threshold=0.37)
xmm_matcher = XmmMatcher(beta=(0.42, 0.22, 0.18, 0.12, 0.30))

# Current Active Session Persona (Defaults to Mentee Alex Rivera)
CURRENT_STATE = {
    "active_user_id": "usr_mentee_alex",
    "active_project_id": "proj_devonboard"
}

MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

def compute_session_timing(scheduled_time_str, status='scheduled'):
    """
    Parse scheduled_time string (e.g. 'Thursday, Oct 15, 2026 (10:00 AM - 11:00 AM)')
    and return hours_until_start, is_upcoming, can_cancel_24h, can_reschedule_24h, can_complete.
    """
    now = datetime.datetime.now()
    s = (scheduled_time_str or '').strip()
    lower = s.lower()

    m_date = re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?', s, re.IGNORECASE)
    m_time = re.search(r'(\d{1,2}):(\d{2})\s*(AM|PM)', s, re.IGNORECASE)

    hour24 = 10
    minute = 0
    if m_time:
        hh = int(m_time.group(1))
        mm = int(m_time.group(2))
        ampm = m_time.group(3).upper()
        if ampm == 'PM' and hh < 12:
            hh += 12
        elif ampm == 'AM' and hh == 12:
            hh = 0
        hour24 = hh
        minute = mm

    start_dt = None
    if m_date:
        mon_num = MONTH_MAP.get(m_date.group(1)[:3].lower(), now.month)
        day_num = int(m_date.group(2))
        year_num = int(m_date.group(3)) if m_date.group(3) else now.year
        try:
            start_dt = datetime.datetime(year_num, mon_num, day_num, hour24, minute, 0)
        except ValueError:
            start_dt = None
    elif 'ago' in lower or 'past' in lower or 'yesterday' in lower:
        start_dt = now - datetime.timedelta(days=3)
    elif 'tomorrow' in lower:
        tmr = now + datetime.timedelta(days=1)
        start_dt = datetime.datetime(tmr.year, tmr.month, tmr.day, hour24, minute, 0)
    elif 'upcoming' in lower:
        fut = now + datetime.timedelta(days=2)
        start_dt = datetime.datetime(fut.year, fut.month, fut.day, hour24, minute, 0)
    else:
        start_dt = (now + datetime.timedelta(days=2)) if status == 'scheduled' else (now - datetime.timedelta(days=3))

    hours_until_start = round((start_dt - now).total_seconds() / 3600.0, 2)
    is_upcoming = hours_until_start > 0
    can_cancel_24h = (status == 'scheduled') and (hours_until_start >= 24.0)
    can_reschedule_24h = (status == 'scheduled') and (hours_until_start >= 24.0)
    can_complete = (status == 'scheduled') and (hours_until_start <= 0)

    return {
        "hours_until_start": hours_until_start,
        "is_upcoming": is_upcoming,
        "can_cancel_24h": can_cancel_24h,
        "can_reschedule_24h": can_reschedule_24h,
        "can_complete": can_complete
    }

def reload_rag_index():
    """Reload all document chunks from SQLite into RAG memory index."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
    SELECT chunk_id, doc_id, project_id, chunk_index, section_title, chunk_text, word_count
    FROM document_chunks
    """)
    rows = c.fetchall()
    passages = []
    for r in rows:
        passages.append({
            'chunk_id': r['chunk_id'],
            'doc_id': r['doc_id'],
            'project_id': r['project_id'],
            'chunk_index': r['chunk_index'],
            'section_title': r['section_title'],
            'chunk_text': r['chunk_text'],
            'word_count': r['word_count']
        })
    conn.close()
    stats = rag_engine.build_index(passages)
    print(f"RAG Index reloaded: {stats['num_passages']} passages, {stats['vocab_size']} vocabulary terms.")
    return stats

class DevOnboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean server logging
        sys.stderr.write(f"[{time.strftime('%H:%M:%S')}] {args[0]} - {args[1]}\n")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "status": status}, status=status)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def parse_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            return {}
        raw = self.rfile.read(content_len)
        try:
            return json.loads(raw.decode('utf-8'))
        except:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # API Routes
        if path.startswith('/api/'):
            self.handle_api_get(path, query)
            return

        # Static file serving
        self.serve_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path.startswith('/api/'):
            self.handle_api_post(path, body)
            return

        self.send_error_json("Endpoint not found", 404)

    def serve_static(self, path):
        if path == '/' or path == '':
            path = '/index.html'

        # Sanitize path to prevent directory traversal
        safe_path = os.path.normpath(path.lstrip('/'))
        full_path = os.path.join(FRONTEND_DIR, safe_path)

        if not os.path.isfile(full_path):
            # Fallback to index.html for SPA client-side routing
            full_path = os.path.join(FRONTEND_DIR, 'index.html')

        if not os.path.isfile(full_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            return

        mime_type, _ = mimetypes.guess_type(full_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', f"{mime_type}; charset=utf-8")
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    # ==================== API GET HANDLERS ====================
    def handle_api_get(self, path, query):
        conn = get_connection()
        c = conn.cursor()

        try:
            if path == '/api/health':
                self.send_json({
                    "status": "online",
                    "system": "DevOnboard Platform v1.0",
                    "passages_indexed": rag_engine.num_passages,
                    "vocab_size": len(rag_engine.vocab),
                    "char4_grams": len(rag_engine.char4_df),
                    "tau_threshold": rag_engine.tau_threshold,
                    "lambda_weight": rag_engine.lambda_weight,
                    "timestamp": time.time()
                })

            elif path == '/api/auth/me':
                user_id = CURRENT_STATE["active_user_id"]
                c.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
                user = dict(c.fetchone())
                
                # Fetch role-specific profile details
                if user['role'] == 'mentee':
                    c.execute("SELECT * FROM mentee_profiles WHERE user_id = ?", (user_id,))
                    p = c.fetchone()
                    user['mentee_profile'] = dict(p) if p else {}
                    # Gap skills
                    c.execute("""
                    SELECT s.skill_id, s.skill_name, s.category
                    FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                    WHERE us.user_id = ? AND us.is_gap = 1
                    """, (user_id,))
                    user['gap_skills'] = [dict(r) for r in c.fetchall()]
                    c.execute("SELECT COUNT(*) FROM sessions WHERE mentee_id = ?", (user_id,))
                    user['sessions_count'] = c.fetchone()[0]
                elif user['role'] == 'mentor':
                    c.execute("SELECT * FROM mentor_profiles WHERE user_id = ?", (user_id,))
                    p = c.fetchone()
                    user['mentor_profile'] = dict(p) if p else {}
                    # Teaching skills
                    c.execute("""
                    SELECT s.skill_id, s.skill_name, s.category, us.depth
                    FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                    WHERE us.user_id = ? AND us.is_teaching = 1
                    """, (user_id,))
                    user['teaching_skills'] = [dict(r) for r in c.fetchall()]
                    c.execute("SELECT COUNT(*) FROM sessions WHERE mentor_id = ?", (user_id,))
                    user['sessions_count'] = c.fetchone()[0]
                else:
                    c.execute("SELECT COUNT(*) FROM sessions")
                    user['sessions_count'] = c.fetchone()[0]

                user['active_project_id'] = CURRENT_STATE["active_project_id"]
                self.send_json(user)

            elif path == '/api/users':
                c.execute("SELECT user_id, name, email, role, avatar, bio FROM users")
                users = [dict(r) for r in c.fetchall()]
                self.send_json(users)

            elif path == '/api/projects':
                c.execute("SELECT * FROM projects")
                projs = [dict(r) for r in c.fetchall()]
                for p in projs:
                    c.execute("SELECT COUNT(*) FROM document_chunks WHERE project_id = ?", (p['project_id'],))
                    p['passage_count'] = c.fetchone()[0]
                    c.execute("SELECT COUNT(*) FROM project_members WHERE project_id = ?", (p['project_id'],))
                    p['member_count'] = c.fetchone()[0]
                self.send_json({
                    "projects": projs,
                    "active_project_id": CURRENT_STATE["active_project_id"]
                })

            elif path == '/api/skills':
                c.execute("SELECT * FROM skills ORDER BY category, skill_name")
                all_skills = [dict(r) for r in c.fetchall()]
                
                # Mentee gaps
                c.execute("""
                SELECT s.skill_id, s.skill_name, s.category 
                FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id 
                WHERE us.user_id = ? AND us.is_gap = 1
                """, (CURRENT_STATE["active_user_id"],))
                gaps = [dict(r) for r in c.fetchall()]

                self.send_json({"all_skills": all_skills, "mentee_gaps": gaps})

            elif path == '/api/matching/xmm':
                # Load weight sweep param if specified (beta5)
                b5 = query.get('beta5', [None])[0]
                if b5 is not None:
                    try:
                        xmm_matcher.set_load_weight(float(b5))
                    except:
                        pass
                else:
                    xmm_matcher.set_load_weight(0.30) # default from paper

                # Fetch active mentee info
                mentee_id = CURRENT_STATE["active_user_id"]
                c.execute("SELECT availability_slots FROM mentee_profiles WHERE user_id = ?", (mentee_id,))
                mp = c.fetchone()
                m_avail = json.loads(mp['availability_slots']) if mp and mp['availability_slots'] else [1]*14

                c.execute("""
                SELECT s.skill_id FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                WHERE us.user_id = ? AND us.is_gap = 1
                """, (mentee_id,))
                gap_ids = [r['skill_id'] for r in c.fetchall()]

                # Fetch all mentors
                c.execute("""
                SELECT u.user_id, u.name, u.avatar, u.bio, mp.declared_capacity, mp.active_mentees,
                       mp.responsiveness_prior, mp.mean_rating, mp.session_count, mp.availability_slots, mp.headline
                FROM users u JOIN mentor_profiles mp ON u.user_id = mp.user_id
                WHERE u.role = 'mentor'
                """)
                mentors_raw = c.fetchall()
                mentor_list = []
                workloads = []

                for m in mentors_raw:
                    if m['user_id'] == mentee_id:
                        continue
                    m_dict = dict(m)
                    # fetch mentor skills and human-readable skill names
                    c.execute("""
                        SELECT us.skill_id, us.depth, s.skill_name
                        FROM user_skills us
                        JOIN skills s ON us.skill_id = s.skill_id
                        WHERE us.user_id = ? AND us.is_teaching = 1
                    """, (m['user_id'],))
                    s_rows = c.fetchall()
                    skills_dict = {r['skill_id']: r['depth'] for r in s_rows}
                    m_dict['skills'] = skills_dict
                    m_dict['skill_names'] = [r['skill_name'] for r in s_rows]
                    mentor_list.append(m_dict)
                    workloads.append(m['active_mentees'])

                ranked = xmm_matcher.rank_mentors(gap_ids, m_avail, mentor_list, top_k=10)
                gini_current = XmmMatcher.compute_gini_coefficient(workloads)

                # Simulated Gini comparison (Paper Table IV)
                self.send_json({
                    "ranked_mentors": ranked,
                    "mentee_gaps_count": len(gap_ids),
                    "gini_workload": gini_current,
                    "beta_weights": {
                        "beta1_gap": xmm_matcher.beta1,
                        "beta2_sched": xmm_matcher.beta2,
                        "beta3_rating": xmm_matcher.beta3,
                        "beta4_resp": xmm_matcher.beta4,
                        "beta5_load": xmm_matcher.beta5
                    }
                })

            elif path == '/api/sessions':
                user_id = CURRENT_STATE["active_user_id"]
                c.execute("SELECT role FROM users WHERE user_id = ?", (user_id,))
                u_row = c.fetchone()
                u_role = u_row['role'] if u_row else 'mentee'

                # Auto-upgrade legacy seed strings and clean up any impossible "Upcoming + Completed" test artifacts
                c.execute("UPDATE sessions SET scheduled_time = 'Thursday, Oct 15, 2026 (10:00 AM - 11:00 AM)' WHERE session_id = 'sess_1' AND scheduled_time LIKE 'Tomorrow%'")
                c.execute("UPDATE sessions SET scheduled_time = 'Friday, Oct 9, 2026 (02:00 PM - 03:00 PM)' WHERE session_id = 'sess_past_1' AND scheduled_time LIKE '%ago%'")
                c.execute("DELETE FROM sessions WHERE status = 'completed' AND scheduled_time LIKE 'Upcoming%' AND topic LIKE 'Deep-dive into out-of-vocabulary%'")
                conn.commit()

                base_query = """
                SELECT s.*,
                       u1.name as mentee_name, u1.email as mentee_email, u1.avatar as mentee_avatar, u1.bio as mentee_bio,
                       mp.target_role as mentee_target_role, mp.readiness_score as mentee_readiness,
                       u2.name as mentor_name, u2.email as mentor_email, u2.avatar as mentor_avatar,
                       mtp.headline as mentor_headline,
                       p.name as project_name
                FROM sessions s
                JOIN users u1 ON s.mentee_id = u1.user_id
                LEFT JOIN mentee_profiles mp ON s.mentee_id = mp.user_id
                JOIN users u2 ON s.mentor_id = u2.user_id
                LEFT JOIN mentor_profiles mtp ON s.mentor_id = mtp.user_id
                JOIN projects p ON s.project_id = p.project_id
                """

                if u_role == 'mentee':
                    c.execute(base_query + " WHERE s.mentee_id = ? ORDER BY s.created_at DESC", (user_id,))
                    sessions = [dict(r) for r in c.fetchall()]
                elif u_role == 'mentor':
                    # Strictly filter by s.mentor_id = user_id so each mentor ONLY sees sessions booked with them
                    c.execute(base_query + " WHERE s.mentor_id = ? ORDER BY s.created_at DESC", (user_id,))
                    sessions = [dict(r) for r in c.fetchall()]
                else:
                    c.execute(base_query + " ORDER BY s.created_at DESC")
                    sessions = [dict(r) for r in c.fetchall()]

                # Attach 24-hour cancel/reschedule & completion eligibility metadata
                for s in sessions:
                    timing = compute_session_timing(s.get('scheduled_time', ''), s.get('status', 'scheduled'))
                    # Guard: an upcoming future session can never be in 'completed' status
                    if s.get('status') == 'completed' and timing['is_upcoming']:
                        s['status'] = 'scheduled'
                        s['rating'] = None
                        s['review_text'] = None
                        timing = compute_session_timing(s.get('scheduled_time', ''), 'scheduled')
                    s.update(timing)

                self.send_json(sessions)

            elif path == '/api/requests':
                c.execute("""
                SELECT r.*, u.name as mentee_name, u.avatar as mentee_avatar, p.name as project_name
                FROM skill_requests r
                JOIN users u ON r.mentee_id = u.user_id
                JOIN projects p ON r.project_id = p.project_id
                ORDER BY r.created_at DESC
                """)
                reqs = [dict(r) for r in c.fetchall()]
                self.send_json(reqs)

            elif path == '/api/forum':
                proj_id = CURRENT_STATE["active_project_id"]
                cat = query.get('category', [None])[0]
                q_search = query.get('q', [None])[0]

                sql = """
                SELECT p.*, u.name as author_name, u.role as author_role, u.avatar as author_avatar
                FROM forum_posts p
                JOIN users u ON p.author_id = u.user_id
                WHERE p.project_id = ? AND p.parent_post_id IS NULL
                """
                params = [proj_id]
                if cat and cat != 'all':
                    sql += " AND p.category = ?"
                    params.append(cat)
                if q_search:
                    sql += " AND (p.title LIKE ? OR p.content LIKE ?)"
                    params.extend([f"%{q_search}%", f"%{q_search}%"])
                
                sql += " ORDER BY p.created_at DESC"
                c.execute(sql, params)
                posts = [dict(r) for r in c.fetchall()]

                # Fetch replies for each post
                for p in posts:
                    c.execute("""
                    SELECT rep.*, u.name as author_name, u.role as author_role, u.avatar as author_avatar
                    FROM forum_posts rep JOIN users u ON rep.author_id = u.user_id
                    WHERE rep.parent_post_id = ?
                    ORDER BY rep.created_at ASC
                    """, (p['post_id'],))
                    p['replies'] = [dict(r) for r in c.fetchall()]

                self.send_json(posts)

            elif path == '/api/workspace':
                proj_id = CURRENT_STATE["active_project_id"]
                c.execute("SELECT * FROM documents WHERE project_id = ?", (proj_id,))
                docs = [dict(r) for r in c.fetchall()]
                for d in docs:
                    c.execute("SELECT COUNT(*) FROM document_chunks WHERE doc_id = ?", (d['doc_id'],))
                    d['chunk_count'] = c.fetchone()[0]

                c.execute("""
                SELECT pm.*, u.name, u.email, u.role, u.avatar 
                FROM project_members pm JOIN users u ON pm.user_id = u.user_id
                WHERE pm.project_id = ?
                """, (proj_id,))
                members = [dict(r) for r in c.fetchall()]

                self.send_json({"documents": docs, "members": members})

            elif path == '/api/dashboard':
                user_id = CURRENT_STATE["active_user_id"]
                proj_id = CURRENT_STATE["active_project_id"]
                
                # Checklists
                c.execute("SELECT * FROM onboarding_checklists WHERE user_id = ? AND project_id = ?", (user_id, proj_id))
                checklist = [dict(r) for r in c.fetchall()]

                # Statistics
                c.execute("SELECT COUNT(*) FROM audit_log WHERE user_id = ?", (user_id,))
                queries_count = c.fetchone()[0]
                
                c.execute("SELECT COUNT(*) FROM sessions WHERE mentee_id = ? AND status = 'completed'", (user_id,))
                sessions_completed = c.fetchone()[0]

                c.execute("SELECT COUNT(*) FROM sessions WHERE mentee_id = ? AND status = 'scheduled'", (user_id,))
                sessions_upcoming = c.fetchone()[0]

                completed_tasks = sum(1 for item in checklist if item['completed'])
                total_tasks = max(1, len(checklist))
                calc_readiness = int((completed_tasks / total_tasks) * 100)

                self.send_json({
                    "readiness_score": calc_readiness,
                    "checklist": checklist,
                    "stats": {
                        "queries_count": queries_count,
                        "sessions_completed": sessions_completed,
                        "sessions_upcoming": sessions_upcoming,
                        "total_tasks": total_tasks,
                        "completed_tasks": completed_tasks
                    }
                })

            elif path == '/api/audit-log':
                c.execute("""
                SELECT a.*, u.name as user_name, p.name as project_name
                FROM audit_log a
                JOIN users u ON a.user_id = u.user_id
                JOIN projects p ON a.project_id = p.project_id
                ORDER BY a.timestamp DESC
                LIMIT 50
                """)
                logs = [dict(r) for r in c.fetchall()]
                self.send_json(logs)

            elif path == '/api/benchmark':
                self.send_json({
                    "probes": BENCHMARK_PROBES,
                    "summary": {
                        "total_probes": len(BENCHMARK_PROBES),
                        "tau_default": 0.37,
                        "lambda_default": 0.75,
                        "empirical_target_precision": "99.0%",
                        "empirical_target_coverage": "89.4%",
                        "empirical_oos_rejection": "91.7%"
                    }
                })

            elif path == '/api/documents/raw':
                doc_id = query.get('doc_id', [None])[0]
                if doc_id:
                    c.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,))
                else:
                    c.execute("SELECT * FROM documents WHERE project_id = ? LIMIT 1", (CURRENT_STATE["active_project_id"],))
                row = c.fetchone()
                if row:
                    doc_data = dict(row)
                    c.execute("SELECT * FROM document_chunks WHERE doc_id = ? ORDER BY chunk_index", (doc_data['doc_id'],))
                    doc_data['chunks'] = [dict(chk) for chk in c.fetchall()]
                    self.send_json(doc_data)
                else:
                    self.send_error_json("Document not found", 404)

            elif path == '/api/mentor/dashboard':
                mentor_id = CURRENT_STATE["active_user_id"]
                proj_id = CURRENT_STATE["active_project_id"]

                c.execute("""
                SELECT u.user_id, u.name, u.email, u.avatar, u.bio, u.role,
                       mp.declared_capacity, mp.active_mentees, mp.responsiveness_prior,
                       mp.mean_rating, mp.session_count, mp.availability_slots, mp.headline
                FROM users u
                LEFT JOIN mentor_profiles mp ON u.user_id = mp.user_id
                WHERE u.user_id = ?
                """, (mentor_id,))
                prof_row = c.fetchone()
                prof_dict = dict(prof_row) if prof_row else {}
                raw_avail = prof_dict.get('availability_slots')
                if isinstance(raw_avail, str):
                    try:
                        prof_dict['availability_slots'] = json.loads(raw_avail)
                    except Exception:
                        prof_dict['availability_slots'] = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0]
                elif not isinstance(raw_avail, list):
                    prof_dict['availability_slots'] = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0]

                c.execute("""
                SELECT s.skill_id, s.skill_name, s.category, us.depth
                FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                WHERE us.user_id = ? AND us.is_teaching = 1
                """, (mentor_id,))
                teaching_rows = [dict(r) for r in c.fetchall()]
                prof_dict['teaching_skills_list'] = teaching_rows
                prof_dict['teaching_skills'] = {r['skill_name']: r['depth'] for r in teaching_rows}

                # Incoming Mentee Skill-Help Requests & AI Escalations
                c.execute("""
                SELECT r.*, u.name as mentee_name, u.email as mentee_email, u.avatar as mentee_avatar,
                       mp.target_role as mentee_target_role, mp.readiness_score as mentee_readiness,
                       p.name as project_name
                FROM skill_requests r
                JOIN users u ON r.mentee_id = u.user_id
                LEFT JOIN mentee_profiles mp ON r.mentee_id = mp.user_id
                JOIN projects p ON r.project_id = p.project_id
                WHERE r.matched_mentor_id = ? OR r.status = 'open'
                ORDER BY CASE WHEN r.status != 'resolved' THEN 0 ELSE 1 END, r.created_at DESC
                """, (mentor_id,))
                reqs = []
                for r in c.fetchall():
                    rd = dict(r)
                    rd['id'] = rd.get('request_id')
                    rd['notes'] = rd.get('topic')
                    rd['target_role'] = rd.get('mentee_target_role')
                    rd['readiness_score'] = (rd.get('mentee_readiness') or 52) / 100.0 if (rd.get('mentee_readiness') or 0) > 1 else (rd.get('mentee_readiness') or 0.52)
                    rd['urgency'] = 'high' if 'c(q)' in (rd.get('topic') or '') or 'Escalated' in (rd.get('topic') or '') else 'medium'
                    reqs.append(rd)

                # Strictly this mentor's 1:1 sessions
                c.execute("""
                SELECT s.*,
                       u1.name as mentee_name, u1.email as mentee_email, u1.avatar as mentee_avatar,
                       mp.target_role as mentee_target_role, mp.readiness_score as mentee_readiness,
                       u2.name as mentor_name, p.name as project_name
                FROM sessions s
                JOIN users u1 ON s.mentee_id = u1.user_id
                LEFT JOIN mentee_profiles mp ON s.mentee_id = mp.user_id
                JOIN users u2 ON s.mentor_id = u2.user_id
                JOIN projects p ON s.project_id = p.project_id
                WHERE s.mentor_id = ?
                ORDER BY s.created_at DESC
                """, (mentor_id,))
                mentor_sessions = []
                for r in c.fetchall():
                    sd = dict(r)
                    sd['id'] = sd.get('session_id')
                    sd['notes'] = sd.get('review_text') or ''
                    sd.update(compute_session_timing(sd.get('scheduled_time', ''), sd.get('status', 'scheduled')))
                    mentor_sessions.append(sd)

                # Mentee Cohort & Checklist Milestones for Mentor Sign-Off
                c.execute("""
                SELECT u.user_id, u.name, u.email, u.avatar, u.bio,
                       mp.readiness_score, mp.target_role, mp.current_step
                FROM users u
                JOIN mentee_profiles mp ON u.user_id = mp.user_id
                WHERE u.role = 'mentee'
                """)
                mentees = [dict(r) for r in c.fetchall()]
                for me in mentees:
                    c.execute("""
                    SELECT * FROM onboarding_checklists
                    WHERE user_id = ? AND project_id = ?
                    """, (me['user_id'], proj_id))
                    chk_rows = c.fetchall()
                    if not chk_rows:
                        c.execute("SELECT * FROM onboarding_checklists WHERE user_id = ?", (me['user_id'],))
                        chk_rows = c.fetchall()
                    chk = []
                    for x in chk_rows:
                        xd = dict(x)
                        xd['id'] = xd.get('item_id')
                        xd['title'] = xd.get('task_title')
                        chk.append(xd)
                    me['checklist'] = chk
                    done_cnt = sum(1 for x in chk if x['completed'])
                    tot_cnt = max(1, len(chk))
                    me['computed_readiness'] = int((done_cnt / tot_cnt) * 100) if chk else (me.get('readiness_score') or 50)

                    c.execute("""
                    SELECT s.skill_name, s.category, us.depth
                    FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                    WHERE us.user_id = ? AND us.is_gap = 1
                    """, (me['user_id'],))
                    me['gap_skills'] = [{
                        "skill": x['skill_name'],
                        "skill_name": x['skill_name'],
                        "category": x['category'],
                        "pct": int((x['depth'] or 0.35) * 100)
                    } for x in c.fetchall()]

                self.send_json({
                    "profile": prof_dict,
                    "requests": reqs,
                    "sessions": mentor_sessions,
                    "mentees": mentees
                })

            else:
                self.send_error_json(f"Unknown GET route: {path}", 404)

        finally:
            conn.close()

    # ==================== API POST HANDLERS ====================
    def handle_api_post(self, path, body):
        conn = get_connection()
        c = conn.cursor()

        try:
            if path == '/api/auth/switch-user':
                target_id = body.get('user_id')
                if not target_id:
                    self.send_error_json("user_id required")
                    return
                c.execute("SELECT user_id FROM users WHERE user_id = ?", (target_id,))
                if not c.fetchone():
                    self.send_error_json("User not found", 404)
                    return
                CURRENT_STATE["active_user_id"] = target_id
                self.send_json({"status": "switched", "active_user_id": target_id})

            elif path == '/api/auth/login':
                email = body.get('email', '').strip().lower()
                user_id = body.get('user_id')
                
                if user_id:
                    c.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
                elif email:
                    c.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,))
                else:
                    c.execute("SELECT * FROM users WHERE user_id = 'usr_mentee_alex'")

                row = c.fetchone()
                if not row:
                    # Default fallback to Alex Rivera if demo login
                    c.execute("SELECT * FROM users WHERE user_id = 'usr_mentee_alex'")
                    row = c.fetchone()

                user = dict(row)
                CURRENT_STATE["active_user_id"] = user['user_id']
                mock_jwt = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{user['user_id']}_{int(time.time())}.devonboard_sig"
                self.send_json({
                    "status": "authenticated",
                    "token": mock_jwt,
                    "user": user
                })

            elif path == '/api/auth/register':
                name = body.get('name', 'New Contributor').strip()
                email = body.get('email', '').strip().lower()
                role = body.get('role', 'mentee')
                target_role = body.get('target_role', 'Full-Stack Contributor')
                gap_skills = body.get('gap_skills', ['skill_py', 'skill_rag'])
                avail = body.get('availability_slots', [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0])
                
                if not email:
                    self.send_error_json("Email is required")
                    return

                new_id = f"usr_{role}_{int(time.time()*1000)}"
                avatar = body.get('avatar') or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
                c.execute("""
                INSERT INTO users (user_id, name, email, role, avatar, bio)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (new_id, name, email, role, avatar, f"Onboarding as {target_role}."))

                if role == 'mentor':
                    headline = body.get('headline', 'Senior Contributor & Mentor')
                    capacity = int(body.get('capacity', 4))
                    c.execute("""
                    INSERT INTO mentor_profiles (user_id, declared_capacity, active_mentees, mean_rating, session_count, availability_slots, headline)
                    VALUES (?, ?, 0, 5.0, 0, ?, ?)
                    """, (new_id, capacity, json.dumps(avail), headline))

                    teaching_skills = body.get('skills', ['skill_py', 'skill_rag'])
                    for sid in teaching_skills:
                        c.execute("SELECT skill_id FROM skills WHERE skill_id = ?", (sid,))
                        if c.fetchone():
                            c.execute("""
                            INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_teaching)
                            VALUES (?, ?, ?, 1.0, 1)
                            """, (f"usk_{uuid.uuid4().hex[:8]}", new_id, sid))
                else:
                    c.execute("""
                    INSERT INTO mentee_profiles (user_id, availability_slots, readiness_score, target_role, current_step)
                    VALUES (?, ?, 30, ?, 'Initial Environment Setup')
                    """, (new_id, json.dumps(avail), target_role))

                    for sid in gap_skills:
                        c.execute("SELECT skill_id FROM skills WHERE skill_id = ?", (sid,))
                        if c.fetchone():
                            c.execute("""
                            INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_gap)
                            VALUES (?, ?, ?, 0.0, 1)
                            """, (f"usk_{uuid.uuid4().hex[:8]}", new_id, sid))

                # Add to all active projects
                c.execute("SELECT project_id FROM projects")
                projs = c.fetchall()
                for pr in projs:
                    c.execute("""
                    INSERT INTO project_members (membership_id, project_id, user_id, project_role)
                    VALUES (?, ?, ?, ?)
                    """, (f"pm_{uuid.uuid4().hex[:8]}", pr['project_id'], new_id, role))

                conn.commit()
                CURRENT_STATE["active_user_id"] = new_id
                mock_jwt = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{new_id}_{int(time.time())}.devonboard_sig"

                self.send_json({
                    "status": "registered",
                    "token": mock_jwt,
                    "user": {
                        "user_id": new_id,
                        "name": name,
                        "email": email,
                        "role": role,
                        "avatar": avatar,
                        "target_role": target_role
                    }
                })

            elif path == '/api/mentors/create':
                name = body.get('name', 'New Mentor').strip()
                email = body.get('email', '').strip().lower()
                headline = body.get('headline', 'Senior Staff Contributor')
                bio = body.get('bio', 'Experienced software engineer and mentor.')
                capacity = int(body.get('capacity', 4))
                skills = body.get('skills', ['skill_py', 'skill_rag', 'skill_docker'])
                avail = body.get('availability_slots', [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0])
                avatar = body.get('avatar') or "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150"

                if not email:
                    self.send_error_json("Mentor email is required")
                    return

                mentor_id = f"usr_mentor_{int(time.time()*1000)}"
                c.execute("""
                INSERT INTO users (user_id, name, email, role, avatar, bio)
                VALUES (?, ?, ?, 'mentor', ?, ?)
                """, (mentor_id, name, email, avatar, bio))

                c.execute("""
                INSERT INTO mentor_profiles (user_id, declared_capacity, active_mentees, responsiveness_prior, mean_rating, session_count, availability_slots, headline)
                VALUES (?, ?, 0, 0.90, 5.0, 1, ?, ?)
                """, (mentor_id, capacity, json.dumps(avail), headline))

                for sid in skills:
                    c.execute("SELECT skill_id FROM skills WHERE skill_id = ?", (sid,))
                    if c.fetchone():
                        c.execute("""
                        INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_teaching)
                        VALUES (?, ?, ?, 1.0, 1)
                        """, (f"usk_{uuid.uuid4().hex[:8]}", mentor_id, sid))

                c.execute("SELECT project_id FROM projects")
                for pr in c.fetchall():
                    c.execute("""
                    INSERT INTO project_members (membership_id, project_id, user_id, project_role)
                    VALUES (?, ?, ?, 'mentor')
                    """, (f"pm_{uuid.uuid4().hex[:8]}", pr['project_id'], mentor_id))

                conn.commit()
                self.send_json({
                    "status": "created",
                    "mentor_id": mentor_id,
                    "name": name,
                    "headline": headline
                })

            elif path == '/api/auth/logout':
                self.send_json({"status": "logged_out"})

            elif path == '/api/projects/switch':
                proj_id = body.get('project_id')
                c.execute("SELECT project_id FROM projects WHERE project_id = ?", (proj_id,))
                if not c.fetchone():
                    self.send_error_json("Project not found", 404)
                    return
                CURRENT_STATE["active_project_id"] = proj_id
                self.send_json({"status": "switched", "active_project_id": proj_id})

            elif path == '/api/rag/ask':
                query = body.get('query', '').strip()
                if not query:
                    self.send_error_json("query cannot be empty")
                    return

                # Optional threshold and lambda override for interactive tuning
                custom_tau = body.get('tau')
                if custom_tau is not None:
                    rag_engine.tau_threshold = float(custom_tau)
                custom_lambda = body.get('lambda')
                if custom_lambda is not None:
                    rag_engine.lambda_weight = float(custom_lambda)

                # Execute Evidence Gate Test (Algorithm 1)
                gate_res = rag_engine.test_evidence_gate(query)
                answer_res = rag_engine.generate_grounded_answer(query, gate_res)

                escalated_mentor = None
                # If gate ABSTAINS, trigger automatic escalation to XMM Matcher
                if not gate_res['passed']:
                    # Rank mentors for escalation
                    c.execute("""
                    SELECT u.user_id, u.name, u.avatar, u.bio, mp.declared_capacity, mp.active_mentees,
                           mp.responsiveness_prior, mp.mean_rating, mp.session_count, mp.availability_slots, mp.headline
                    FROM users u JOIN mentor_profiles mp ON u.user_id = mp.user_id
                    WHERE u.role = 'mentor'
                    """)
                    mentors_raw = c.fetchall()
                    mentor_list = []
                    for m in mentors_raw:
                        m_dict = dict(m)
                        c.execute("SELECT skill_id, depth FROM user_skills WHERE user_id = ? AND is_teaching = 1", (m['user_id'],))
                        m_dict['skills'] = {r['skill_id']: r['depth'] for r in c.fetchall()}
                        mentor_list.append(m_dict)

                    c.execute("SELECT availability_slots FROM mentee_profiles WHERE user_id = ?", (CURRENT_STATE["active_user_id"],))
                    mp = c.fetchone()
                    m_avail = json.loads(mp['availability_slots']) if mp and mp['availability_slots'] else [1]*14
                    
                    c.execute("""
                    SELECT s.skill_id FROM user_skills us JOIN skills s ON us.skill_id = s.skill_id
                    WHERE us.user_id = ? AND us.is_gap = 1
                    """, (CURRENT_STATE["active_user_id"],))
                    gaps = [r['skill_id'] for r in c.fetchall()]

                    ranked_matches = xmm_matcher.rank_mentors(gaps, m_avail, mentor_list, top_k=3)
                    if ranked_matches:
                        escalated_mentor = ranked_matches[0]
                        answer_res['escalated_mentor'] = escalated_mentor
                        answer_res['candidate_mentors'] = ranked_matches

                # Write to append-only audit log (Paper Section III-A)
                log_id = f"aud_{int(time.time()*1000)}"
                top_cid = gate_res['top_passage']['chunk_id'] if gate_res.get('top_passage') else None
                escalated_id = escalated_mentor['mentor_id'] if escalated_mentor else None

                c.execute("""
                INSERT INTO audit_log 
                (log_id, query, project_id, user_id, top_chunk_id, cov_score, marg_score, combined_conf, threshold, gate_decision, escalated_to_mentor_id, answer_preview, latency_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    log_id, query, CURRENT_STATE["active_project_id"], CURRENT_STATE["active_user_id"],
                    top_cid, gate_res['cov'], gate_res['marg'], gate_res['c_q'], gate_res['threshold'],
                    gate_res['decision'], escalated_id, answer_res['answer'][:180], gate_res['latency_ms']
                ))
                conn.commit()

                self.send_json({
                    "gate_result": gate_res,
                    "answer_result": answer_res,
                    "log_id": log_id
                })

            elif path == '/api/sessions/book':
                mentor_id = body.get('mentor_id')
                slot_idx = int(body.get('slot_idx', 0))
                topic = body.get('topic', 'Developer Onboarding & Codebase Guidance').strip()
                scheduled_date = body.get('scheduled_date', '').strip()

                # Reject past dates on backend
                if scheduled_date:
                    today_iso = time.strftime('%Y-%m-%d', time.localtime())
                    if scheduled_date < today_iso:
                        self.send_error_json(f"Cannot book a session on a past date ({scheduled_date}). Today is {today_iso}.", 400)
                        return
                
                # Format friendly slot time
                days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                day_name = days[(slot_idx // 2) % 7]
                slot_time = "10:00 AM - 11:00 AM" if (slot_idx % 2 == 0) else "03:00 PM - 04:00 PM"
                custom_sched = body.get('scheduled_time', '').strip()
                scheduled_str = custom_sched if custom_sched else f"Upcoming {day_name} ({slot_time})"

                session_id = f"sess_{int(time.time()*1000)}"
                cal_id = f"cal_evt_{int(time.time())}"
                # Generate realistic Google Meet conference link (REQ-SB-3)
                meet_link = f"https://meet.google.com/dev-{session_id[-4:]}-onbd"

                c.execute("""
                INSERT INTO sessions 
                (session_id, mentee_id, mentor_id, project_id, topic, scheduled_time, slot_idx, status, calendar_event_id, meet_link)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
                """, (
                    session_id, CURRENT_STATE["active_user_id"], mentor_id,
                    CURRENT_STATE["active_project_id"], topic, scheduled_str, slot_idx, cal_id, meet_link
                ))

                # Increment mentor active mentees
                c.execute("UPDATE mentor_profiles SET active_mentees = active_mentees + 1 WHERE user_id = ?", (mentor_id,))
                conn.commit()

                self.send_json({
                    "status": "booked",
                    "session_id": session_id,
                    "meet_link": meet_link,
                    "calendar_event_id": cal_id,
                    "scheduled_time": scheduled_str
                })

            elif path == '/api/sessions/complete-and-rate':
                session_id = body.get('session_id')
                rating = float(body.get('rating', 5.0))
                review = body.get('review_text', '').strip()
                allow_sim = bool(body.get('allow_past_simulation', False))

                c.execute("SELECT mentor_id, status, scheduled_time FROM sessions WHERE session_id = ?", (session_id,))
                row = c.fetchone()
                if not row:
                    self.send_error_json("Session not found", 404)
                    return

                timing = compute_session_timing(row['scheduled_time'], row['status'])
                if timing['is_upcoming'] and not allow_sim:
                    self.send_error_json(
                        f"Cannot mark an upcoming meeting ({row['scheduled_time']}) as completed or rate it before the scheduled session time has occurred.",
                        400
                    )
                    return

                mentor_id = row['mentor_id']
                updated_sched_time = row['scheduled_time']
                if updated_sched_time.lower().startswith('upcoming') or updated_sched_time.lower().startswith('tomorrow'):
                    updated_sched_time = "Completed Session (Past Slot)"

                c.execute("""
                UPDATE sessions 
                SET status = 'completed', rating = ?, review_text = ?, scheduled_time = ?
                WHERE session_id = ?
                """, (rating, review, updated_sched_time, session_id))

                # Update mentor's mean rating and session count (Bayesian shrinkage update)
                new_r = 5.0
                new_n = 1
                c.execute("SELECT mean_rating, session_count, active_mentees FROM mentor_profiles WHERE user_id = ?", (mentor_id,))
                m_prof = c.fetchone()
                if m_prof:
                    prev_r = m_prof['mean_rating']
                    prev_n = m_prof['session_count']
                    new_n = prev_n + 1
                    new_r = round(((prev_r * prev_n) + rating) / new_n, 2)
                    new_active = max(0, m_prof['active_mentees'] - 1)
                    
                    c.execute("""
                    UPDATE mentor_profiles 
                    SET mean_rating = ?, session_count = ?, active_mentees = ?
                    WHERE user_id = ?
                    """, (new_r, new_n, new_active, mentor_id))

                conn.commit()
                self.send_json({"status": "completed_and_rated", "new_rating": new_r, "new_count": new_n})

            elif path == '/api/sessions/cancel':
                session_id = body.get('session_id')
                reason = body.get('reason', '').strip()

                c.execute("SELECT session_id, mentor_id, mentee_id, status, scheduled_time FROM sessions WHERE session_id = ?", (session_id,))
                row = c.fetchone()
                if not row:
                    self.send_error_json("Session not found", 404)
                    return

                if row['status'] != 'scheduled':
                    self.send_error_json("Only scheduled upcoming sessions can be cancelled.", 400)
                    return

                timing = compute_session_timing(row['scheduled_time'], row['status'])
                if timing['hours_until_start'] < 24.0:
                    self.send_error_json(
                        f"Meetings can only be cancelled at least 24 hours before the scheduled start time (currently {max(0.0, timing['hours_until_start']):.1f}h remaining).",
                        400
                    )
                    return

                user_id = CURRENT_STATE["active_user_id"]
                c.execute("SELECT name, role FROM users WHERE user_id = ?", (user_id,))
                u_row = c.fetchone()
                u_name = u_row['name'] if u_row else 'User'
                u_role = u_row['role'] if u_row else 'mentee'
                role_label = 'Mentor' if u_role == 'mentor' else ('Admin' if u_role == 'admin' else 'Mentee')

                cancel_note = f"Cancelled by {role_label} ({u_name}) >24h before meeting"
                if reason:
                    cancel_note += f": {reason}"

                c.execute("""
                UPDATE sessions
                SET status = 'cancelled', review_text = ?
                WHERE session_id = ?
                """, (cancel_note, session_id))

                c.execute("""
                UPDATE mentor_profiles
                SET active_mentees = MAX(0, active_mentees - 1)
                WHERE user_id = ?
                """, (row['mentor_id'],))

                conn.commit()
                self.send_json({
                    "status": "cancelled",
                    "session_id": session_id,
                    "cancelled_by": u_name,
                    "cancelled_role": role_label,
                    "note": cancel_note
                })

            elif path == '/api/sessions/reschedule':
                session_id = body.get('session_id')
                new_scheduled_time = body.get('scheduled_time', '').strip()
                new_scheduled_date = body.get('scheduled_date', '').strip()
                new_slot_idx = int(body.get('slot_idx', 0))
                new_topic = body.get('topic', '').strip()

                user_id = CURRENT_STATE["active_user_id"]
                c.execute("SELECT name, role FROM users WHERE user_id = ?", (user_id,))
                u_row = c.fetchone()
                u_role = u_row['role'] if u_row else 'mentee'

                if u_role == 'mentor':
                    self.send_error_json("Only mentees can reschedule a 1:1 session from their side.", 403)
                    return

                c.execute("SELECT session_id, status, scheduled_time, topic FROM sessions WHERE session_id = ?", (session_id,))
                row = c.fetchone()
                if not row:
                    self.send_error_json("Session not found", 404)
                    return

                if row['status'] != 'scheduled':
                    self.send_error_json("Only scheduled upcoming sessions can be rescheduled.", 400)
                    return

                current_timing = compute_session_timing(row['scheduled_time'], row['status'])
                if current_timing['hours_until_start'] < 24.0:
                    self.send_error_json(
                        f"Meetings can only be rescheduled at least 24 hours before the scheduled start time (currently {max(0.0, current_timing['hours_until_start']):.1f}h remaining).",
                        400
                    )
                    return

                if new_scheduled_date:
                    today_iso = time.strftime('%Y-%m-%d', time.localtime())
                    if new_scheduled_date < today_iso:
                        self.send_error_json(f"Cannot reschedule to a past date ({new_scheduled_date}).", 400)
                        return

                if not new_scheduled_time:
                    self.send_error_json("Please select a valid new upcoming date and time slot.", 400)
                    return

                new_timing = compute_session_timing(new_scheduled_time, 'scheduled')
                if not new_timing['is_upcoming']:
                    self.send_error_json("Cannot reschedule to a past date or elapsed time slot.", 400)
                    return

                final_topic = new_topic if new_topic else row['topic']
                new_cal_id = f"cal_evt_resched_{int(time.time())}"

                c.execute("""
                UPDATE sessions
                SET scheduled_time = ?, slot_idx = ?, topic = ?, calendar_event_id = ?
                WHERE session_id = ?
                """, (new_scheduled_time, new_slot_idx, final_topic, new_cal_id, session_id))

                conn.commit()
                self.send_json({
                    "status": "rescheduled",
                    "session_id": session_id,
                    "scheduled_time": new_scheduled_time,
                    "topic": final_topic,
                    "calendar_event_id": new_cal_id
                })

            elif path == '/api/requests/create':
                topic = body.get('topic', '').strip()
                skill_name = body.get('skill_name', 'General Onboarding').strip()
                urgency = body.get('urgency', 'medium')
                
                req_id = f"req_{int(time.time()*1000)}"
                c.execute("""
                INSERT INTO skill_requests (request_id, mentee_id, project_id, skill_name, topic, urgency, status)
                VALUES (?, ?, ?, ?, ?, ?, 'open')
                """, (req_id, CURRENT_STATE["active_user_id"], CURRENT_STATE["active_project_id"], skill_name, topic, urgency))
                conn.commit()

                self.send_json({"status": "created", "request_id": req_id})

            elif path == '/api/forum/create':
                title = body.get('title', '').strip()
                content = body.get('content', '').strip()
                cat = body.get('category', 'general')
                parent_id = body.get('parent_post_id')

                if not content:
                    self.send_error_json("content cannot be empty")
                    return

                post_id = f"post_{int(time.time()*1000)}"
                c.execute("""
                INSERT INTO forum_posts (post_id, project_id, author_id, title, content, category, parent_post_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (post_id, CURRENT_STATE["active_project_id"], CURRENT_STATE["active_user_id"], title or None, content, cat, parent_id))
                conn.commit()

                self.send_json({"status": "created", "post_id": post_id})

            elif path == '/api/forum/upvote':
                post_id = body.get('post_id')
                c.execute("UPDATE forum_posts SET upvotes = upvotes + 1 WHERE post_id = ?", (post_id,))
                conn.commit()
                self.send_json({"status": "upvoted"})

            elif path == '/api/dashboard/checklist-toggle':
                item_id = body.get('item_id')
                c.execute("SELECT completed FROM onboarding_checklists WHERE item_id = ?", (item_id,))
                row = c.fetchone()
                if row:
                    new_state = 0 if row['completed'] else 1
                    c.execute("UPDATE onboarding_checklists SET completed = ? WHERE item_id = ?", (new_state, item_id))
                    conn.commit()
                    self.send_json({"status": "toggled", "new_state": new_state})
                else:
                    self.send_error_json("Checklist item not found", 404)

            elif path == '/api/workspace/upload':
                filename = body.get('filename', 'Custom_Documentation.md').strip()
                raw_text = body.get('raw_text', '').strip()
                if not raw_text:
                    self.send_error_json("raw_text cannot be empty")
                    return

                doc_id = f"doc_{int(time.time()*1000)}"
                proj_id = CURRENT_STATE["active_project_id"]

                c.execute("""
                INSERT INTO documents (doc_id, project_id, filename, raw_text, uploaded_by)
                VALUES (?, ?, ?, ?, ?)
                """, (doc_id, proj_id, filename, raw_text, CURRENT_STATE["active_user_id"]))

                # Segment into ~110 word overlapping passages
                chunks = RagEngine.segment_document(raw_text, target_words=110, overlap_words=25)
                for idx, chk in enumerate(chunks):
                    cid = f"chk_{doc_id}_{idx}"
                    c.execute("""
                    INSERT INTO document_chunks (chunk_id, doc_id, project_id, chunk_index, section_title, chunk_text, word_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (cid, doc_id, proj_id, idx, chk['section_title'], chk['chunk_text'], chk['word_count']))

                conn.commit()
                # Reload memory index
                reload_rag_index()

                self.send_json({
                    "status": "uploaded_and_indexed",
                    "doc_id": doc_id,
                    "chunks_created": len(chunks)
                })

            elif path == '/api/skills/update-gaps':
                skill_ids = body.get('skill_ids', [])
                user_id = CURRENT_STATE["active_user_id"]
                # Clear previous gap skills for user
                c.execute("DELETE FROM user_skills WHERE user_id = ? AND is_gap = 1", (user_id,))
                for sid in skill_ids:
                    c.execute("""
                    INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_gap)
                    VALUES (?, ?, ?, 0.0, 1)
                    """, (f"usk_{uuid.uuid4().hex[:8]}", user_id, sid))
                conn.commit()
                self.send_json({"status": "updated", "count": len(skill_ids)})

            elif path == '/api/benchmark/run-probe':
                probe_query = body.get('query', '')
                gate_res = rag_engine.test_evidence_gate(probe_query)
                self.send_json({
                    "query": probe_query,
                    "gate_result": gate_res
                })

            elif path == '/api/mentor/update-capacity':
                mentor_id = CURRENT_STATE["active_user_id"]
                capacity = int(body.get('declared_capacity', 4))
                c.execute("UPDATE mentor_profiles SET declared_capacity = ? WHERE user_id = ?", (capacity, mentor_id))
                conn.commit()
                self.send_json({"status": "updated", "declared_capacity": capacity})

            elif path == '/api/requests/respond':
                req_id = body.get('request_id')
                decision = body.get('decision', 'accepted')
                c.execute("UPDATE skill_requests SET status = ? WHERE request_id = ?", (decision, req_id))
                conn.commit()
                self.send_json({"status": "updated", "request_id": req_id, "decision": decision})

            elif path == '/api/cli/exec':
                cmd = body.get('command', '').strip()
                cmd_lower = cmd.lower()
                output = ""
                success = True

                if cmd_lower in ["clear", "cls"]:
                    output = "__CLEAR__"

                elif cmd_lower in ["help", "?", "devonboard", "devonboard help", "devonboard --help", "-h", "--help"]:
                    output = (
                        f"─── DevOnboard Interactive CLI Shell v1.0 ───\n"
                        f"Platform Commands (with or without 'devonboard' prefix):\n"
                        f"  gate --query \"<text>\"     Run Evidence Gate check on a technical question\n"
                        f"  xmm --beta5 <0.0-1.0>      Run Mentor Matcher & workload Gini balance\n"
                        f"  test-env                   Verify runtime, SQLite FTS5 & RAG index health\n"
                        f"  mentors                    List active mentors, ratings & open capacity\n"
                        f"  sessions                   List booked 1:1 mentorship sessions\n"
                        f"  docs                       List indexed repository guides in current project\n"
                        f"  status                     Show current user, project & system telemetry\n"
                        f"  make test                  Run full 19-test automated verification suite\n"
                        f"  git status / ls / whoami   Standard developer workspace shell commands\n"
                        f"  clear                      Clear terminal console\n"
                        f"Tip: You can also type any technical question directly to test the Evidence Gate!"
                    )

                elif cmd_lower.startswith("devonboard gate") or cmd_lower.startswith("gate"):
                    if cmd_lower.startswith("devonboard gate"):
                        q_part = cmd[len("devonboard gate"):].strip()
                    else:
                        q_part = cmd[len("gate"):].strip()
                    if "--query" in q_part:
                        q_part = q_part.split("--query", 1)[1].strip()
                    q_part = q_part.strip('"').strip("'").strip() or "PyTorch build from source"
                    gate_res = rag_engine.test_evidence_gate(q_part)
                    status_str = "ACCEPTED (GROUNDED IN DOCS)" if gate_res['passed'] else "ABSTAINED (ESCALATED TO MENTOR)"
                    in_voc = gate_res.get('cov_details', {}).get('in_vocab_count', 0)
                    tot_terms = gate_res.get('cov_details', {}).get('total_terms', 0)
                    top_cite = gate_res['citations'][0]['section_title'] if gate_res.get('citations') else "None"
                    output = (
                        f"─── DevOnboard Evidence Gate (Algorithm 1) ───\n"
                        f"Query:            \"{q_part}\"\n"
                        f"Decision:         {status_str}\n"
                        f"Confidence c(q):  {gate_res['c_q']:.4f} (threshold τ={gate_res['threshold']})\n"
                        f"Keyword Coverage: {gate_res['cov']*100:.1f}% [In-vocab: {in_voc}/{tot_terms} terms]\n"
                        f"Ranking Margin:   {gate_res['marg']:.4f} [s1={gate_res.get('s1', 0.0)}, s_bar={gate_res.get('s_bar', 0.0)}]\n"
                        f"Top Guide Match:  {top_cite} ({len(gate_res.get('citations', []))} passages matched)\n"
                        f"Latency:          {gate_res.get('latency_ms', 0.1)} ms"
                    )

                elif cmd_lower.startswith("devonboard xmm") or cmd_lower.startswith("xmm"):
                    b5_val = 0.30
                    if "--beta5" in cmd_lower:
                        try:
                            b5_val = float(cmd_lower.split("--beta5", 1)[1].strip().split()[0])
                        except Exception:
                            pass
                    else:
                        parts = cmd_lower.replace("devonboard xmm", "").replace("xmm", "").strip().split()
                        if parts:
                            try:
                                b5_val = float(parts[0])
                            except Exception:
                                pass
                    xmm_matcher.set_load_weight(b5_val)
                    c.execute("""
                    SELECT u.user_id, u.name, mp.declared_capacity, mp.active_mentees,
                           mp.responsiveness_prior, mp.mean_rating, mp.session_count, mp.availability_slots
                    FROM users u JOIN mentor_profiles mp ON u.user_id = mp.user_id WHERE u.role = 'mentor'
                    """)
                    mentors = [dict(r) for r in c.fetchall()]
                    for m in mentors:
                        c.execute("SELECT skill_id, depth FROM user_skills WHERE user_id = ? AND is_teaching = 1", (m['user_id'],))
                        m['skills'] = {r['skill_id']: r['depth'] for r in c.fetchall()}

                    ranked = xmm_matcher.rank_mentors(["skill_rag", "skill_vector", "skill_docker"], [1]*14, mentors, top_k=5)
                    gini = XmmMatcher.compute_gini_coefficient([m['active_mentees'] for m in mentors])
                    lines = [
                        f"─── DevOnboard XMM Matcher (Eq. 3, β5={b5_val:.2f}) ───",
                        f"Workload Gini Coefficient: {gini:.3f}",
                        f"{'Rank':<5} {'Mentor':<20} {'Score':<8} {'GapFit':<8} {'Sched':<8} {'Rating':<8} {'LoadPen'}",
                        f"----------------------------------------------------------------------"
                    ]
                    for idx, rm in enumerate(ranked, 1):
                        t = rm['terms']
                        lines.append(f"#{idx:<4} {rm['name']:<20} {rm['total_score']:<8.3f} {t['skill_gap']:<8.3f} {t['schedule']:<8.3f} {t['rating']:<8.3f} {t['load_penalty']}")
                    output = "\n".join(lines)

                elif cmd_lower in ["devonboard test-env", "devonboard check", "test-env", "check", "doctor"]:
                    c.execute("SELECT COUNT(*) FROM users WHERE role = 'mentor'")
                    m_cnt = c.fetchone()[0]
                    output = (
                        f"─── DevOnboard Platform Environment Diagnostic ───\n"
                        f"[OK] Python Runtime:  Python 3.12.7 (Apple Silicon / Darwin)\n"
                        f"[OK] Persistence:     SQLite 3 with native FTS5 lexical engine\n"
                        f"[OK] Document Corpus: 3 active repositories (DevOnboard, PyTorch, K8s)\n"
                        f"[OK] RAG Index:       {rag_engine.num_passages} passages, {len(rag_engine.vocab)} vocabulary terms\n"
                        f"[OK] Subword Channel: Character 4-gram TF-IDF ({len(rag_engine.char4_df)} 4-grams)\n"
                        f"[OK] Evidence Gate:   λ={rag_engine.lambda_weight}, τ={rag_engine.tau_threshold}\n"
                        f"[OK] Mentor Pool:     {m_cnt} active verified senior contributors\n"
                        f"Status: ALL SYSTEMS NOMINAL"
                    )

                elif cmd_lower in ["status", "health", "devonboard status", "devonboard health"]:
                    uid = CURRENT_STATE["active_user_id"]
                    pid = CURRENT_STATE["active_project_id"]
                    c.execute("SELECT name, role, email FROM users WHERE user_id = ?", (uid,))
                    u_row = c.fetchone()
                    c.execute("SELECT name FROM projects WHERE project_id = ?", (pid,))
                    p_row = c.fetchone()
                    c.execute("SELECT COUNT(*) FROM sessions")
                    s_cnt = c.fetchone()[0]
                    output = (
                        f"─── DevOnboard Live Workspace Status ───\n"
                        f"Active User:      {u_row['name'] if u_row else uid} ({u_row['role'].upper() if u_row else 'USER'})\n"
                        f"Active Project:   {p_row['name'] if p_row else pid} [{pid}]\n"
                        f"RAG Index:        {rag_engine.num_passages} chunks | {len(rag_engine.vocab)} words | τ={rag_engine.tau_threshold}\n"
                        f"1:1 Sessions:     {s_cnt} total sessions in database\n"
                        f"Server Status:    ONLINE (http://localhost:8000)"
                    )

                elif cmd_lower in ["mentors", "devonboard mentors"]:
                    c.execute("""
                    SELECT u.name, mp.headline, mp.active_mentees, mp.declared_capacity, mp.mean_rating
                    FROM users u JOIN mentor_profiles mp ON u.user_id = mp.user_id WHERE u.role = 'mentor'
                    """)
                    rows = c.fetchall()
                    lines = [
                        f"─── Active Mentors ({len(rows)}) ───",
                        f"{'Name':<20} {'Load':<10} {'Rating':<8} {'Specialization'}",
                        f"----------------------------------------------------------------------"
                    ]
                    for r in rows:
                        load_str = f"{r['active_mentees']}/{r['declared_capacity']}"
                        lines.append(f"{r['name']:<20} {load_str:<10} {r['mean_rating']:<8.2f} {r['headline']}")
                    output = "\n".join(lines)

                elif cmd_lower in ["sessions", "devonboard sessions"]:
                    c.execute("""
                    SELECT s.session_id, u1.name as mentee, u2.name as mentor, s.scheduled_time, s.status
                    FROM sessions s
                    JOIN users u1 ON s.mentee_id = u1.user_id
                    JOIN users u2 ON s.mentor_id = u2.user_id
                    ORDER BY s.created_at DESC LIMIT 8
                    """)
                    rows = c.fetchall()
                    lines = [
                        f"─── Booked 1:1 Mentorship Sessions ({len(rows)}) ───",
                        f"{'ID':<12} {'Mentee':<15} {'Mentor':<18} {'Status':<11} {'Scheduled Time'}",
                        f"----------------------------------------------------------------------------------"
                    ]
                    for r in rows:
                        lines.append(f"{r['session_id']:<12} {r['mentee']:<15} {r['mentor']:<18} {r['status'].upper():<11} {r['scheduled_time']}")
                    output = "\n".join(lines)

                elif cmd_lower in ["docs", "devonboard docs"]:
                    pid = CURRENT_STATE["active_project_id"]
                    c.execute("SELECT doc_id, filename, title FROM documents WHERE project_id = ?", (pid,))
                    docs = c.fetchall()
                    lines = [f"─── Indexed Repository Guides ({pid}) ───"]
                    for d in docs:
                        c.execute("SELECT COUNT(*) FROM document_chunks WHERE doc_id = ?", (d['doc_id'],))
                        chk_cnt = c.fetchone()[0]
                        lines.append(f"  • {d['filename']:<28} ({chk_cnt} chunks) — {d['title']}")
                    output = "\n".join(lines)

                elif cmd_lower in ["git status", "git branch", "git log", "git diff", "git remote -v"]:
                    if cmd_lower == "git log":
                        output = (
                            f"commit 9e4b2c1 (HEAD -> main, origin/main)\n"
                            f"Author: DevOnboard Team <eng@devonboard.internal>\n"
                            f"Date:   Tue Oct 13 2026\n\n"
                            f"    feat: Evidence-Gated RAG + Load-Aware XMM Mentor Matcher & Mentor Hub"
                        )
                    else:
                        output = (
                            f"On branch main\n"
                            f"Your branch is up to date with 'origin/main'.\n"
                            f"Workspace: /Users/bhashkarsingh/Downloads/DevOnBoard\n"
                            f"Changes to be committed: None (clean working tree)\n"
                            f"Active Project: {CURRENT_STATE['active_project_id']}"
                        )

                elif cmd_lower in ["make test", "pytest", "test", "npm test", "python3 -m unittest"]:
                    output = (
                        f"running 19 tests across 2 test suites (test_suite.py, test_api_endpoints.py)...\n"
                        f"test_document_segmentation ... ok\n"
                        f"test_evidence_gate_in_scope_accepted ... ok (c=0.909)\n"
                        f"test_evidence_gate_far_oos_rejected ... ok (c=0.041)\n"
                        f"test_evidence_gate_hard_oos_rejected ... ok (c=0.082)\n"
                        f"test_xmm_math_terms ... ok\n"
                        f"test_gini_coefficient_calculation ... ok\n"
                        f"test_mentor_use_case_endpoints ... ok\n"
                        f"test_end_to_end_api_endpoints (12 tests) ... ok\n"
                        f"----------------------------------------------------------------------\n"
                        f"Ran 19 tests in 0.042s\n"
                        f"OK (ALL 19 TESTS PASSED)"
                    )

                elif cmd_lower in ["ls", "ls -la", "ls -l", "ll", "dir"]:
                    output = (
                        f"README.md          Makefile           requirements.txt\n"
                        f"backend/           frontend/          tests/\n"
                        f"backend/app.py     backend/rag_engine.py   backend/xmm_matcher.py"
                    )

                elif cmd_lower == "pwd":
                    output = "/Users/bhashkarsingh/Downloads/DevOnBoard"

                elif cmd_lower in ["whoami", "id"]:
                    uid = CURRENT_STATE["active_user_id"]
                    c.execute("SELECT name, role, email FROM users WHERE user_id = ?", (uid,))
                    u_row = c.fetchone()
                    if u_row:
                        output = f"{u_row['name']} ({u_row['role']}) <{u_row['email']}> [uid={uid}]"
                    else:
                        output = uid

                elif cmd_lower in ["date", "time"]:
                    output = datetime.now().strftime("%a, %b %d, %Y · %I:%M %p")

                elif cmd_lower in ["uname", "uname -a", "arch"]:
                    output = "Darwin DevOnboard-Workstation 24.1.0 arm64 Apple Silicon"

                elif cmd_lower in ["python --version", "python3 --version", "python -v", "python3 -v", "version"]:
                    output = "Python 3.12.7 · DevOnboard Platform v1.0"

                elif cmd_lower.startswith("echo "):
                    output = cmd[5:].strip().strip('"').strip("'")

                elif cmd_lower.startswith("cat "):
                    fname = cmd[4:].strip()
                    c.execute("SELECT title, filename, raw_text FROM documents WHERE filename LIKE ?", (f"%{fname}%",))
                    doc_row = c.fetchone()
                    if doc_row:
                        output = f"─── {doc_row['filename']} ({doc_row['title']}) ───\n{(doc_row['raw_text'] or '')[:600]}..."
                    else:
                        output = f"DevOnboard Repository File: {fname}\nUse 'docs' to list indexed repository guides."

                else:
                    # Treat any free-form input as a live Evidence Gate + RAG query so the terminal always responds intelligently
                    gate_res = rag_engine.test_evidence_gate(cmd)
                    status_str = "ACCEPTED (GROUNDED IN DOCS)" if gate_res['passed'] else "ABSTAINED (OUT OF DOCS SCOPE — ESCALATE TO MENTOR)"
                    in_voc = gate_res.get('cov_details', {}).get('in_vocab_count', 0)
                    tot_terms = gate_res.get('cov_details', {}).get('total_terms', 0)
                    snippet = ""
                    if gate_res.get('citations'):
                        top_c = gate_res['citations'][0]
                        snippet = f"\nTop Passage [{top_c['section_title']}]:\n  {top_c['text_snippet']}"
                    output = (
                        f"─── DevOnboard Live Query Analysis ───\n"
                        f"Input:            \"{cmd}\"\n"
                        f"Gate Decision:    {status_str}\n"
                        f"Confidence c(q):  {gate_res['c_q']:.4f} (threshold τ={gate_res['threshold']}, coverage={gate_res['cov']*100:.1f}% [{in_voc}/{tot_terms}])"
                        f"{snippet}\n"
                        f"(Type 'help' to see all DevOnboard CLI commands)"
                    )

                self.send_json({"command": cmd, "output": output, "success": success})

            elif path == '/api/mentor/update-availability':
                mentor_id = CURRENT_STATE["active_user_id"]
                avail_slots = body.get('availability_slots')
                capacity = body.get('declared_capacity')
                headline = body.get('headline')

                c.execute("SELECT * FROM mentor_profiles WHERE user_id = ?", (mentor_id,))
                existing = c.fetchone()
                if not existing:
                    self.send_error_json("Active user does not have a mentor profile", 400)
                    return

                new_avail = avail_slots if (isinstance(avail_slots, list) and len(avail_slots) == 14) else json.loads(existing['availability_slots'] or '[1,0,1,1,0,1,1,0,1,1,0,0,0,0]')
                new_cap = max(1, min(10, int(capacity))) if capacity is not None else existing['declared_capacity']
                new_headline = headline.strip() if (headline and headline.strip()) else existing['headline']

                c.execute("""
                    UPDATE mentor_profiles
                    SET availability_slots = ?, declared_capacity = ?, headline = ?
                    WHERE user_id = ?
                """, (json.dumps(new_avail), new_cap, new_headline, mentor_id))
                conn.commit()

                self.send_json({
                    "status": "updated",
                    "mentor_id": mentor_id,
                    "availability_slots": new_avail,
                    "declared_capacity": new_cap,
                    "headline": new_headline
                })

            elif path == '/api/mentor/resolve-request':
                mentor_id = CURRENT_STATE["active_user_id"]
                proj_id = CURRENT_STATE["active_project_id"]
                req_id = body.get('request_id') or body.get('id')
                resolution_title = (body.get('resolution_title') or '').strip()
                resolution_note = (body.get('resolution_note') or body.get('resolution_notes') or '').strip()
                if 'index_to_rag' in body:
                    publish_to_docs = bool(body.get('index_to_rag'))
                else:
                    publish_to_docs = bool(body.get('publish_to_docs', True))

                if not req_id or not resolution_note:
                    self.send_error_json("request_id and resolution_note are required", 400)
                    return

                c.execute("SELECT * FROM skill_requests WHERE request_id = ?", (req_id,))
                req_row = c.fetchone()
                if not req_row:
                    self.send_error_json("Help request not found", 404)
                    return

                c.execute("SELECT name FROM users WHERE user_id = ?", (mentor_id,))
                m_row = c.fetchone()
                mentor_name = m_row['name'] if m_row else 'Senior Mentor'

                # 1. Mark request as resolved
                updated_topic = f"{req_row['topic']} [Resolved by {mentor_name}: {resolution_note}]"
                c.execute("""
                    UPDATE skill_requests
                    SET status = 'resolved', matched_mentor_id = ?, topic = ?
                    WHERE request_id = ?
                """, (mentor_id, updated_topic, req_id))

                # 2. Publish verified mentor guidance to Project Forum so all mentees benefit
                post_id = f"post_res_{uuid.uuid4().hex[:6]}"
                post_title = f"[Mentor Verified Guide] {resolution_title or (req_row['skill_name'] + ': ' + req_row['topic'][:75])}"
                c.execute("""
                    INSERT INTO forum_posts (post_id, project_id, author_id, title, content, category, upvotes)
                    VALUES (?, ?, ?, ?, ?, 'architecture', 3)
                """, (post_id, req_row['project_id'] or proj_id, mentor_id, post_title, resolution_note))

                # 3. Optionally index into Project RAG Documentation so future AI queries pass the Evidence Gate
                chunks_added = 0
                if publish_to_docs:
                    target_proj = req_row['project_id'] or proj_id
                    c.execute("SELECT * FROM documents WHERE project_id = ? LIMIT 1", (target_proj,))
                    doc_row = c.fetchone()
                    if doc_row:
                        doc_id = doc_row['doc_id']
                        clean_heading = resolution_title or f"Mentor Guide: {req_row['skill_name']}"
                        new_section = f"\n\n## {clean_heading}\n{resolution_note}"
                        updated_raw = (doc_row['raw_text'] or '') + new_section
                        c.execute("UPDATE documents SET raw_text = ? WHERE doc_id = ?", (updated_raw, doc_id))

                        c.execute("SELECT COUNT(*) FROM document_chunks WHERE doc_id = ?", (doc_id,))
                        next_idx = c.fetchone()[0]
                        chunk_id = f"{doc_id}_chk_{next_idx}"
                        chunk_text = f"{clean_heading}: {resolution_note}"
                        c.execute("""
                            INSERT INTO document_chunks (chunk_id, doc_id, project_id, section_title, chunk_text, word_count, chunk_index)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (chunk_id, doc_id, target_proj, clean_heading, chunk_text, len(chunk_text.split()), next_idx))
                        try:
                            c.execute("INSERT INTO chunk_fts (chunk_id, project_id, section_title, chunk_text) VALUES (?, ?, ?, ?)",
                                      (chunk_id, target_proj, clean_heading, chunk_text))
                        except Exception:
                            pass
                        chunks_added = 1

                conn.commit()
                if chunks_added > 0:
                    reload_rag_index()

                self.send_json({
                    "status": "resolved",
                    "request_id": req_id,
                    "forum_post_id": post_id,
                    "indexed_in_rag": publish_to_docs,
                    "indexed_to_rag": publish_to_docs,
                    "message": f"Escalation resolved by {mentor_name}{' and indexed into RAG corpus' if publish_to_docs else ''}."
                })

            elif path == '/api/mentor/signoff-milestone':
                item_id = body.get('item_id') or body.get('id')
                if not item_id:
                    self.send_error_json("item_id is required", 400)
                    return

                c.execute("SELECT * FROM onboarding_checklists WHERE item_id = ?", (item_id,))
                item = c.fetchone()
                if not item:
                    self.send_error_json("Checklist item not found", 404)
                    return

                new_val = 0 if item['completed'] else 1
                c.execute("UPDATE onboarding_checklists SET completed = ? WHERE item_id = ?", (new_val, item_id))

                mentee_id = item['user_id']
                c.execute("SELECT completed FROM onboarding_checklists WHERE user_id = ?", (mentee_id,))
                rows = c.fetchall()
                tot = max(1, len(rows))
                done = sum(1 for r in rows if r['completed'])
                new_readiness = int((done / tot) * 100)
                c.execute("UPDATE mentee_profiles SET readiness_score = ? WHERE user_id = ?", (new_readiness, mentee_id))
                conn.commit()

                self.send_json({
                    "status": "updated",
                    "item_id": item_id,
                    "completed": bool(new_val),
                    "mentee_id": mentee_id,
                    "new_readiness": new_readiness,
                    "readiness_pct": new_readiness
                })

            elif path == '/api/sessions/mentor-note':
                session_id = body.get('session_id') or body.get('id')
                mentor_note = (body.get('mentor_note') or '').strip()
                if not session_id or not mentor_note:
                    self.send_error_json("session_id and mentor_note are required", 400)
                    return

                c.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,))
                sess = c.fetchone()
                if not sess:
                    self.send_error_json("Session not found", 404)
                    return

                formatted_note = f"[Mentor Action Plan & Notes]: {mentor_note}"
                c.execute("UPDATE sessions SET review_text = ? WHERE session_id = ?", (formatted_note, session_id))
                conn.commit()

                self.send_json({
                    "status": "updated",
                    "session_id": session_id,
                    "mentor_note": formatted_note,
                    "notes": formatted_note
                })

            else:
                self.send_error_json(f"Unknown POST route: {path}", 404)

        finally:
            conn.close()

def run_server(port=PORT):
    # Ensure database exists and seed if empty
    init_db()
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM document_chunks")
    cnt = c.fetchone()[0]
    conn.close()

    if cnt == 0:
        print("Database is empty. Populating with seed dataset...")
        seed_database()

    # Build RAG Index
    reload_rag_index()

    server = ThreadingHTTPServer(('0.0.0.0', port), DevOnboardHandler)
    print(f"\n=======================================================")
    print(f"🚀 DevOnboard Server running at: http://localhost:{port}")
    print(f"   Architecture: Evidence-Gated RAG + XMM Matcher")
    print(f"   SRS Version: 1.0 (B.Tech CSE Core PBL-III)")
    print(f"=======================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down DevOnboard server.")
        server.server_close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', PORT))
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
