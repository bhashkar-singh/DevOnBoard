import json
import uuid
from backend.database import get_connection, init_db
from backend.rag_engine import RagEngine

SKILLS_TAXONOMY = [
    # Languages
    ("skill_py", "Python", "Languages"),
    ("skill_go", "Go", "Languages"),
    ("skill_rust", "Rust", "Languages"),
    ("skill_ts", "TypeScript", "Languages"),
    ("skill_cpp", "C++", "Languages"),
    ("skill_bash", "Bash / Shell", "Languages"),
    # Web & Frameworks
    ("skill_react", "React", "Frameworks"),
    ("skill_fastapi", "FastAPI / REST", "Frameworks"),
    ("skill_node", "Node.js / Express", "Frameworks"),
    ("skill_django", "Django", "Frameworks"),
    ("skill_graphql", "GraphQL", "Frameworks"),
    ("skill_next", "Next.js", "Frameworks"),
    # Cloud & Systems
    ("skill_docker", "Docker", "Systems & Cloud"),
    ("skill_k8s", "Kubernetes", "Systems & Cloud"),
    ("skill_linux", "Linux Internals", "Systems & Cloud"),
    ("skill_tf", "Terraform", "Systems & Cloud"),
    ("skill_cicd", "CI/CD & GitHub Actions", "Systems & Cloud"),
    ("skill_git", "Git Internals & Rebasing", "Systems & Cloud"),
    # AI & Data
    ("skill_pytorch", "PyTorch", "AI & Data"),
    ("skill_rag", "LLM RAG & Grounding", "AI & Data"),
    ("skill_vector", "Vector Search & Embeddings", "AI & Data"),
    ("skill_cuda", "CUDA / GPU Acceleration", "AI & Data"),
    ("skill_transformers", "Transformers / HuggingFace", "AI & Data"),
    ("skill_sql", "PostgreSQL & pgvector", "AI & Data")
]

PROJECTS_DATA = [
    {
        "project_id": "proj_devonboard",
        "name": "DevOnboard Core",
        "slug": "devonboard-core",
        "description": "Evidence-gated grounding and load-aware mentor matching platform for newcomer developer onboarding.",
        "repo": "https://github.com/google/devonboard"
    },
    {
        "project_id": "proj_pytorch",
        "name": "PyTorch OSS Framework",
        "slug": "pytorch-oss",
        "description": "Deep learning tensor and dynamic neural network computation engine in C++ and Python.",
        "repo": "https://github.com/pytorch/pytorch"
    },
    {
        "project_id": "proj_kubernetes",
        "name": "Kubernetes Cloud Engine",
        "slug": "kubernetes-engine",
        "description": "Production-grade container orchestration system automating deployment, scaling, and management.",
        "repo": "https://github.com/kubernetes/kubernetes"
    }
]

