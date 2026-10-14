import math
from typing import List, Dict, Any, Tuple

class XmmMatcher:
    """
    Explainable Load-Aware Mentor Matcher (XMM)
    Implements Paper Section III-C, Eq. (3) & Algorithm.
    Weights: beta = (0.42, 0.22, 0.18, 0.12, 0.30)
    """
    def __init__(self, beta=(0.42, 0.22, 0.18, 0.12, 0.30)):
        self.beta1 = beta[0]  # Skill-gap coverage weight
        self.beta2 = beta[1]  # Schedule overlap weight
        self.beta3 = beta[2]  # Confidence-weighted rating weight
        self.beta4 = beta[3]  # Responsiveness prior weight
        self.beta5 = beta[4]  # Load term penalty weight

    def set_load_weight(self, beta5: float):
        """Allow sweeping beta5 for Table V replication (0.0 to 1.0)."""
        self.beta5 = float(beta5)

    def calculate_score(
        self,
        mentee_gap_skills: List[str],
        mentee_avail_slots: List[int],
        mentor: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate S(e, m) for a single mentor candidate against mentee e.
        Returns total score and exact per-term additive contributions for explainability.
        """
        # 1. Skill Gap Coverage Term: beta1 * (g_e^T min(x_m, 1)) / ||g_e||_1
        mentor_skills = mentor.get('skills', {}) # dict of {skill_name: depth}
        num_gaps = len(mentee_gap_skills)
        covered_skills = []
        gap_cov_raw = 0.0

        if num_gaps > 0:
            matched_depth_sum = 0.0
            for skill in mentee_gap_skills:
                depth = float(mentor_skills.get(skill, 0.0))
                if depth > 0.0:
                    effective_depth = min(depth, 1.0)
                    matched_depth_sum += effective_depth
                    covered_skills.append({
                        'skill': skill,
                        'depth': depth
                    })
            gap_cov_raw = matched_depth_sum / float(num_gaps)
        else:
            gap_cov_raw = 1.0
        
        term1_gap = self.beta1 * gap_cov_raw

        # 2. Schedule Overlap Term: beta2 * (1 - exp(-0.9 * a_e^T a_m))
        mentor_avail = mentor.get('availability_slots', [0] * 14)
        if isinstance(mentor_avail, str):
            import json
            try:
                mentor_avail = json.loads(mentor_avail)
            except:
                mentor_avail = [0] * 14

        overlap_slots_count = 0
        shared_indices = []
        for idx in range(min(len(mentee_avail_slots), len(mentor_avail))):
            if mentee_avail_slots[idx] and mentor_avail[idx]:
                overlap_slots_count += 1
                shared_indices.append(idx)

        sched_raw = 1.0 - math.exp(-0.9 * overlap_slots_count)
        term2_sched = self.beta2 * sched_raw

        # 3. Confidence-Weighted Rating Term: beta3 * (kappa_m * r_m + (1 - kappa_m) * 0.5)
        # kappa_m = N_m / (N_m + 5)
        n_m = max(0, int(mentor.get('session_count', 0)))
        raw_rating = float(mentor.get('mean_rating', 4.5))
        # normalize rating from 1..5 to 0..1 scale
        r_m = max(0.0, min(1.0, (raw_rating - 1.0) / 4.0 if raw_rating > 1.0 else raw_rating / 5.0))
        
        kappa_m = float(n_m) / float(n_m + 5)
        shrunk_rating = kappa_m * r_m + (1.0 - kappa_m) * 0.5
        term3_rating = self.beta3 * shrunk_rating

        # 4. Responsiveness Prior Term: beta4 * rho_m
        rho_m = max(0.0, min(1.0, float(mentor.get('responsiveness_prior', 0.85))))
        term4_resp = self.beta4 * rho_m

        # 5. Load Penalty Term: - beta5 * (l_m / c)
        l_m = max(0, int(mentor.get('active_mentees', 0)))
        capacity = max(1, int(mentor.get('declared_capacity', 4)))
        load_ratio = float(l_m) / float(capacity)
        term5_load = -1.0 * self.beta5 * load_ratio

        # Total Additive Score
        total_score = term1_gap + term2_sched + term3_rating + term4_resp + term5_load

        # Human-Readable Explanation generation from the computation itself
        explanation_bullets = [
            f"Covers {len(covered_skills)} of {num_gaps} your target gap skills (+{term1_gap:.3f})",
            f"Shares {overlap_slots_count} active calendar slots with saturating fit (+{term2_sched:.3f})",
            f"Historical rating {raw_rating:.1f}★ across {n_m} sessions (shrinkage κ={kappa_m:.2f}, +{term3_rating:.3f})",
            f"Responsiveness prior score {int(rho_m * 100)}% (+{term4_resp:.3f})",
            f"Current load: {l_m}/{capacity} active mentees ({term5_load:.3f} penalty)"
        ]

        return {
            'mentor_id': mentor.get('user_id'),
            'name': mentor.get('name', 'Anonymous Mentor'),
            'avatar': mentor.get('avatar', ''),
            'headline': mentor.get('headline', 'Senior Contributor'),
            'bio': mentor.get('bio', ''),
            'availability_slots': mentor_avail,
            'skill_names': mentor.get('skill_names', []),
            'total_score': round(total_score, 4),
            'terms': {
                'skill_gap': round(term1_gap, 4),
                'schedule': round(term2_sched, 4),
                'rating': round(term3_rating, 4),
                'responsiveness': round(term4_resp, 4),
                'load_penalty': round(term5_load, 4)
            },
            'raw_stats': {
                'covered_skills_count': len(covered_skills),
                'total_gap_skills': num_gaps,
                'overlap_slots': overlap_slots_count,
                'shared_indices': shared_indices,
                'raw_rating': raw_rating,
                'session_count': n_m,
                'kappa_m': round(kappa_m, 3),
                'active_mentees': l_m,
                'declared_capacity': capacity,
                'load_ratio': round(load_ratio, 2),
                'responsiveness': rho_m
            },
            'covered_skills': covered_skills,
            'explanation_summary': f"Matches {len(covered_skills)}/{num_gaps} skills, {overlap_slots_count} slots, load {l_m}/{capacity}.",
            'explanation_bullets': explanation_bullets
        }

    def rank_mentors(
        self,
        mentee_gap_skills: List[str],
        mentee_avail_slots: List[int],
        mentor_list: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Rank mentor pool using XMM scoring."""
        scored = []
        for m in mentor_list:
            score_data = self.calculate_score(mentee_gap_skills, mentee_avail_slots, m)
            scored.append(score_data)

        scored.sort(key=lambda x: x['total_score'], reverse=True)
        return scored[:top_k]

    @staticmethod
    def compute_gini_coefficient(workloads: List[float]) -> float:
        """
        Compute Gini coefficient of mentor workloads (Paper Section IV-B & Table IV).
        Returns value in [0, 1], where 0 is perfect equality.
        """
        if not workloads or sum(workloads) == 0:
            return 0.0
        n = len(workloads)
        sorted_w = sorted(workloads)
        total = sum(sorted_w)
        
        cumulative = 0.0
        weighted_sum = 0.0
        for i, val in enumerate(sorted_w, 1):
            weighted_sum += i * val
            cumulative += val
            
        gini = (2.0 * weighted_sum) / (n * total) - (n + 1.0) / n
        return max(0.0, min(1.0, round(gini, 4)))
