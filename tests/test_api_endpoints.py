import io
import json
import unittest
from backend.app import DevOnboardHandler, CURRENT_STATE
from backend.database import get_connection, init_db
from backend.seed_data import seed_database

class MockServer:
    pass

class MockRequest:
    def __init__(self, data=b""):
        self.rfile = io.BytesIO(data)
        self.wfile = io.BytesIO()

    def makefile(self, *args, **kwargs):
        if 'r' in args[0]:
            return self.rfile
        return self.wfile

    def sendall(self, data):
        self.wfile.write(data)

def simulate_request(method, path, body=None):
    raw_body = json.dumps(body).encode('utf-8') if body else b""
    headers = {
        'Content-Length': str(len(raw_body)),
        'Content-Type': 'application/json'
    }
    
    mock_sock = MockRequest(raw_body)
    handler = DevOnboardHandler.__new__(DevOnboardHandler)
    handler.rfile = io.BytesIO(raw_body)
    handler.wfile = io.BytesIO()
    handler.headers = headers
    handler.command = method
    handler.path = path
    handler.request_version = "HTTP/1.1"
    handler.close_connection = True

    sent_headers = []
    sent_status = [200]

    def mock_send_response(status, message=None):
        sent_status[0] = status

    def mock_send_header(k, v):
        sent_headers.append((k, v))

    def mock_end_headers():
        pass

    handler.send_response = mock_send_response
    handler.send_header = mock_send_header
    handler.end_headers = mock_end_headers

    if method == 'GET':
        handler.do_GET()
    elif method == 'POST':
        handler.do_POST()

    output_bytes = handler.wfile.getvalue()
    try:
        return sent_status[0], json.loads(output_bytes.decode('utf-8'))
    except:
        return sent_status[0], output_bytes.decode('utf-8')

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_database()
        from backend.app import reload_rag_index
        reload_rag_index()

    @classmethod
    def tearDownClass(cls):
        seed_database()
        from backend.app import reload_rag_index
        reload_rag_index()
        CURRENT_STATE['active_user_id'] = 'usr_mentee_alex'

    def test_health_endpoint(self):
        status, data = simulate_request('GET', '/api/health')
        self.assertEqual(status, 200)
        self.assertEqual(data['status'], 'online')
        self.assertGreaterEqual(data['passages_indexed'], 20)

    def test_auth_me_endpoint(self):
        status, data = simulate_request('GET', '/api/auth/me')
        self.assertEqual(status, 200)
        self.assertEqual(data['user_id'], 'usr_mentee_alex')
        self.assertEqual(data['role'], 'mentee')
        self.assertGreater(len(data['gap_skills']), 0)

    def test_switch_user_endpoint(self):
        status, data = simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentor_elena'})
        self.assertEqual(status, 200)
        self.assertEqual(data['active_user_id'], 'usr_mentor_elena')

        # Switch back to mentee
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

    def test_login_and_register_endpoint(self):
        # Test Credentials Login
        status, login_res = simulate_request('POST', '/api/auth/login', {
            'email': 'alex.rivera@devonboard.internal',
            'password': 'password123'
        })
        self.assertEqual(status, 200)
        self.assertEqual(login_res['status'], 'authenticated')
        self.assertTrue('token' in login_res)

        # Test Registration
        status, reg_res = simulate_request('POST', '/api/auth/register', {
            'name': 'Taylor Swift',
            'email': 'taylor@devonboard.internal',
            'role': 'mentee'
        })
        self.assertEqual(status, 200)
        self.assertEqual(reg_res['status'], 'registered')
        self.assertTrue(reg_res['user']['user_id'].startswith('usr_mentee_'))

        # Switch back to Alex
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

    def test_matching_xmm_endpoint(self):
        status, data = simulate_request('GET', '/api/matching/xmm?beta5=0.30')
        self.assertEqual(status, 200)
        self.assertIn('ranked_mentors', data)
        self.assertGreater(len(data['ranked_mentors']), 0)
        top = data['ranked_mentors'][0]
        self.assertIn('terms', top)
        self.assertIn('total_score', top)
        self.assertIn('gini_workload', data)

    def test_rag_ask_in_scope_endpoint(self):
        status, data = simulate_request('POST', '/api/rag/ask', {
            'query': 'How do I configure the evidence gate threshold and weights?'
        })
        self.assertEqual(status, 200)
        self.assertTrue(data['gate_result']['passed'])
        self.assertEqual(data['gate_result']['decision'], 'ACCEPTED')
        self.assertGreater(len(data['gate_result']['citations']), 0)

    def test_rag_ask_out_of_scope_abstains_and_escalates(self):
        status, data = simulate_request('POST', '/api/rag/ask', {
            'query': 'How to configure Cisco BGP routing and autonomous systems?'
        })
        self.assertEqual(status, 200)
        self.assertFalse(data['gate_result']['passed'])
        self.assertEqual(data['gate_result']['decision'], 'ABSTAIN_ESCALATED')
        self.assertTrue(data['answer_result']['escalated'])
        self.assertIsNotNone(data['answer_result']['escalated_mentor'])

    def test_booking_and_rating_workflow(self):
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

        # 1. Book an upcoming session (>24h in future)
        status, b_data = simulate_request('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_elena',
            'slot_idx': 8,
            'scheduled_date': '2026-10-16',
            'scheduled_time': 'Friday, Oct 16, 2026 (02:00 PM - 03:00 PM)',
            'topic': 'Deep-dive into out-of-vocabulary coverage weighting'
        })
        self.assertEqual(status, 200)
        self.assertEqual(b_data['status'], 'booked')
        self.assertTrue(b_data['meet_link'].startswith('https://meet.google.com/dev-'))
        sess_id = b_data['session_id']

        # 2. Verify upcoming future session CANNOT be prematurely marked completed & rated
        status_premature, err_data = simulate_request('POST', '/api/sessions/complete-and-rate', {
            'session_id': sess_id,
            'rating': 5.0,
            'review_text': 'Premature rating attempt'
        })
        self.assertEqual(status_premature, 400)
        self.assertIn('upcoming meeting', err_data.get('error', ''))

        # 3. Mentee reschedules the session (>=24h in advance)
        status_resched, resched_data = simulate_request('POST', '/api/sessions/reschedule', {
            'session_id': sess_id,
            'scheduled_date': '2026-10-17',
            'scheduled_time': 'Saturday, Oct 17, 2026 (10:00 AM - 11:00 AM)',
            'slot_idx': 10,
            'topic': 'Updated: OOV coverage weighting & citations'
        })
        self.assertEqual(status_resched, 200)
        self.assertEqual(resched_data['status'], 'rescheduled')

        # 4. Complete and Rate session (with past simulation flag)
        status, r_data = simulate_request('POST', '/api/sessions/complete-and-rate', {
            'session_id': sess_id,
            'rating': 5.0,
            'review_text': 'Dr. Elena explained the denominator penalty brilliantly.',
            'allow_past_simulation': True
        })
        self.assertEqual(status, 200)
        self.assertEqual(r_data['status'], 'completed_and_rated')

        # 5. Book another session and test 24h cancellation
        status_b2, b2_data = simulate_request('POST', '/api/sessions/book', {
            'mentor_id': 'usr_mentor_elena',
            'slot_idx': 6,
            'scheduled_date': '2026-10-18',
            'scheduled_time': 'Sunday, Oct 18, 2026 (10:00 AM - 11:00 AM)',
            'topic': 'Session to test 24h cancellation'
        })
        self.assertEqual(status_b2, 200)
        status_cancel, cancel_data = simulate_request('POST', '/api/sessions/cancel', {
            'session_id': b2_data['session_id'],
            'cancelled_by': 'mentor',
            'reason': 'Conference travel conflict'
        })
        self.assertEqual(status_cancel, 200)
        self.assertEqual(cancel_data['status'], 'cancelled')

        # 6. Verify strict mentor session isolation: each mentor ONLY sees sessions booked with them
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentor_elena'})
        status_elena, elena_sessions = simulate_request('GET', '/api/sessions')
        self.assertEqual(status_elena, 200)
        self.assertTrue(all(s['mentor_id'] == 'usr_mentor_elena' for s in elena_sessions))

        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentor_david'})
        status_david, david_sessions = simulate_request('GET', '/api/sessions')
        self.assertEqual(status_david, 200)
        self.assertEqual(len(david_sessions), 0)

        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

    def test_dashboard_and_audit_log(self):
        status, dash = simulate_request('GET', '/api/dashboard')
        self.assertEqual(status, 200)
        self.assertIn('readiness_score', dash)
        self.assertIn('checklist', dash)

        status, logs = simulate_request('GET', '/api/audit-log')
        self.assertEqual(status, 200)
        self.assertGreater(len(logs), 0)

    def test_benchmark_endpoint(self):
        status, bench = simulate_request('GET', '/api/benchmark')
        self.assertEqual(status, 200)
        self.assertEqual(len(bench['probes']), 19)

    def test_create_mentor_endpoint(self):
        status, res = simulate_request('POST', '/api/mentors/create', {
            'name': 'Dr. Kenji Takahashi',
            'email': 'kenji.takahashi@devonboard.internal',
            'headline': 'Principal Infrastructure Engineer',
            'capacity': 5,
            'skills': ['skill_k8s', 'skill_docker', 'skill_cloud'],
            'availability_slots': [1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]
        })
        self.assertEqual(status, 200)
        self.assertEqual(res['status'], 'created')
        self.assertTrue(res['mentor_id'].startswith('usr_mentor_'))
        self.assertEqual(res['name'], 'Dr. Kenji Takahashi')

    def test_mentee_registration_with_gaps(self):
        status, res = simulate_request('POST', '/api/auth/register', {
            'name': 'Robin Vance',
            'email': 'robin.vance@devonboard.internal',
            'role': 'mentee',
            'target_role': 'AI / RAG Systems Developer',
            'gap_skills': ['skill_rag', 'skill_py', 'skill_pytorch']
        })
        self.assertEqual(status, 200)
        self.assertEqual(res['status'], 'registered')
        self.assertEqual(res['user']['target_role'], 'AI / RAG Systems Developer')

    def test_mentor_use_case_endpoints(self):
        # Switch to Dr. Elena Rostova (Mentor)
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentor_elena'})

        # 1. Fetch Mentor Command Center Dashboard
        status, dash = simulate_request('GET', '/api/mentor/dashboard')
        self.assertEqual(status, 200)
        self.assertIn('profile', dash)
        self.assertIn('requests', dash)
        self.assertIn('sessions', dash)
        self.assertIn('mentees', dash)
        self.assertGreaterEqual(len(dash['requests']), 1)

        # 2. Update Weekly Office Hours & Declared Capacity
        new_slots = [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0]
        status_av, av_res = simulate_request('POST', '/api/mentor/update-availability', {
            'availability_slots': new_slots,
            'declared_capacity': 6,
            'headline': 'Principal AI Systems Researcher & RAG Architect'
        })
        self.assertEqual(status_av, 200)
        self.assertEqual(av_res['status'], 'updated')
        self.assertEqual(av_res['declared_capacity'], 6)

        # 3. Resolve Mentee Escalation & Auto-Index to RAG
        req_id = dash['requests'][0]['id']
        status_res, resolve_data = simulate_request('POST', '/api/mentor/resolve-request', {
            'request_id': req_id,
            'resolution_title': 'Custom CUDA Kernel PagedAttention Block Table Guide',
            'resolution_notes': 'Allocate contiguous KV cache block tables in vLLM WorkerEngine and map logical tokens via block_size=16.',
            'index_to_rag': True
        })
        self.assertEqual(status_res, 200)
        self.assertEqual(resolve_data['status'], 'resolved')
        self.assertTrue(resolve_data['indexed_to_rag'])

        # 4. Sign Off Mentee Milestone
        mentee_checklist = dash['mentees'][0]['checklist']
        target_item_id = mentee_checklist[0]['id']
        status_so, so_data = simulate_request('POST', '/api/mentor/signoff-milestone', {
            'item_id': target_item_id
        })
        self.assertEqual(status_so, 200)
        self.assertEqual(so_data['status'], 'updated')

        # 5. Save Mentor Session Action Plan & Engineering Notes
        sess_id = dash['sessions'][0]['id']
        status_note, note_data = simulate_request('POST', '/api/sessions/mentor-note', {
            'session_id': sess_id,
            'mentor_note': '1. Review rag_engine.py\n2. Run unit test suite before next sync'
        })
        self.assertEqual(status_note, 200)
        self.assertEqual(note_data['status'], 'updated')
        self.assertIn('[Mentor Action Plan & Notes]:', note_data['notes'])

        # Restore default mentee session
        simulate_request('POST', '/api/auth/switch-user', {'user_id': 'usr_mentee_alex'})

if __name__ == '__main__':
    unittest.main()