DOCUMENTS_DATA = [
    {
        "doc_id": "doc_devonboard_srs",
        "project_id": "proj_devonboard",
        "filename": "DevOnboard_SRS_Architecture_v1.0.md",
        "raw_text": """# DevOnboard System Architecture and Evidence-Gated Grounding Specification

## 1. System Overview & Core Objectives
DevOnboard is an AI-based onboarding and mentoring platform designed to accelerate newcomer developer productivity.
Newcomers to a software project consistently lose their first weeks struggling with unfamiliar codebases, environment setup,
and difficulty reaching an experienced contributor with time to help.
DevOnboard solves this with two foundational mechanisms: an Evidence Gate for document question answering,
and an Explainable Load-Aware Mentor Matcher (XMM).

## 2. Evidence-Gated Grounding Pipeline
Uploaded contributor documentation is segmented at heading boundaries and split into overlapping passages of approximately 110 words
with a 25-word overlap. A question is scored against lexical channels including character 4-gram and BM25 indices.
Before any LLM response is composed, the Evidence Gate decides whether the corpus actually supports the question.
The decision is made by combining two statistics:
1. Coverage statistic cov(q, p): sum_{t in T(q) cap p} w(t) / sum_{t in T(q)} w(t), where w(t) = idf(t) for terms in vocabulary V, and idf_max for out-of-vocabulary terms.
Out-of-vocabulary terms enter the denominator at maximum weight, so queries regarding absent technologies push coverage down by construction.
2. Distinctiveness margin marg(q): max(0, min(1, (s1 - s_bar)/(|s1| + eps))), where s1 is top score and s_bar is the mean of ranks 6 to 25.
The combined confidence is computed as c(q) = lambda * cov + (1 - lambda) * marg with lambda = 0.75.
If c(q) >= tau (default threshold tau = 0.37), the system returns the grounded answer with citations.
If c(q) < tau, the system abstains from generating text and automatically escalates the inquiry to mentor matching.

## 3. Explainable Load-Aware Mentor Matching (XMM)
When a newcomer needs 1-on-1 human guidance, XMM computes an additive match score across five transparent terms:
S(e, m) = beta1 * (g_e^T min(x_m, 1) / ||g_e||_1) + beta2 * (1 - exp(-0.9 * a_e^T a_m)) + beta3 * (kappa_m * r_m + (1 - kappa_m) * 0.5) + beta4 * rho_m - beta5 * (l_m / c).
Here beta = (0.42, 0.22, 0.18, 0.12, 0.30).
g_e is the mentee's skill gap vector, x_m is the mentor's self-declared depth, a_e and a_m are weekly availability vectors over 14 slots.
kappa_m = N_m / (N_m + 5) is a Bayesian shrinkage factor pulling historical rating r_m toward neutral prior 0.5 when session count N_m is small.
l_m is active mentees and c is declared capacity.
The load penalty term prevents mentor burnout and reduces the Gini coefficient of mentor workload from 0.249 to 0.144 (a 42% reduction in concentration) for only a 0.7% cost in realized match value.

## 4. Session Booking & Google Calendar Integration
Mentees can book available time slots directly from ranked mentor cards.
The system automatically generates a synced Google Calendar event and Google Meet video link (e.g. meet.google.com/dev-onbd-mtg).
Upon session completion, the mentee submits a 1-5 star rating and review, dynamically updating the mentor's r_m and N_m parameters.

## 5. Developer Community Forum & Project Workspace
The platform provides project-scoped asynchronous discussion channels organized by tags: Setup & Environment, Architecture, First PRs, and Tooling.
Admins can upload, inspect, and re-index project documentation, manage member access, and monitor the append-only audit trail.

## 6. Local Setup and Environment Instructions
To run the DevOnboard local development server:
1. Ensure Python 3.12+ is installed.
2. Start the backend service using `python3 backend/app.py --port 8000`.
3. Open `http://localhost:8000` in Chrome, Firefox, or Safari.
4. Database is automatically stored in `data/devonboard.db`.
All audit records are saved to the relational store with passage retrieval latency and evidence gate statistics."""
    },
    {
        "doc_id": "doc_pytorch_guide",
        "project_id": "proj_pytorch",
        "filename": "PyTorch_Contributor_Onboarding_Guide.md",
        "raw_text": """# PyTorch Contributor Quickstart and Build Guide

## 1. Prerequisites and Toolchain Setup
To build PyTorch from source, ensure you have Git, CMake 3.18+, Ninja build system, and Python 3.9-3.12.
Clone the repository recursively to fetch submodules:
`git clone --recursive https://github.com/pytorch/pytorch`
If you already cloned without submodules, run:
`git submodule sync && git submodule update --init --recursive --jobs 0`

## 2. Virtual Environment and Dependencies
Create an isolated environment using conda or venv:
`python3 -m venv ~/pytorch-dev-env`
`source ~/pytorch-dev-env/bin/activate`
Install required dependencies:
`pip install -r requirements.txt`
Install development tools:
`pip install cmake ninja pytest flake8 mypy`

## 3. Compiling PyTorch with Ninja
For fast incremental builds on macOS and Linux:
`export CMAKE_PREFIX_PATH=${CONDA_PREFIX:-"$(dirname $(which conda))/../"}`
`export USE_CUDA=0` for CPU-only builds, or `export USE_CUDA=1` if NVIDIA CUDA Toolkit 12.x and cuDNN are installed.
`export BUILD_TEST=0` to speed up initial compilation.
Run setup:
`python setup.py develop`
Ninja will automatically utilize all CPU cores. Compilation takes 8-15 minutes on modern multicore systems.

## 4. Running PyTorch Test Suite
Verify your build by running tensor tests:
`pytest test/test_torch.py -k test_add`
To run specific neural network operator tests:
`pytest test/test_nn.py -v`
If you modify C++ files under `torch/csrc`, simply re-run `python setup.py develop` for incremental compilation.

## 5. Submitting Your First Pull Request
Before creating a pull request:
1. Ensure code adheres to black and flake8 guidelines: `flake8 torch/`
2. Run type checking: `mypy --config-file mypy.ini`
3. Create a branch: `git checkout -b fix/tensor-broadcasting-bug`
4. Commit with conventional commit messages and sign your commit."""
    },
    {
        "doc_id": "doc_kubernetes_guide",
        "project_id": "proj_kubernetes",
        "filename": "Kubernetes_Developer_Handbook.md",
        "raw_text": """# Kubernetes Developer and Contributor Handbook

## 1. Setting Up Kubernetes Development Environment
Kubernetes requires Go version 1.22+, Docker or Podman, and the `kind` (Kubernetes in Docker) tool.
Set your GOPATH and clone Kubernetes:
`mkdir -p $GOPATH/src/k8s.io && cd $GOPATH/src/k8s.io`
`git clone https://github.com/kubernetes/kubernetes.git`
`cd kubernetes`

## 2. Building Kubernetes Binaries
Kubernetes uses Makefiles and wrapper build scripts:
To build kubectl CLI:
`make WHAT=cmd/kubectl`
To build kubelet and kube-apiserver:
`make WHAT=cmd/kube-apiserver WHAT=cmd/kubelet`
Binaries will be placed in `_output/bin/`.

## 3. Creating a Local Cluster with Kind
Use kind to spin up a local development cluster using your freshly built image:
`kind build node-image`
`kind create cluster --image kindest/node:latest`
Verify cluster health:
`kubectl cluster-info`
`kubectl get nodes`

## 4. Unit and Integration Testing
Run unit tests for a specific package:
`go test -v ./pkg/controller/deployment/...`
Run all unit tests with timeout:
`make test`
For integration tests requiring etcd:
`make test-integration`

## 5. Kubernetes PR and Review Process
Join the relevant Special Interest Group (e.g. SIG-Architecture, SIG-Node, SIG-CLI).
All pull requests must follow the Kubernetes Enhancement Proposal (KEP) process for major features.
Test your PR with `make verify` to ensure generated deepcopy code and openapi specs are up to date."""
    }
]

