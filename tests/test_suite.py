import unittest
import json
from backend.rag_engine import RagEngine
from backend.xmm_matcher import XmmMatcher
from backend.database import get_connection, init_db
from backend.seed_data import seed_database

class TestDevOnboardSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_database()
        cls.rag = RagEngine(lambda_weight=0.75, tau_threshold=0.37)
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT chunk_id, doc_id, project_id, chunk_index, section_title, chunk_text, word_count FROM document_chunks")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        cls.rag.build_index(rows)
        cls.matcher = XmmMatcher(beta=(0.42, 0.22, 0.18, 0.12, 0.30))

    def test_document_segmentation(self):
        text = "# Section 1\n" + ("word " * 150) + "\n# Section 2\n" + ("code " * 80)
        chunks = RagEngine.segment_document(text, target_words=110, overlap_words=25)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertEqual(chunks[0]['section_title'], 'Section 1')

    def test_evidence_gate_in_scope_accepted(self):
        # In-scope query from DevOnboard spec
        query = "How does the evidence gate calculate coverage statistic cov(q, p)?"
        res = self.rag.test_evidence_gate(query)
        self.assertTrue(res['passed'], f"Expected query to pass gate, got c(q)={res['c_q']}")
        self.assertGreaterEqual(res['c_q'], 0.37)
        self.assertEqual(res['decision'], 'ACCEPTED')
        self.assertGreater(len(res['citations']), 0)

    def test_evidence_gate_far_oos_rejected(self):
        # Far probe: bakery / culinary query
        query = "How do I bake an authentic sourdough loaf at home with yeast?"
        res = self.rag.test_evidence_gate(query)
        self.assertFalse(res['passed'], f"Expected OOS query to be rejected, got c(q)={res['c_q']}")
        self.assertEqual(res['decision'], 'ABSTAIN_ESCALATED')

    def test_evidence_gate_hard_oos_rejected(self):
        # Hard probe: borrows 'install', 'configure', 'build' from absent Ruby on Rails ecosystem
        query = "How to install Bundler gems and configure Rails ActiveRecord database.yml?"
        res = self.rag.test_evidence_gate(query)
        self.assertFalse(res['passed'], f"Hard probe with absent ecosystem terms should be rejected, got c(q)={res['c_q']}")
        self.assertEqual(res['decision'], 'ABSTAIN_ESCALATED')

    def test_xmm_math_terms(self):
        mentee_gaps = ["skill_rag", "skill_vector"]
        mentee_slots = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0] # 4 slots

        mentor = {
            'user_id': 'm1',
            'name': 'Test Mentor',
            'skills': {'skill_rag': 1.0, 'skill_vector': 0.8},
            'availability_slots': [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], # 3 overlaps
            'session_count': 15,
            'mean_rating': 5.0,
            'responsiveness_prior': 0.90,
            'active_mentees': 2,
            'declared_capacity': 4
        }

        res = self.matcher.calculate_score(mentee_gaps, mentee_slots, mentor)
        # Check gap coverage: (1.0 + 0.8) / 2 = 0.9 * 0.42 = 0.378
        self.assertAlmostEqual(res['terms']['skill_gap'], 0.42 * 0.9, places=3)
        # Check load penalty: -0.30 * (2/4) = -0.15
        self.assertAlmostEqual(res['terms']['load_penalty'], -0.150, places=3)
        # Check Bayesian shrinkage: kappa = 15 / 20 = 0.75
        self.assertAlmostEqual(res['raw_stats']['kappa_m'], 0.75, places=2)
        # Total score should equal sum of all 5 terms
        terms_sum = sum(res['terms'].values())
        self.assertAlmostEqual(res['total_score'], terms_sum, places=3)

    def test_gini_coefficient_calculation(self):
        # Equal loads -> Gini 0
        self.assertEqual(XmmMatcher.compute_gini_coefficient([2, 2, 2, 2]), 0.0)
        # Unequal loads -> Gini > 0
        unequal = XmmMatcher.compute_gini_coefficient([0, 0, 1, 5])
        self.assertGreater(unequal, 0.4)

if __name__ == '__main__':
    unittest.main()
