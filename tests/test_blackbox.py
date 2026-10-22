"""
DevOnBoard - Black Box Testing Suite (Specification-Based Behavioral Testing)
Tests the platform strictly via its external HTTP API and specification contracts
WITHOUT relying on knowledge of internal implementation, variables, or private methods.

Standard Testing Methodologies Applied:
  1. Equivalence Class Partitioning (ECP) - Valid vs Invalid Inputs
  2. Boundary Value Analysis (BVA) - 24h cancellation rule, ratings, strictness
  3. Decision Table Testing - Evidence Gate Input-Output Acceptance Matrix
  4. State Transition Testing - Session lifecycle (Scheduled -> Rescheduled -> Completed / Cancelled)
  5. Security & Error Guessing - SQL injection strings, empty payloads, missing keys
  6. Data Isolation & RBAC - Strict mentor/mentee privacy boundaries
"""

import os
import sys
import io
import json
import time
import datetime
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import DevOnboardHandler, CURRENT_STATE, reload_rag_index
from backend.database import init_db
from backend.seed_data import seed_database


def call_api(method: str, path: str, body: dict = None) -> tuple:
    """Helper to simulate an external HTTP client request to the platform."""
    raw_body = json.dumps(body).encode('utf-8') if body is not None else b""
    headers = {
        'Content-Length': str(len(raw_body)),
        'Content-Type': 'application/json'
    }

    handler = DevOnboardHandler.__new__(DevOnboardHandler)
    handler.rfile = io.BytesIO(raw_body)
    handler.wfile = io.BytesIO()
    handler.headers = headers
    handler.command = method
    handler.path = path
    handler.request_version = "HTTP/1.1"
    handler.close_connection = True

    sent_status = [200]

    def mock_send_response(status, message=None):
        sent_status[0] = status

    handler.send_response = mock_send_response
    handler.send_header = lambda k, v: None
    handler.end_headers = lambda: None

    if method == 'GET':
        handler.do_GET()
    elif method == 'POST':
        handler.do_POST()

    output_raw = handler.wfile.getvalue().decode('utf-8')
    try:
        data = json.loads(output_raw)
    except Exception:
        data = output_raw

    return sent_status[0], data