BENCHMARK_PROBES = [
    # IN-SCOPE PROBES
    {"tier": "in-scope", "query": "How do I configure the evidence gate threshold and weights?", "expected": "accept"},
    {"tier": "in-scope", "query": "What is the formula for XMM mentor matching and load penalty?", "expected": "accept"},
    {"tier": "in-scope", "query": "How do I build PyTorch from source using Ninja and setup.py?", "expected": "accept"},
    {"tier": "in-scope", "query": "What command builds the kubectl binary in Kubernetes?", "expected": "accept"},
    {"tier": "in-scope", "query": "How does DevOnboard integrate with Google Calendar and Meet?", "expected": "accept"},
    {"tier": "in-scope", "query": "How to create a local Kubernetes cluster with kind?", "expected": "accept"},
    {"tier": "in-scope", "query": "How do I run PyTorch tests with pytest test_torch.py?", "expected": "accept"},
    # OUT-OF-SCOPE: FAR (unrelated to software engineering)
    {"tier": "far", "query": "What is the capital city of France?", "expected": "reject"},
    {"tier": "far", "query": "How do I bake an authentic sourdough loaf at home?", "expected": "reject"},
    {"tier": "far", "query": "Explain quantum entanglement and Bell inequalities in astrophysics", "expected": "reject"},
    {"tier": "far", "query": "What are the rules of Olympic archery competitions?", "expected": "reject"},
    # OUT-OF-SCOPE: NEAR (absent engineering & enterprise technologies)
    {"tier": "near", "query": "How to configure BGP routing and autonomous system numbers on Cisco IOS?", "expected": "reject"},
    {"tier": "near", "query": "How to synthesize FPGA Verilog hardware description on Xilinx Vivado?", "expected": "reject"},
    {"tier": "near", "query": "How to deploy Apache Kafka multi-broker cluster on FreeBSD ZFS?", "expected": "reject"},
    {"tier": "near", "query": "Configuring Siemens PLC ladder logic with Profibus industrial automation", "expected": "reject"},
    # OUT-OF-SCOPE: HARD (software tooling in absent ecosystems - borrowing words like 'install', 'build', 'configure')
    {"tier": "hard", "query": "How do I install Bundler gems and configure Rails ActiveRecord database.yml?", "expected": "reject"},
    {"tier": "hard", "query": "How to build an iOS Swift application using CocoaPods and Xcode workspace?", "expected": "reject"},
    {"tier": "hard", "query": "How to install WordPress PHP plugins and configure wp-config.php on Apache?", "expected": "reject"},
    {"tier": "hard", "query": "How to compile C# ASP.NET Core project with MSBuild and NuGet packages?", "expected": "reject"}
]

