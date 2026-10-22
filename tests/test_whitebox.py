"""
DevOnBoard - White Box Testing Suite (Structural & Code-Coverage Testing)
Focuses on internal logic, cyclomatic branch coverage, loop boundaries,
mathematical formulas (Algorithm 1, Eq. 1-3), and internal exception paths.

Techniques Applied:
  1. Statement & Branch Coverage (if/elif/else decision paths)
  2. Mathematical Precision & Boundary Testing (Gini, Bayesian Shrinkage, TF-IDF weights)
  3. Internal State & Mutation Invariants
  4. Cyclomatic Path Verification in Evidence Gate & Tokenizer
"""

import os
import sys
import math
import datetime
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.rag_engine import RagEngine
from backend.xmm_matcher import XmmMatcher
from backend.database import get_connection, init_db
from backend.seed_data import seed_database
from backend.app import compute_session_timing


class TestDevOnboardWhiteBox(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_database()
        cls.rag = RagEngine(lambda_weight=0.75, tau_threshold=0.37)
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT chunk_id, doc_id, project_id, chunk_index, section_title, chunk_text, word_count FROM document_chunks")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        cls.rag.build_index(rows)
        cls.matcher = XmmMatcher(beta=(0.42, 0.22, 0.18, 0.12, 0.30))

    # ================= 1. TOKENIZER & N-GRAM INTERNAL PATHS =================
    def test_wb_tokenizer_internal_branches(self):
        """White Box: Verify tokenize_words regex filtering, lowercasing, and empty string paths."""
        # Path 1: Normal string with punctuation and whitespace; keeps flags together
        tokens = self.rag.tokenize_words("Git Commit & Push --force-with-lease 123!")
        self.assertIn("git", tokens)
        self.assertIn("commit", tokens)
        self.assertIn("push", tokens)
        self.assertIn("--force-with-lease", tokens)

        # Path 2: Empty string or non-alphanumeric noise
        self.assertEqual(self.rag.tokenize_words(""), [])
        self.assertEqual(self.rag.tokenize_words("   \n\t  "), [])
        self.assertEqual(self.rag.tokenize_words("!@#$%^&*()"), [])

    def test_wb_char4_grams_loop_boundaries(self):
        """White Box: Verify extract_char_4grams window boundary for short (<4) and long strings."""
        # Empty string -> empty list
        self.assertEqual(self.rag.extract_char_4grams(""), [])

        # Short string (<4 chars) -> returns [clean] fallback
        self.assertEqual(self.rag.extract_char_4grams("py"), ["py"])
        self.assertEqual(self.rag.extract_char_4grams("rag"), ["rag"])

        # Exact boundary (4 chars) -> exactly 1 n-gram
        self.assertEqual(self.rag.extract_char_4grams("cuda"), ["cuda"])

        # Multi-char loop execution: len(s) - 3 n-grams
        sample = "pytorch"  # len 7 -> 7 - 3 = 4 n-grams: pyto, ytor, torc, orch
        grams = self.rag.extract_char_4grams(sample)
        self.assertEqual(len(grams), 4)
        self.assertEqual(grams, ["pyto", "ytor", "torc", "orch"])

    # ================= 2. DOCUMENT SEGMENTATION SLIDING WINDOW =================
    def test_wb_document_segmentation_overlap_math(self):
        """White Box: Verify sliding window word count, step size, and section title detection."""
        doc_text = """# Architecture Overview
This is a comprehensive overview of the internal services.
Here we describe how service alpha interacts with database beta.

# API Specifications
The endpoints follow standard REST conventions with JSON payloads.
All responses include status codes and error messages if applicable.
"""
        chunks = RagEngine.segment_document(doc_text, target_words=15, overlap_words=5)
        self.assertGreaterEqual(len(chunks), 2)
        # Verify first chunk captured heading title
        self.assertEqual(chunks[0]['section_title'], "Architecture Overview")
        # Verify word counts are within boundary bounds
        for ch in chunks:
            self.assertGreater(ch['word_count'], 0)
            self.assertIn('chunk_text', ch)

    # ================= 3. EVIDENCE GATE (ALGORITHM 1) BRANCH COVERAGE =================
    def test_wb_evidence_gate_empty_and_whitespace_query(self):
        """White Box: Verify early exit / fallback branch when query has zero valid tokens."""
        res = self.rag.test_evidence_gate("   \t  \n  ")
        self.assertFalse(res['passed'])
        self.assertEqual(res['decision'], 'ABSTAIN_ESCALATED')
        self.assertEqual(res['c_q'], 0.0)
        self.assertEqual(res['citations'], [])

    def test_wb_evidence_gate_confidence_formula(self):
        """White Box: Verify mathematical formula c(q) = lambda * cov + (1 - lambda) * marg."""
        query = "How do I configure evidence gate threshold and weights?"
        res = self.rag.test_evidence_gate(query)

        lam = self.rag.lambda_weight  # 0.75
        expected_cq = (lam * res['cov']) + ((1.0 - lam) * res['marg'])
        self.assertAlmostEqual(res['c_q'], expected_cq, places=4)

        # Verify acceptance threshold branch
        if res['c_q'] >= self.rag.tau_threshold:
            self.assertTrue(res['passed'])
            self.assertEqual(res['decision'], 'ACCEPTED')
        else:
            self.assertFalse(res['passed'])
            self.assertEqual(res['decision'], 'ABSTAIN_ESCALATED')

    def test_wb_evidence_gate_candidate_margin_computation(self):
        """White Box: Verify ranking margin s1 - s_bar logic."""
        query = "PyTorch build from source"
        res = self.rag.test_evidence_gate(query)
        # Margin must always be >= 0
        self.assertGreaterEqual(res['marg'], 0.0)
        self.assertLessEqual(res['marg'], 1.0)
        # Latency metric must be positive
        self.assertGreater(res['latency_ms'], 0.0)

    # ================= 4. XMM MATCHER MATHEMATICAL FORMULAS =================
    def test_wb_xmm_multi_objective_term_weights(self):
        """White Box: Verify exact 5-term weighting vector beta in XmmMatcher."""
        mentee_gaps = ["skill_rag", "skill_sqlite"]
        mentee_slots = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

        mentor = {
            'user_id': 'm_wb',
            'name': 'WhiteBox Mentor',
            'skills': {'skill_rag': 1.0, 'skill_sqlite': 0.5},
            'availability_slots': [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            'session_count': 10,
            'mean_rating': 4.5,
            'responsiveness_prior': 0.85,
            'active_mentees': 1,
            'declared_capacity': 5
        }

        eval_res = self.matcher.calculate_score(mentee_gaps, mentee_slots, mentor)

        # Term 1: Gap coverage = 0.42 * ((1.0 + 0.5) / 2) = 0.42 * 0.75 = 0.315
        self.assertAlmostEqual(eval_res['terms']['skill_gap'], 0.42 * 0.75, places=3)
        # Term 2: Saturating exponential schedule overlap = 0.22 * (1.0 - exp(-0.9 * 1))
        expected_sched = 0.22 * (1.0 - math.exp(-0.9 * 1))
        self.assertAlmostEqual(eval_res['terms']['schedule'], expected_sched, places=3)
        # Term 5: Load penalty = -0.30 * (1 / 5) = -0.060
        self.assertAlmostEqual(eval_res['terms']['load_penalty'], -0.060, places=3)

        # Invariant: Total score is exact sum of components
        self.assertAlmostEqual(eval_res['total_score'], sum(eval_res['terms'].values()), places=4)

    def test_wb_xmm_bayesian_shrinkage_extremes(self):
        """White Box: Test kappa_m = n / (n + 5) shrinkage at boundary extremes (n=0, n=5, n=1000)."""
        mentee_gaps = ["skill_python"]
        mentee_slots = [1] * 14

        # Boundary A: Zero sessions -> kappa_m must be 0.0 (fully shrunk to prior)
        mentor_zero = {
            'user_id': 'm0', 'name': 'New Mentor', 'skills': {'skill_python': 1.0},
            'availability_slots': [1] * 14, 'session_count': 0, 'mean_rating': 5.0,
            'responsiveness_prior': 0.8, 'active_mentees': 0, 'declared_capacity': 5
        }
        res_zero = self.matcher.calculate_score(mentee_gaps, mentee_slots, mentor_zero)
        self.assertEqual(res_zero['raw_stats']['kappa_m'], 0.0)

        # Boundary B: Equal to prior strength n0=5 -> kappa_m must be 0.50
        mentor_mid = dict(mentor_zero, session_count=5)
        res_mid = self.matcher.calculate_score(mentee_gaps, mentee_slots, mentor_mid)
        self.assertEqual(res_mid['raw_stats']['kappa_m'], 0.5)

        # Boundary C: Infinite sessions -> kappa_m approaches 1.0
        mentor_high = dict(mentor_zero, session_count=1000)
        res_high = self.matcher.calculate_score(mentee_gaps, mentee_slots, mentor_high)
        self.assertGreater(res_high['raw_stats']['kappa_m'], 0.99)

    def test_wb_gini_coefficient_edge_cases(self):
        """White Box: Test Gini coefficient mathematical properties and division-by-zero guards."""
        # Case 1: Empty or all-zero loads -> guard against zero-division returns 0.0
        self.assertEqual(XmmMatcher.compute_gini_coefficient([]), 0.0)
        self.assertEqual(XmmMatcher.compute_gini_coefficient([0, 0, 0, 0]), 0.0)

        # Case 2: Perfect equality -> 0.0
        self.assertEqual(XmmMatcher.compute_gini_coefficient([4, 4, 4, 4]), 0.0)

        # Case 3: Extreme inequality -> 1 person has all the work
        gini_extreme = XmmMatcher.compute_gini_coefficient([0, 0, 0, 100])
        # Theoretical Gini for [0, 0, 0, N] is (4 - 1)/4 = 0.75
        self.assertAlmostEqual(gini_extreme, 0.75, places=2)

    # ================= 5. SESSION TIMING LOGIC INTERNAL BRANCHES =================
    def test_wb_compute_session_timing_branches(self):
        """White Box: Verify compute_session_timing regex date parsing, 24h cancellation gate."""
        now = datetime.datetime.now()

        # Branch 1: Far future meeting (>48h)
        future_dt = now + datetime.timedelta(hours=48)
        future_str = future_dt.strftime('%A, %b %d, %Y (10:00 AM - 11:00 AM)')
        t1 = compute_session_timing(future_str, 'scheduled')
        self.assertTrue(t1['is_upcoming'])
        self.assertTrue(t1['can_cancel_24h'])
        self.assertTrue(t1['can_reschedule_24h'])
        self.assertFalse(t1['can_complete'])
        self.assertGreater(t1['hours_until_start'], 24.0)

        # Branch 2: Imminent meeting (<12h) -> CANNOT cancel or reschedule
        imminent_dt = now + datetime.timedelta(hours=6)
        imminent_str = imminent_dt.strftime('%A, %b %d, %Y (10:00 AM - 11:00 AM)')
        t2 = compute_session_timing(imminent_str, 'scheduled')
        self.assertTrue(t2['is_upcoming'])
        self.assertFalse(t2['can_cancel_24h'])
        self.assertFalse(t2['can_reschedule_24h'])

        # Branch 3: Already completed meeting
        t3 = compute_session_timing("Completed Session (Past Slot)", 'completed')
        self.assertFalse(t3['is_upcoming'])
        self.assertFalse(t3['can_cancel_24h'])


if __name__ == '__main__':
    unittest.main()