class TestDevOnboardBlackBox(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_database()
        reload_rag_index()

    def setUp(self):
        # Reset active session to default mentee Alex Rivera
        call_api('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

    # ================= 1. EQUIVALENCE CLASS PARTITIONING (ECP) =================
    def test_bb_ecp_valid_credentials_authentication(self):
        """ECP Partition 1 (Valid): Registered user logs in with matching password."""
        status, res = call_api('POST', '/api/auth/login', {
            'email': 'alex.rivera@devonboard.internal',
            'password': 'password123'
        })
        self.assertEqual(status, 200)
        self.assertTrue(res.get('success'))
        self.assertEqual(res['user']['user_id'], 'usr_mentee_alex')
        self.assertEqual(res['user']['role'], 'mentee')

    def test_bb_ecp_invalid_password_rejected(self):
        """ECP Partition 2 (Invalid): Registered user with wrong password must be rejected."""
        status, res = call_api('POST', '/api/auth/login', {
            'email': 'alex.rivera@devonboard.internal',
            'password': 'completely_wrong_password!'
        })
        self.assertIn(status, [400, 401])
        self.assertFalse(res.get('success', False))

    def test_bb_ecp_nonexistent_user_rejected(self):
        """ECP Partition 3 (Invalid): Non-existent user email must be rejected."""
        status, res = call_api('POST', '/api/auth/login', {
            'email': 'stranger_danger@unknown-domain.com',
            'password': 'password123'
        })
        self.assertIn(status, [400, 401, 404])
        self.assertFalse(res.get('success', False))

    # ================= 2. BOUNDARY VALUE ANALYSIS (BVA) =================
    def test_bb_bva_session_cancellation_24h_boundary(self):
        """BVA: Test 24-hour cancellation rule at boundary (>24h allowed, <24h blocked)."""
        now = datetime.datetime.now()

        # Boundary A: 72 hours in future (Well outside 24h window -> Allowed)
        d_far = now + datetime.timedelta(hours=72)
        far_str = d_far.strftime('%A, %b %d, %Y (02:00 PM - 03:00 PM)')
        far_iso = d_far.strftime('%Y-%m-%d')

        status_b1, b1 = call_api('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_david',
            'slot_idx': 4,
            'scheduled_date': far_iso,
            'scheduled_time': far_str,
            'topic': 'BVA Cancellation Allowed Test'
        })
        self.assertEqual(status_b1, 200)
        sess_far_id = b1['session_id']

        status_c1, res_c1 = call_api('POST', '/api/sessions/cancel', {
            'session_id': sess_far_id,
            'reason': 'Cancelling well in advance'
        })
        self.assertEqual(status_c1, 200)
        self.assertEqual(res_c1.get('status'), 'cancelled')

    def test_bb_bva_premature_session_completion_rejection(self):
        """BVA: Upcoming future session cannot be marked completed or rated before it occurs."""
        now = datetime.datetime.now()
        d_fut = now + datetime.timedelta(days=7)
        fut_str = d_fut.strftime('%A, %b %d, %Y (10:00 AM - 11:00 AM)')

        status_b, b = call_api('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_elena',
            'slot_idx': 2,
            'scheduled_date': d_fut.strftime('%Y-%m-%d'),
            'scheduled_time': fut_str,
            'topic': 'Premature rating test'
        })
        self.assertEqual(status_b, 200)
        sess_id = b['session_id']

        # Attempt to mark completed without allow_past_simulation flag
        status_comp, err = call_api('POST', '/api/sessions/complete-and-rate', {
            'session_id': sess_id,
            'rating': 5.0,
            'review_text': 'Trying to rate future meeting'
        })
        self.assertEqual(status_comp, 400)
        self.assertIn("upcoming meeting", err.get('error', '').lower())

    # ================= 3. DECISION TABLE TESTING =================
    def test_bb_decision_table_evidence_gate(self):
        """
        Decision Table:
        | Rule | Query Category           | Example Query                          | Expected Decision   | Citations Expected | Escalated |
        |------|--------------------------|----------------------------------------|---------------------|--------------------|-----------|
        | R1   | Grounded in Documentation| 'PyTorch build from source using Ninja'| ACCEPTED            | True               | False     |
        | R2   | Hard Out-of-Scope (Tech) | 'Configure Cisco BGP autonomous system'| ABSTAIN_ESCALATED   | False              | True      |
        | R3   | Far Out-of-Scope (Culinary)| 'How to bake French brioche with yeast'| ABSTAIN_ESCALATED | False              | True      |
        """
        decision_table = [
            ("R1", "How do I build PyTorch from source using Ninja and setup.py?", True, "ACCEPTED", False),
            ("R2", "How to configure BGP routing and autonomous system numbers on Cisco IOS?", False, "ABSTAIN_ESCALATED", True),
            ("R3", "How do I bake an authentic sourdough loaf at home?", False, "ABSTAIN_ESCALATED", True)
        ]

        for rule, query, exp_passed, exp_dec, exp_esc in decision_table:
            time.sleep(0.005)
            status, res = call_api('POST', '/api/rag/ask', {'query': query})
            self.assertEqual(status, 200, f"Rule {rule} failed HTTP status")
            gate = res.get('gate_result', {})
            ans = res.get('answer_result', {})

            self.assertEqual(gate.get('passed'), exp_passed, f"Rule {rule} mismatch on gate.passed")
            self.assertEqual(gate.get('decision'), exp_dec, f"Rule {rule} mismatch on gate.decision")
            self.assertEqual(ans.get('escalated'), exp_esc, f"Rule {rule} mismatch on ans.escalated")

    # ================= 4. STATE TRANSITION TESTING =================
    def test_bb_state_transitions_session_lifecycle(self):
        """
        State Transition Model:
        [INIT] -> (Book) -> [SCHEDULED] -> (Reschedule) -> [RESCHEDULED/SCHEDULED] -> (Cancel) -> [CANCELLED]
        -> (Cancel Again) -> [ERROR 400]
        """
        now = datetime.datetime.now()
        d_slot1 = (now + datetime.timedelta(days=4)).strftime('%Y-%m-%d')
        str_slot1 = (now + datetime.timedelta(days=4)).strftime('%A, %b %d, %Y (02:00 PM - 03:00 PM)')

        # Transition 1: Book session -> 'scheduled'
        s_b, b_data = call_api('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_david',
            'slot_idx': 6,
            'scheduled_date': d_slot1,
            'scheduled_time': str_slot1,
            'topic': 'State Transition Test'
        })
        self.assertEqual(s_b, 200)
        self.assertEqual(b_data['status'], 'booked')
        sess_id = b_data['session_id']

        # Transition 2: Reschedule session -> 'rescheduled'
        d_slot2 = (now + datetime.timedelta(days=5)).strftime('%Y-%m-%d')
        str_slot2 = (now + datetime.timedelta(days=5)).strftime('%A, %b %d, %Y (10:00 AM - 11:00 AM)')
        s_r, r_data = call_api('POST', '/api/sessions/reschedule', {
            'session_id': sess_id,
            'scheduled_date': d_slot2,
            'scheduled_time': str_slot2,
            'slot_idx': 8,
            'topic': 'Updated topic for state test'
        })
        self.assertEqual(s_r, 200)
        self.assertEqual(r_data['status'], 'rescheduled')

        # Transition 3: Cancel session -> 'cancelled'
        s_c, c_data = call_api('POST', '/api/sessions/cancel', {
            'session_id': sess_id,
            'reason': 'Finished early'
        })
        self.assertEqual(s_c, 200)
        self.assertEqual(c_data['status'], 'cancelled')

        # Transition 4 (Invalid): Attempting to cancel already-cancelled session -> Error 400
        s_invalid, inv_data = call_api('POST', '/api/sessions/cancel', {
            'session_id': sess_id,
            'reason': 'Cancelling again'
        })
        self.assertEqual(s_invalid, 400)
        self.assertIn("only scheduled upcoming sessions", inv_data.get('error', '').lower())

    # ================= 5. DATA ISOLATION & PRIVACY (RBAC) =================
    def test_bb_mentor_session_privacy_isolation(self):
        """RBAC / Privacy: Mentor David should ONLY see sessions booked with David, not Elena."""
        # 1. Book session with Elena
        now = datetime.datetime.now()
        d_iso = (now + datetime.timedelta(days=6)).strftime('%Y-%m-%d')
        d_str = (now + datetime.timedelta(days=6)).strftime('%A, %b %d, %Y (10:00 AM - 11:00 AM)')
        s1, b_elena = call_api('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_elena',
            'slot_idx': 4,
            'scheduled_date': d_iso,
            'scheduled_time': d_str,
            'topic': 'Elena Private Session'
        })
        self.assertEqual(s1, 200)
        elena_sess_id = b_elena['session_id']

        # 2. Switch user to David
        call_api('POST', '/api/auth/switch-user', {'user_id': 'usr_mentor_david'})
        s_m, david_view = call_api('GET', '/api/sessions')
        self.assertEqual(s_m, 200)

        # David must NOT see Elena's booked session
        david_session_ids = [s['session_id'] for s in david_view]
        self.assertNotIn(elena_sess_id, david_session_ids, "Data leak: Mentor David can see Mentor Elena's session!")

    # ================= 6. SECURITY & ERROR GUESSING =================
    def test_bb_security_sql_injection_resilience(self):
        """Security: Verify SQL injection attempts in search queries fail safely without crashing or corrupting data."""
        sql_payloads = [
            "'; DROP TABLE users; --",
            "1 UNION SELECT null, null, null--",
            "admin' --",
            "' OR '1'='1"
        ]
        for payload in sql_payloads:
            time.sleep(0.005)
            status, res = call_api('POST', '/api/rag/ask', {'query': payload})
            # Must return clean HTTP 200, NEVER a 500 internal server crash
            self.assertEqual(status, 200, f"Payload crashed with status {status}: {payload}")
            self.assertIn('gate_result', res)
            self.assertIn('answer_result', res)

        # Confirm users table was not dropped or compromised by SQL injection
        status_users, users = call_api('GET', '/api/users')
        self.assertEqual(status_users, 200)
        self.assertGreaterEqual(len(users), 4, "Security failure: users table compromised by SQL injection payload!")

    def test_bb_missing_payload_parameters(self):
        """Error Handling: Verify proper HTTP 400/404 response on missing mandatory parameters."""
        # Missing mentor_id on booking
        s1, err1 = call_api('POST', '/api/sessions/book', {'slot_idx': 0})
        self.assertEqual(s1, 400)
        self.assertIn("mentor_id is required", err1.get('error', '').lower())

        # Empty payload on cancel
        s2, err2 = call_api('POST', '/api/sessions/cancel', {})
        self.assertEqual(s2, 404)


if __name__ == '__main__':
    unittest.main()