USERS_DATA = [
    {
        "user_id": "usr_mentee_alex",
        "name": "Alex Rivera",
        "email": "alex.rivera@devonboard.internal",
        "role": "mentee",
        "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        "bio": "Newcomer software engineer joining the core team. Enthusiastic about RAG architectures, distributed systems, and open-source contribution.",
        "gaps": ["skill_rag", "skill_vector", "skill_docker", "skill_react", "skill_k8s"],
        "avail": [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0], # 7 days x 2 slots (AM/PM)
        "readiness": 52
    },
    {
        "user_id": "usr_mentor_elena",
        "name": "Dr. Elena Rostova",
        "email": "elena.rostova@devonboard.internal",
        "role": "mentor",
        "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
        "bio": "Principal AI Systems Researcher & Founding Contributor. Specializes in subword retrieval, mathematical evidence gating, and neural search.",
        "skills": {
            "skill_rag": 1.0,
            "skill_vector": 1.0,
            "skill_pytorch": 0.95,
            "skill_py": 1.0,
            "skill_docker": 0.85,
            "skill_sql": 0.90
        },
        "avail": [1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0],
        "capacity": 4,
        "active_mentees": 1,
        "mean_rating": 4.95,
        "session_count": 28,
        "responsiveness": 0.96,
        "headline": "Principal AI Systems Researcher & Gate Designer"
    },
    {
        "user_id": "usr_mentor_david",
        "name": "David Chen",
        "email": "david.chen@devonboard.internal",
        "role": "mentor",
        "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
        "bio": "Staff Cloud Infrastructure Architect. Kubernetes contributor and container systems lead.",
        "skills": {
            "skill_k8s": 1.0,
            "skill_docker": 1.0,
            "skill_go": 0.95,
            "skill_linux": 0.90,
            "skill_cicd": 0.95,
            "skill_tf": 0.85
        },
        "avail": [0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1],
        "capacity": 4,
        "active_mentees": 3, # heavier load: should be penalised under beta5!
        "mean_rating": 4.85,
        "session_count": 22,
        "responsiveness": 0.91,
        "headline": "Staff Cloud Infrastructure Architect"
    },
    {
        "user_id": "usr_mentor_sarah",
        "name": "Sarah Jenkins",
        "email": "sarah.jenkins@devonboard.internal",
        "role": "mentor",
        "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
        "bio": "Senior Full-Stack Lead. Passionate about interactive frontends, React performance, and REST API standards.",
        "skills": {
            "skill_react": 1.0,
            "skill_ts": 1.0,
            "skill_fastapi": 0.90,
            "skill_node": 0.95,
            "skill_next": 0.90,
            "skill_docker": 0.70
        },
        "avail": [1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1],
        "capacity": 3,
        "active_mentees": 1,
        "mean_rating": 4.75,
        "session_count": 14,
        "responsiveness": 0.89,
        "headline": "Senior Full-Stack & UI/UX Systems Lead"
    },
    {
        "user_id": "usr_mentor_raj",
        "name": "Rajesh Patel",
        "email": "rajesh.patel@devonboard.internal",
        "role": "mentor",
        "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
        "bio": "Systems Performance Engineer. Low-level C++, Rust, and CUDA accelerator hacker.",
        "skills": {
            "skill_cpp": 1.0,
            "skill_rust": 0.95,
            "skill_cuda": 0.90,
            "skill_linux": 0.95,
            "skill_git": 0.90
        },
        "avail": [0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0],
        "capacity": 4,
        "active_mentees": 0, # zero load: ideal capacity!
        "mean_rating": 4.60,
        "session_count": 6,
        "responsiveness": 0.84,
        "headline": "High-Performance Systems & CUDA Specialist"
    },
    {
        "user_id": "usr_admin_marcus",
        "name": "Marcus Vance",
        "email": "marcus.vance@devonboard.internal",
        "role": "admin",
        "avatar": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
        "bio": "Head of Developer Experience & Project Administrator. Oversees onboarding quality and mentor fairness.",
        "headline": "Project Administrator & Platform Lead"
    }
]

