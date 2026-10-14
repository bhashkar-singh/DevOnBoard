import re
import math
import time
from collections import Counter, defaultdict

class RagEngine:
    def __init__(self, lambda_weight=0.75, tau_threshold=0.37):
        self.lambda_weight = lambda_weight
        self.tau_threshold = tau_threshold
        self.passages = []  # list of dicts: {chunk_id, doc_id, project_id, section_title, text, words}
        self.vocab = set()
        self.df = Counter() # document frequency for words
        self.char4_df = Counter() # document frequency for char 4-grams
        self.num_passages = 0
        self.idf_cache = {}
        self.max_idf = 1.0

    def clear(self):
        self.passages = []
        self.vocab = set()
        self.df = Counter()
        self.char4_df = Counter()
        self.num_passages = 0
        self.idf_cache = {}
        self.max_idf = 1.0

    @staticmethod
    def tokenize_words(text):
        """Extract alphanumeric word tokens (lowercased)."""
        return re.findall(r'[a-zA-Z0-9_\-\.]+', text.lower())

    @staticmethod
    def extract_char_4grams(text):
        """Extract subword character 4-grams from text, absorbing flags & identifiers."""
        clean = re.sub(r'\s+', ' ', text.lower().strip())
        if len(clean) < 4:
            return [clean] if clean else []
        return [clean[i:i+4] for i in range(len(clean) - 3)]

    @staticmethod
    def segment_document(raw_text, target_words=110, overlap_words=25):
        """
        Segment uploaded documents at heading boundaries,
        then split into overlapping passages of ~110 words with 25-word overlap.
        (Paper Section III-B & Table I)
        """
        lines = raw_text.splitlines()
        sections = []
        current_heading = "General Overview"
        current_lines = []

        for line in lines:
            heading_match = re.match(r'^(#{1,4}\s+|[A-Z0-9\.\-\s]{3,}:|[0-9]+\.\s+)(.+)$', line.strip())
            if heading_match:
                if len(current_lines) > 0:
                    sections.append((current_heading, "\n".join(current_lines)))
                    current_lines = []
                current_heading = heading_match.group(2).strip()
            else:
                current_lines.append(line)
        if current_lines:
            sections.append((current_heading, "\n".join(current_lines)))

        chunks = []
        for heading, sec_text in sections:
            words = sec_text.split()
            if not words:
                continue
            if len(words) <= target_words + 15:
                chunks.append({
                    "section_title": heading,
                    "chunk_text": " ".join(words),
                    "word_count": len(words)
                })
            else:
                step = target_words - overlap_words
                start = 0
                while start < len(words):
                    end = min(start + target_words, len(words))
                    sub = words[start:end]
                    if sub:
                        chunks.append({
                            "section_title": heading,
                            "chunk_text": " ".join(sub),
                            "word_count": len(sub)
                        })
                    if end >= len(words):
                        break
                    start += step

        return chunks

    def build_index(self, passages_list):
        """
        Index passages across Character 4-gram and Word Lexical channels.
        passages_list: list of dicts with {chunk_id, doc_id, project_id, section_title, chunk_text}
        """
        self.clear()
        self.passages = passages_list
        self.num_passages = len(passages_list)

        for p in self.passages:
            text = p.get('chunk_text', '')
            words = self.tokenize_words(text)
            p['word_set'] = set(words)
            p['word_counts'] = Counter(words)
            p['char4_counts'] = Counter(self.extract_char_4grams(text))
            
            # Update vocabulary and document frequency
            for w in p['word_set']:
                self.vocab.add(w)
                self.df[w] += 1
            for g in set(p['char4_counts'].keys()):
                self.char4_df[g] += 1

        # Compute corpus IDFs
        N = max(1, self.num_passages)
        self.max_idf = 0.0
        for w, count in self.df.items():
            idf_val = math.log(1.0 + (N - count + 0.5) / (count + 0.5))
            idf_val = max(0.1, idf_val)
            self.idf_cache[w] = idf_val
            if idf_val > self.max_idf:
                self.max_idf = idf_val

        if self.max_idf == 0.0:
            self.max_idf = 1.0

        return {
            "num_passages": self.num_passages,
            "vocab_size": len(self.vocab),
            "char4_grams": len(self.char4_df),
            "max_idf": round(self.max_idf, 4)
        }

    def idf(self, term):
        """Return IDF for term if in vocabulary, otherwise idf_max (Paper Eq. 1)."""
        if term in self.idf_cache:
            return self.idf_cache[term]
        return self.max_idf

    def score_char4(self, query):
        """Subword char 4-gram index channel scoring (Table II top-performer)."""
        q_grams = self.extract_char_4grams(query)
        if not q_grams:
            return [0.0] * self.num_passages
        q_counts = Counter(q_grams)
        N = max(1, self.num_passages)
        
        scores = []
        for p in self.passages:
            score = 0.0
            p_counts = p.get('char4_counts', {})
            for g, count in q_counts.items():
                if g in p_counts:
                    # TF-IDF of char 4-grams
                    tf = 1 + math.log(p_counts[g])
                    df_val = self.char4_df.get(g, 1)
                    idf_val = math.log(1.0 + N / df_val)
                    score += tf * idf_val
            scores.append(score)
        return scores

    def score_lexical(self, query):
        """BM25-style word channel scoring."""
        q_words = self.tokenize_words(query)
        if not q_words:
            return [0.0] * self.num_passages
        
        avg_dl = sum(len(p.get('word_counts', {})) for p in self.passages) / max(1, self.num_passages)
        k1 = 1.5
        b = 0.75
        
        scores = []
        for p in self.passages:
            score = 0.0
            doc_len = len(p.get('word_counts', {}))
            w_counts = p.get('word_counts', {})
            for w in q_words:
                if w in w_counts:
                    tf = w_counts[w]
                    idf_val = self.idf(w)
                    denom = tf + k1 * (1 - b + b * (doc_len / avg_dl if avg_dl > 0 else 1.0))
                    score += idf_val * ((tf * (k1 + 1)) / max(0.001, denom))
            scores.append(score)
        return scores

    def retrieve_candidates(self, query, top_k=25):
        """
        Score against lexical and character 4-gram channels, fuse and rank.
        Returns sorted list of (score, passage_dict).
        """
        if not self.passages:
            return []

        c4_scores = self.score_char4(query)
        lex_scores = self.score_lexical(query)

        # Normalize channel scores
        max_c4 = max(c4_scores) if c4_scores and max(c4_scores) > 0 else 1.0
        max_lex = max(lex_scores) if lex_scores and max(lex_scores) > 0 else 1.0

        fused = []
        for i, p in enumerate(self.passages):
            norm_c4 = c4_scores[i] / max_c4
            norm_lex = lex_scores[i] / max_lex
            # Combined score favoring char 4-gram (as established in Section V-A)
            score = 0.65 * norm_c4 + 0.35 * norm_lex
            fused.append((score, p))

        fused.sort(key=lambda x: x[0], reverse=True)
        return fused[:top_k]

    def compute_coverage(self, query, top_passage):
        r"""
        Equation (1): Out-of-vocabulary-aware coverage statistic:
        cov(q, p) = sum_{t in T(q) \cap p} w(t) / sum_{t in T(q)} w(t)
        where w(t) = idf(t) if t in V, else idf_max.
        """
        q_terms = [t for t in self.tokenize_words(query) if len(t) > 1]
        if not q_terms:
            return 0.0, {"matched_terms": [], "oov_terms": [], "numerator": 0.0, "denominator": 1.0}

        p_words = top_passage.get('word_set', set())
        
        numerator = 0.0
        denominator = 0.0
        matched_terms = []
        oov_terms = []

        for t in q_terms:
            is_oov = t not in self.vocab
            w_t = self.max_idf if is_oov else self.idf(t)
            denominator += w_t
            if is_oov:
                oov_terms.append(t)
            elif t in p_words:
                numerator += w_t
                matched_terms.append((t, round(w_t, 3)))

        cov = numerator / denominator if denominator > 0 else 0.0
        return cov, {
            "matched_terms": matched_terms,
            "oov_terms": oov_terms,
            "numerator": round(numerator, 4),
            "denominator": round(denominator, 4),
            "in_vocab_count": len(q_terms) - len(oov_terms),
            "total_terms": len(q_terms)
        }

    def compute_margin(self, ranked_scores, eps=1e-5):
        """
        Equation (2): Distinctiveness margin:
        marg(q) = max(0, min(1, (s1 - s_bar) / (|s1| + eps)))
        where s_bar is the mean of ranks 6 to 25.
        """
        if not ranked_scores or ranked_scores[0] <= 0:
            return 0.0, 0.0

        s1 = ranked_scores[0]
        # ranks 6 to 25 (0-indexed 5 to 24)
        tail_slice = ranked_scores[5:25]
        if not tail_slice:
            tail_slice = ranked_scores[1:] if len(ranked_scores) > 1 else [0.0]

        s_bar = sum(tail_slice) / max(1, len(tail_slice))
        denom = abs(s1) + eps
        val = (s1 - s_bar) / denom
        marg = max(0.0, min(1.0, val))
        return marg, s_bar

    def test_evidence_gate(self, query):
        """
        Algorithm 1: Evidence Gate answerability test.
        Returns:
        {
           'passed': bool,
           'c_q': float,
           'cov': float,
           'marg': float,
           'threshold': float,
           'lambda': float,
           'top_passage': dict,
           'citations': list,
           'cov_details': dict,
           'ranked_candidates': list
        }
        """
        start_time = time.time()
        candidates = self.retrieve_candidates(query, top_k=25)
        
        if not candidates or candidates[0][0] <= 0.0001:
            q_words = [t for t in self.tokenize_words(query) if len(t) > 1]
            in_vocab = sum(1 for t in q_words if t in self.vocab)
            return {
                'passed': False,
                'c_q': 0.0,
                'cov': 0.0,
                'marg': 0.0,
                's1': 0.0,
                's_bar': 0.0,
                'threshold': self.tau_threshold,
                'lambda': self.lambda_weight,
                'decision': 'ABSTAIN_ESCALATED',
                'reason': 'No lexical or subword match found in corpus.',
                'top_passage': None,
                'citations': [],
                'cov_details': {
                    'matched_terms': [],
                    'oov_terms': [t for t in q_words if t not in self.vocab],
                    'in_vocab_count': in_vocab,
                    'total_terms': len(q_words)
                },
                'latency_ms': round((time.time() - start_time) * 1000, 2)
            }

        top_score, top_p = candidates[0]
        ranked_scores = [s for s, _ in candidates]

        cov, cov_details = self.compute_coverage(query, top_p)
        marg, s_bar = self.compute_margin(ranked_scores)

        # Combined confidence: c(q) = lambda * cov + (1 - lambda) * marg
        c_q = self.lambda_weight * cov + (1.0 - self.lambda_weight) * marg
        passed = (c_q >= self.tau_threshold)

        citations = []
        for s, p in candidates[:3]:
            if s > 0:
                citations.append({
                    'chunk_id': p.get('chunk_id'),
                    'doc_id': p.get('doc_id'),
                    'section_title': p.get('section_title', 'General'),
                    'text_snippet': p.get('chunk_text', '')[:220] + '...',
                    'score': round(s, 4)
                })

        safe_top_p = {
            'chunk_id': top_p.get('chunk_id'),
            'doc_id': top_p.get('doc_id'),
            'project_id': top_p.get('project_id'),
            'section_title': top_p.get('section_title'),
            'chunk_text': top_p.get('chunk_text'),
            'word_count': top_p.get('word_count')
        } if top_p else None

        return {
            'passed': passed,
            'decision': 'ACCEPTED' if passed else 'ABSTAIN_ESCALATED',
            'c_q': round(c_q, 4),
            'cov': round(cov, 4),
            'marg': round(marg, 4),
            's1': round(top_score, 4),
            's_bar': round(s_bar, 4),
            'threshold': self.tau_threshold,
            'lambda': self.lambda_weight,
            'top_passage': safe_top_p,
            'citations': citations,
            'cov_details': cov_details,
            'latency_ms': round((time.time() - start_time) * 1000, 2)
        }

    def generate_grounded_answer(self, query, gate_result):
        """
        Generate answer strictly grounded in retrieved passage text.
        (REQ-AM-1 to REQ-AM-4)
        """
        if not gate_result['passed']:
            return {
                'answer': (
                    f"**Evidence Gate Abstention Notice** (c(q) = {gate_result['c_q']} < τ = {self.tau_threshold})\n\n"
                    f"The project documentation does not provide sufficient empirical evidence to authoritatively answer: "
                    f"*{query}*.\n\n"
                    f"• **Coverage**: {gate_result['cov'] * 100:.1f}%\n"
                    f"• **Distinctiveness Margin**: {gate_result['marg']:.3f}\n"
                    f"• **OOV / Unindexed Terms**: {', '.join(gate_result['cov_details'].get('oov_terms', [])) or 'None'}\n\n"
                    f"To protect you from hallucinations or ungrounded instructions, this inquiry has been **automatically escalated to a human mentor** via our Load-Aware Matcher (XMM)."
                ),
                'grounded': False,
                'escalated': True,
                'citations': []
            }

        top_p = gate_result['top_passage']
        sec = top_p.get('section_title', 'Documentation')
        text = top_p.get('chunk_text', '')

        # Synthesize clear, well-structured developer answer with quotes
        answer_text = (
            f"### Verified Onboarding Guidance: {sec}\n\n"
            f"Based on the project's official contributor documentation:\n\n"
            f"> \"{text}\"\n\n"
            f"**Key Implementation Directives:**\n"
        )

        # Highlight commands or file references if present
        commands = re.findall(r'(`[^`]+`|\b(?:git|docker|pip|npm|make|cargo|pytest|python|bash)\b[^\.\n]+)', text)
        if commands:
            answer_text += "• **Executable Commands & Configuration**:\n"
            for cmd in commands[:4]:
                clean_cmd = cmd.strip('`').strip()
                if len(clean_cmd) > 3:
                    answer_text += f"  - `{clean_cmd}`\n"
        else:
            answer_text += f"• Follow the procedures outlined under `{sec}` for project architecture compliance.\n"

        answer_text += (
            f"\n---\n"
            f"🛡️ *Grounded by Evidence Gate* (Confidence $c(q) = {gate_result['c_q']}$ ≥ $\\tau = {self.tau_threshold}$, "
            f"Coverage: {gate_result['cov'] * 100:.1f}%, Margin: {gate_result['marg']:.3f})"
        )

        return {
            'answer': answer_text,
            'grounded': True,
            'escalated': False,
            'citations': gate_result['citations']
        }