FORUM_POSTS_DATA = [
    {
        "post_id": "post_1",
        "project_id": "proj_devonboard",
        "author_id": "usr_mentee_alex",
        "title": "Welcome & question about running local tests on macOS M-series",
        "content": "Hi everyone! Just joined the DevOnboard workspace. Is there anything specific to know about building the C-extensions and 4-gram index on Apple Silicon?",
        "category": "setup",
        "upvotes": 5,
        "replies": [
            {
                "post_id": "post_1_rep_1",
                "author_id": "usr_mentor_elena",
                "content": "Welcome Alex! The character 4-gram index runs purely in native Python / SQLite FTS5 without proprietary C-toolchain dependencies. It executes sub-millisecond on M-series chips!",
                "upvotes": 8
            }
        ]
    },
    {
        "post_id": "post_2",
        "project_id": "proj_devonboard",
        "author_id": "usr_mentor_david",
        "title": "Best practices for containerized staging deployment",
        "content": "We have updated the Docker compose configuration to mount sqlite volume safely with WAL mode enabled. Check PR #42 for details.",
        "category": "architecture",
        "upvotes": 7,
        "replies": []
    },
    {
        "post_id": "post_3",
        "project_id": "proj_pytorch",
        "author_id": "usr_mentee_alex",
        "title": "Ninja build failing with missing CMake submodules",
        "content": "Make sure you run `git submodule update --init --recursive` before running `python setup.py develop`!",
        "category": "first-pr",
        "upvotes": 12,
        "replies": []
    }
]

CHECKLIST_DATA = [
    {"key": "clone_repo", "cat": "environment", "title": "Clone repository and submodules", "completed": 1},
    {"key": "setup_venv", "cat": "environment", "title": "Configure virtual environment & dependencies", "completed": 1},
    {"key": "first_rag_query", "cat": "knowledge", "title": "Ask AI Mentor a grounded documentation question", "completed": 1},
    {"key": "test_evidence_gate", "cat": "knowledge", "title": "Observe Evidence Gate response and confidence statistics", "completed": 0},
    {"key": "match_mentor", "cat": "mentorship", "title": "Run XMM matching and inspect explainable score decomposition", "completed": 1},
    {"key": "book_session", "cat": "mentorship", "title": "Book a 1-on-1 session with matched mentor via Google Meet", "completed": 1},
    {"key": "first_pr", "cat": "contribution", "title": "Submit first onboarding issue or documentation fix", "completed": 0}
]

def seed_database():
    init_db()
    conn = get_connection()
    c = conn.cursor()

    # Clear existing data for fresh reproducible seed
    tables = [
        "onboarding_checklists", "audit_log", "forum_posts", "sessions", 
        "skill_requests", "mentee_profiles", "mentor_profiles", "user_skills", 
        "skills", "document_chunks", "documents", "project_members", "projects", "users"
    ]
    for tbl in tables:
        c.execute(f"DELETE FROM {tbl}")
    try:
        c.execute("DELETE FROM chunk_fts")
    except:
        pass

    # 1. Insert Skills
    for s_id, s_name, s_cat in SKILLS_TAXONOMY:
        c.execute("INSERT INTO skills (skill_id, skill_name, category) VALUES (?, ?, ?)", (s_id, s_name, s_cat))

    # 2. Insert Users & Profiles
    for u in USERS_DATA:
        c.execute("""
        INSERT INTO users (user_id, name, email, role, avatar, bio)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (u['user_id'], u['name'], u['email'], u['role'], u['avatar'], u['bio']))

        if u['role'] == 'mentor':
            c.execute("""
            INSERT INTO mentor_profiles 
            (user_id, declared_capacity, active_mentees, responsiveness_prior, mean_rating, session_count, availability_slots, headline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                u['user_id'], u['capacity'], u['active_mentees'], u['responsiveness'], 
                u['mean_rating'], u['session_count'], json.dumps(u['avail']), u.get('headline', '')
            ))
            # Insert mentor skills
            for s_name_or_id, depth in u.get('skills', {}).items():
                c.execute("""
                INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_teaching)
                VALUES (?, ?, ?, ?, 1)
                """, (f"usk_{uuid.uuid4().hex[:8]}", u['user_id'], s_name_or_id, depth))

        elif u['role'] == 'mentee':
            c.execute("""
            INSERT INTO mentee_profiles (user_id, availability_slots, readiness_score, target_role, current_step)
            VALUES (?, ?, ?, ?, ?)
            """, (u['user_id'], json.dumps(u['avail']), u['readiness'], "Full-Stack AI Contributor", "Environment & RAG Orientation"))
            # Insert mentee gap skills
            for s_id in u.get('gaps', []):
                c.execute("""
                INSERT INTO user_skills (user_skill_id, user_id, skill_id, depth, is_gap)
                VALUES (?, ?, ?, 0.0, 1)
                """, (f"usk_{uuid.uuid4().hex[:8]}", u['user_id'], s_id))

    # 3. Insert Projects
    for p in PROJECTS_DATA:
        c.execute("""
        INSERT INTO projects (project_id, name, slug, description, admin_id, repository_url)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (p['project_id'], p['name'], p['slug'], p['description'], "usr_admin_marcus", p['repo']))

        # Add all users as project members
        for u in USERS_DATA:
            c.execute("""
            INSERT INTO project_members (membership_id, project_id, user_id, project_role)
            VALUES (?, ?, ?, ?)
            """, (f"pm_{uuid.uuid4().hex[:8]}", p['project_id'], u['user_id'], u['role']))

    # 4. Insert Documents & Segment into Passages
    all_chunks_for_index = []
    for doc in DOCUMENTS_DATA:
        c.execute("""
        INSERT INTO documents (doc_id, project_id, filename, raw_text, uploaded_by)
        VALUES (?, ?, ?, ?, ?)
        """, (doc['doc_id'], doc['project_id'], doc['filename'], doc['raw_text'], "usr_admin_marcus"))

        chunks = RagEngine.segment_document(doc['raw_text'], target_words=110, overlap_words=25)
        for idx, chk in enumerate(chunks):
            chunk_id = f"chk_{doc['doc_id']}_{idx}"
            c.execute("""
            INSERT INTO document_chunks (chunk_id, doc_id, project_id, chunk_index, section_title, chunk_text, word_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (chunk_id, doc['doc_id'], doc['project_id'], idx, chk['section_title'], chk['chunk_text'], chk['word_count']))

            try:
                c.execute("""
                INSERT INTO chunk_fts (chunk_id, doc_id, project_id, section_title, chunk_text)
                VALUES (?, ?, ?, ?, ?)
                """, (chunk_id, doc['doc_id'], doc['project_id'], chk['section_title'], chk['chunk_text']))
            except:
                pass

            all_chunks_for_index.append({
                'chunk_id': chunk_id,
                'doc_id': doc['doc_id'],
                'project_id': doc['project_id'],
                'section_title': chk['section_title'],
                'chunk_text': chk['chunk_text']
            })

    # 5. Insert Sample Sessions (REQ-SB-1 to 5)
    c.execute("""
    INSERT INTO sessions (session_id, mentee_id, mentor_id, project_id, topic, scheduled_time, slot_idx, status, calendar_event_id, meet_link, rating, review_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "sess_1", "usr_mentee_alex", "usr_mentor_elena", "proj_devonboard",
        "Evidence Gate & Subword Character 4-gram Walkthrough",
        "Thursday, Oct 15, 2026 (10:00 AM - 11:00 AM)", 6, "scheduled", "cal_evt_99812",
        "https://meet.google.com/dev-onbd-mtg", None, None
    ))
    c.execute("""
    INSERT INTO sessions (session_id, mentee_id, mentor_id, project_id, topic, scheduled_time, slot_idx, status, calendar_event_id, meet_link, rating, review_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "sess_past_1", "usr_mentee_alex", "usr_mentor_sarah", "proj_devonboard",
        "React Component Architecture & State Machine Review",
        "Friday, Oct 9, 2026 (02:00 PM - 03:00 PM)", 9, "completed", "cal_evt_88721",
        "https://meet.google.com/dev-react-rev", 5.0,
        "Super helpful session! Sarah clarified our glassmorphism UI token architecture and event buses perfectly."
    ))

    # 6. Insert Skill Requests & AI Escalations (REQ-SM-2)
    c.execute("""
    INSERT INTO skill_requests (request_id, mentee_id, project_id, skill_name, topic, urgency, status, matched_mentor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "req_1", "usr_mentee_alex", "proj_devonboard", "LLM RAG & Grounding",
        "I added a new guide to the project docs, but the AI search isn't finding it yet. How do I refresh the search index?",
        "high", "matched", "usr_mentor_elena"
    ))
    c.execute("""
    INSERT INTO skill_requests (request_id, mentee_id, project_id, skill_name, topic, urgency, status, matched_mentor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "req_2", "usr_mentee_alex", "proj_devonboard", "Docker & CI/CD",
        "When I start the app with Docker, port 8000 says 'address already in use'. How do I fix this?",
        "medium", "open", "usr_mentor_david"
    ))

    # 7. Insert Forum Posts (REQ-FR-1 to 5)
    for p in FORUM_POSTS_DATA:
        c.execute("""
        INSERT INTO forum_posts (post_id, project_id, author_id, title, content, category, upvotes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (p['post_id'], p['project_id'], p['author_id'], p['title'], p['content'], p['category'], p['upvotes']))
        for rep in p.get('replies', []):
            c.execute("""
            INSERT INTO forum_posts (post_id, project_id, author_id, title, content, category, parent_post_id, upvotes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (rep['post_id'], p['project_id'], rep['author_id'], None, rep['content'], p['category'], p['post_id'], rep['upvotes']))

    # 8. Insert Onboarding Checklist
    for item in CHECKLIST_DATA:
        c.execute("""
        INSERT INTO onboarding_checklists (item_id, user_id, project_id, category, task_title, completed)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (f"chk_{item['key']}", "usr_mentee_alex", "proj_devonboard", item['cat'], item['title'], item['completed']))

    # 9. Insert Initial Audit Log Entries (Section III-A)
    c.execute("""
    INSERT INTO audit_log (log_id, query, project_id, user_id, top_chunk_id, cov_score, marg_score, combined_conf, threshold, gate_decision, answer_preview, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "audit_seed_1", "How do I build PyTorch from source using Ninja?", "proj_pytorch", "usr_mentee_alex",
        "chk_doc_pytorch_guide_2", 0.942, 0.812, 0.909, 0.37, "ACCEPTED",
        "Run `python setup.py develop` after configuring CMAKE_PREFIX_PATH...", 1.84
    ))
    c.execute("""
    INSERT INTO audit_log (log_id, query, project_id, user_id, top_chunk_id, cov_score, marg_score, combined_conf, threshold, gate_decision, escalated_to_mentor_id, answer_preview, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "audit_seed_2", "How to configure Cisco BGP routing and autonomous systems?", "proj_devonboard", "usr_mentee_alex",
        None, 0.082, 0.120, 0.091, 0.37, "ABSTAIN_ESCALATED", "usr_mentor_david",
        "Evidence gate abstention: out-of-scope technology. Escalated to cloud mentor.", 1.25
    ))

    conn.commit()
    conn.close()
    print(f"Database seeded successfully with {len(all_chunks_for_index)} document passages across 3 projects.")

if __name__ == '__main__':
    seed_database()
