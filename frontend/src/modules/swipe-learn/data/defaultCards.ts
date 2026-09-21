import { ContentCard, TopicMeta } from '../types';

export const DEFAULT_TOPIC_METAS: TopicMeta[] = [
  {
    id: 'mixed',
    label: 'Mixed',
    emoji: '✨',
    color: '#9333ea',
    bgActive: 'bg-purple-600',
    textActive: 'text-white',
    subTabs: [
      { id: 'all', label: 'All' },
      { id: 'for-you', label: 'For You', emoji: '✨' },
    ],
  },
  {
    id: 'python',
    label: 'Python',
    emoji: '🐍',
    color: '#10957d',
    bgActive: 'bg-[#10957d]',
    textActive: 'text-white',
  },
  {
    id: 'computer-vision',
    label: 'CV',
    emoji: '👁️',
    color: '#0284c7',
    bgActive: 'bg-sky-600',
    textActive: 'text-white',
  },
  {
    id: 'finance',
    label: 'Finance',
    emoji: '💰',
    color: '#2563eb',
    bgActive: 'bg-blue-600',
    textActive: 'text-white',
  },
  {
    id: 'ai',
    label: 'AI / GenAI',
    emoji: '🤖',
    color: '#7c3aed',
    bgActive: 'bg-violet-600',
    textActive: 'text-white',
  },
  {
    id: 'interview',
    label: 'Interview Prep',
    emoji: '🧠',
    color: '#d97706',
    bgActive: 'bg-amber-600',
    textActive: 'text-white',
    subTabs: [
      { id: 'all', label: 'All' },
      { id: 'system-design', label: 'System Design', emoji: '🏗️' },
      { id: 'dsa', label: 'DSA', emoji: '💻' },
      { id: 'behavioral', label: 'Behavioral', emoji: '🤝' },
      { id: 'leadership', label: 'Leadership', emoji: '👑' },
    ],
  },
  {
    id: 'quiz',
    label: 'Quiz',
    emoji: '❓',
    color: '#e11d48',
    bgActive: 'bg-rose-600',
    textActive: 'text-white',
  },
];

export const SUGGESTED_CUSTOM_TOPICS = [
  { name: 'System Design', emoji: '🏗️', color: '#b36b17' },
  { name: 'Data Structures', emoji: '📊', color: '#6d6be8' },
  { name: 'AWS', emoji: '☁️', color: '#ea580c' },
  { name: 'Kubernetes', emoji: '☸️', color: '#2563eb' },
  { name: 'React', emoji: '⚛️', color: '#0284c7' },
  { name: 'Stock Market', emoji: '📈', color: '#16a34a' },
  { name: 'Mathematics', emoji: '📐', color: '#9333ea' },
  { name: 'Machine Learning', emoji: '🧠', color: '#0d9488' },
];

export const DEFAULT_CONTENT_CARDS: ContentCard[] = [
  // --- AI / GENAI CARDS WITH EXPANDABLE DEPTH ---
  {
    id: 'ai-rag-001',
    topic: 'ai',
    type: 'concept',
    title: 'What is RAG?',
    hook: 'Grounding LLMs in reality 📚',
    content: 'Retrieve relevant knowledge before generating an answer.',
    depth: {
      howItWorks:
        'Chunks documents into vector embeddings. When a user asks a query, vector search finds the most semantically relevant chunks and injects them into the prompt.',
      architecture:
        'Documents → Embedder → Vector DB (Pinecone/Milvus/Qdrant) → Similarity Search → Context Window → LLM Response.',
      example:
        'An enterprise internal support bot answering HR questions from live PDF benefit documents without fine-tuning.',
      commonMistakes:
        'Chunk sizes either too large (noisy) or too small (lacks context); ignoring semantic metadata filtering.',
      interviewQuestion:
        'How do you evaluate retrieval precision vs recall in a production RAG system, and how does re-ranking help?',
    },
    difficulty: 'beginner',
    estimatedReadTime: 10,
    tags: ['ai', 'rag', 'llm'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'ai-lora-002',
    topic: 'ai',
    type: 'quiz',
    title: 'LoRA: Low-Rank Adaptation',
    hook: 'Cut fine-tuning VRAM by 95% ⚡',
    content: 'How does LoRA dramatically reduce GPU memory during model fine-tuning?',
    quiz: {
      question: 'How does LoRA drastically cut GPU memory during LLM fine-tuning?',
      options: [
        'Freezes base weights & trains low-rank decomposition matrices',
        'Converts 32-bit floats to 1-bit binary integers',
        'Prunes half of the transformer layers',
        'Offloads all gradient computations to CPU RAM',
      ],
      correctAnswer: 0,
      explanation:
        'LoRA keeps pretrained weights W frozen and injects two small low-rank matrices A and B (rank r << dim), drastically reducing trainable parameters and optimizer memory.',
    },
    depth: {
      howItWorks:
        'Weight updates ΔW are represented as product A · B where A is (d x r) and B is (r x k). Since r is small (e.g. 8 or 16), trainable params drop by >95%.',
      architecture:
        'Frozen Pretrained Base Model (W) + Parallel Adapter Branches (A, B) merged at inference time.',
      example:
        'Fine-tuning a 70B parameter Llama model on consumer GPUs with 4-bit QLoRA.',
      commonMistakes:
        'Setting rank r unnecessarily high, which reintroduces memory bloat without measurable accuracy gains.',
      interviewQuestion:
        'Can you fold LoRA adapter weights directly into the base model weights for zero-latency inference?',
    },
    difficulty: 'advanced',
    estimatedReadTime: 15,
    tags: ['ai', 'lora', 'peft'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'ai-003',
    topic: 'ai',
    type: 'concept',
    title: 'Temperature vs Top-P Sampling',
    hook: 'Controlling LLM creativity 🎛️',
    content: 'Temperature scales probability sharpness; Top-P caps selection to top cumulative mass P.',
    depth: {
      howItWorks:
        'Temperature divides logits before softmax (T < 1 sharpens distribution, T > 1 flattens). Top-P dynamically discards low-probability tail tokens.',
      architecture:
        'Logits → Divide by Temp → Softmax Probabilities → Sort Descending → Cumulative Sum until threshold P → Sample.',
      example:
        'Code generation: Temp 0.2, Top-P 0.9 (deterministic). Creative poetry: Temp 0.8, Top-P 0.95 (expressive).',
      commonMistakes:
        'Setting both high simultaneously, leading to incoherent rambling and token drift.',
      interviewQuestion:
        'Why is greedy decoding (Temp=0) susceptible to repetitive text generation in autoregressive models?',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 15,
    tags: ['ai', 'sampling', 'temperature'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },

  // --- PYTHON CARDS ---
  {
    id: 'py-001',
    topic: 'python',
    type: 'code',
    title: 'Why use enumerate()?',
    hook: 'Stop doing this 👇',
    content: 'enumerate() gives you both the index and value while iterating.',
    code: {
      language: 'python',
      code: 'for i, value in enumerate(items):\n    print(i, value)',
      explanation: 'Cleaner and more Pythonic than manually maintaining an index.',
    },
    depth: {
      howItWorks:
        'enumerate() wraps any iterable in an iterator yielding tuples of (count, element) with an optional start offset.',
      architecture:
        'C-level iterator protocol in CPython avoiding extra variable allocations and index lookup overhead.',
      example:
        'for rank, name in enumerate(top_scorers, start=1):\n    print(f"#{rank}: {name}")',
      commonMistakes:
        'Using range(len(items)) and indexing items[i] manually, which is unpythonic and slower.',
      interviewQuestion:
        'What is the difference between iterating over items directly vs using enumerate() in terms of memory and bytecode?',
    },
    difficulty: 'beginner',
    estimatedReadTime: 15,
    tags: ['python', 'clean-code'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'py-002',
    topic: 'python',
    type: 'quiz',
    title: 'Mutable vs Immutable',
    content: 'Which of these Python types is mutable?',
    quiz: {
      question: 'Which of these Python types is mutable?',
      options: ['List', 'Tuple', 'String', 'FrozenSet'],
      correctAnswer: 0,
      explanation:
        'Lists are mutable — you can modify their contents in place. Tuples, strings, and frozensets are immutable. This matters for dict keys and set elements, which must be hashable (immutable).',
    },
    depth: {
      howItWorks:
        'Immutable objects cannot have their state modified after creation; in-place operations allocate a new object. Mutable objects support in-place mutation.',
      architecture:
        'CPython PyObject structure: immutable objects have fixed memory layouts and constant hash values.',
      example:
        'a = [1, 2]; a.append(3) # Same memory id.\ns = "hello"; s += "!" # New string allocated.',
      commonMistakes:
        'Using mutable default arguments in functions (def add_item(val, items=[]): ...)',
      interviewQuestion:
        'Why does Python require dictionary keys to be hashable and therefore immutable?',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 15,
    tags: ['python', 'data-types'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'py-003',
    topic: 'python',
    type: 'code',
    title: 'List Comprehension Magic',
    hook: 'One-liner efficiency ⚡',
    content: 'Transform loops into elegant one-liners with list comprehensions.',
    code: {
      language: 'python',
      code: '# Squares of even numbers\nsquares = [x**2 for x in range(10) if x % 2 == 0]\nprint(squares)\n# [0, 4, 16, 36, 64]',
      explanation: 'Evaluated via optimized C-level bytecodes (LIST_APPEND) rather than repeated Python function calls.',
    },
    difficulty: 'beginner',
    estimatedReadTime: 15,
    tags: ['python', 'list-comprehension'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'py-004',
    topic: 'python',
    type: 'code',
    title: 'Dictionary Default Pattern',
    hook: 'Avoid KeyError exceptions 🛡️',
    content: 'Use .get() with a default to avoid KeyError exceptions.',
    code: {
      language: 'python',
      code: 'config = {"host": "localhost"}\nport = config.get("port", 8080)\nprint(f"Connecting to {config[\'host\']}:{port}")',
      explanation: 'Returns the default fallback instead of raising a runtime KeyError if the key is absent.',
    },
    difficulty: 'beginner',
    estimatedReadTime: 15,
    tags: ['python', 'dictionaries'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },

  // --- COMPUTER VISION CARDS ---
  {
    id: 'cv-quiz-001',
    topic: 'computer-vision',
    type: 'quiz',
    title: 'Quick CV Quiz 👁️',
    content: 'Which technique is commonly used to reduce image noise?',
    quiz: {
      question: 'Which technique is commonly used to reduce image noise?',
      options: ['Gaussian Blur', 'Edge Detection', 'Thresholding', 'Hough Transform'],
      correctAnswer: 0,
      explanation:
        'Gaussian Blur smooths pixel-level variations and is commonly used for noise reduction.',
    },
    depth: {
      howItWorks:
        'Convolves the image with a 2D Gaussian bell-curve kernel where central weights are highest, suppressing high-frequency noise.',
      architecture:
        'Image [H x W x C] * 2D Gaussian Kernel [K x K] → Smooth Image [H x W x C]. Separable as 1D horizontal + 1D vertical passes for O(K) speed.',
      example:
        'Preprocessing camera frames before Canny edge detection or feature matching to prevent false edge triggers.',
      commonMistakes:
        'Using an excessively large kernel size that erases critical structural edges and boundary gradients.',
      interviewQuestion:
        'Why is a 2D Gaussian filter mathematically separable into two 1D convolutions, and what complexity improvement does that give?',
    },
    difficulty: 'beginner',
    estimatedReadTime: 10,
    tags: ['computer-vision', 'image-processing'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'cv-002',
    topic: 'computer-vision',
    type: 'concept',
    title: 'Intersection over Union (IoU)',
    hook: 'The gold standard detection metric 📐',
    content: 'IoU measures the ratio of overlap area to union area between bounding boxes.',
    depth: {
      howItWorks:
        'IoU = Area of Overlap / Area of Union. Quantifies how well a predicted bounding box aligns with the ground truth annotation.',
      architecture:
        'Intersection coordinates: x1 = max(pred_x1, gt_x1), y1 = max(pred_y1, gt_y1); Union = Area(pred) + Area(gt) - Intersection.',
      example:
        'IoU >= 0.5 designates a true positive detection in PASCAL VOC and COCO benchmarks.',
      commonMistakes:
        'Dividing by zero when boxes have zero union (impossible if valid boxes, but boundary checks matter).',
      interviewQuestion:
        'Why does Generalized IoU (GIoU) or Distance-IoU (DIoU) provide better gradients for bounding box regression when boxes do not overlap?',
    },
    difficulty: 'beginner',
    estimatedReadTime: 15,
    tags: ['computer-vision', 'iou', 'detection'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },

  // --- FINANCE CARDS ---
  {
    id: 'fin-001',
    topic: 'finance',
    type: 'concept',
    title: 'Discounted Cash Flow (DCF)',
    hook: 'Time value of money 💵',
    content: 'Valuing an investment today based on projections of future cash flows discounted back.',
    depth: {
      howItWorks:
        'Projects future Free Cash Flows (FCF) for 5-10 years, calculates a terminal value, and discounts each to the present using the Weighted Average Cost of Capital (WACC).',
      architecture:
        'Revenue Forecast → FCF Projections → Discount via WACC → Terminal Value (Gordon Growth or Exit Multiple) → Enterprise Value.',
      example:
        'Valuing a SaaS company with $10M expected cash flow next year discounted at 9% WACC.',
      commonMistakes:
        'Unrealistic long-term terminal growth rate assumptions exceeding GDP growth.',
      interviewQuestion:
        'How does an increase in interest rates impact DCF valuations of high-growth tech companies vs cash-generative value companies?',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 15,
    tags: ['finance', 'valuation', 'dcf'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'fin-002',
    topic: 'finance',
    type: 'quiz',
    title: 'Rule of 72 for Compounding',
    content: 'If an investment portfolio earns 8% annually, how many years will it take to double?',
    quiz: {
      question: 'How many years to double an investment at 8% annual return?',
      options: ['6 years', '9 years', '12 years', '15 years'],
      correctAnswer: 1,
      explanation:
        'The Rule of 72 formula is: Years to double ≈ 72 / Annual Interest Rate. (72 / 8 = 9 years). At 12%, it doubles in 6 years.',
    },
    depth: {
      howItWorks:
        'Approximates natural logarithm ln(2) ≈ 0.693; 72 is chosen because it has many convenient divisors (2, 3, 4, 6, 8, 9, 12).',
      architecture:
        'Exact formula: t = ln(2) / ln(1 + r). Rule of 72: t ≈ 72 / (r * 100).',
      example:
        'An index fund growing at 10% doubles money every 7.2 years; at 7.2% it doubles every 10 years.',
      commonMistakes:
        'Using interest rate as decimal (0.08) in numerator instead of whole number percentage (8).',
      interviewQuestion:
        'Why does the Rule of 72 become less accurate at very high interest rates above 25%?',
    },
    difficulty: 'beginner',
    estimatedReadTime: 10,
    tags: ['finance', 'investing', 'compounding'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },

  // --- INTERVIEW PREP CARDS (SUB-TABS: SYSTEM DESIGN, DSA, BEHAVIORAL, LEADERSHIP) ---
  {
    id: 'int-sd-001',
    topic: 'interview',
    subCategory: 'system-design',
    type: 'concept',
    title: 'CAP Theorem in Practice',
    hook: 'Consistency vs Availability 🌐',
    content: 'Since network partitions are unavoidable, systems must choose between CP and AP.',
    depth: {
      howItWorks:
        'When nodes cannot communicate across a network partition, you must either reject writes (Consistency) or accept writes on isolated nodes (Availability).',
      architecture:
        'CP System (e.g. etcd/Zookeeper Raft quorum) vs AP System (e.g. Cassandra/DynamoDB eventual consistency with hinted handoff).',
      example:
        'Bank ATM ledger must be CP (never double-spend during partition). Social media likes counter can be AP (temporary count drift is acceptable).',
      commonMistakes:
        'Saying "pick Consistency and Availability" in an interview — Partition Tolerance cannot be chosen away in distributed networks.',
      interviewQuestion:
        'Explain PACELC theorem and how it extends CAP theorem when the network is running normally without partitions.',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 20,
    tags: ['interview', 'system-design', 'cap-theorem'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'int-dsa-002',
    topic: 'interview',
    subCategory: 'dsa',
    type: 'concept',
    title: 'Monotonic Stack Pattern',
    hook: 'O(N) Next Greater Element 📈',
    content: 'A stack maintaining elements in monotonic order solves nearest greater element queries in O(N) time.',
    depth: {
      howItWorks:
        'Incoming elements pop smaller elements from the stack until order is restored. Because each element is pushed once and popped once, total runtime is amortized O(N).',
      architecture:
        'Stack stores array indices. Push index i; when nums[i] > nums[stack.top()], resolve stack.pop().',
      example:
        'Daily Temperatures: finding how many days until a warmer temperature occurs.',
      commonMistakes:
        'Confusing strictly increasing with non-decreasing when duplicate values are allowed in the input array.',
      interviewQuestion:
        'How do you prove mathematically that a nested while loop inside an O(N) for loop runs in amortized linear time?',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 20,
    tags: ['interview', 'dsa', 'stack'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'int-beh-003',
    topic: 'interview',
    subCategory: 'behavioral',
    type: 'tip',
    title: 'STAR Method for Stories',
    hook: 'Structure your behavioral answers 🎯',
    content: 'Structure every behavioral interview response: Situation, Task, Action, Result.',
    depth: {
      howItWorks:
        'Spend 70% of your time on Action (what YOU individually did) and Result (quantifiable metrics and lessons learned).',
      architecture:
        'Situation (15%) → Task (10%) → Action (50%) → Result (25% with concrete metrics).',
      example:
        '"We had a 40% query latency spike (S). I was tasked with diagnosis (T). I indexed composite keys and added Redis caching (A). Latency dropped by 65% (R)."',
      commonMistakes:
        'Saying "we" instead of "I" throughout the action steps, obscuring your individual contribution.',
      interviewQuestion:
        'Tell me about a time you had a technical disagreement with a senior engineer or manager and how you resolved it.',
    },
    difficulty: 'beginner',
    estimatedReadTime: 20,
    tags: ['interview', 'behavioral', 'star-method'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
  {
    id: 'int-lead-004',
    topic: 'interview',
    subCategory: 'leadership',
    type: 'concept',
    title: 'Blameless Post-Mortems',
    hook: 'System failure, not human fault 🛡️',
    content: 'Outages happen because systemic safeguards failed, not because an engineer made a typo.',
    depth: {
      howItWorks:
        'Focus on systemic vulnerabilities, automated rollback gates, and canary releases rather than individual culpability.',
      architecture:
        'Timeline Construction → 5 Whys Root Cause Analysis → Action Items with Assigned Owners & Deadlines → Org-wide Dissemination.',
      example:
        'A bad migration ran on production because CI lacked an automatic dry-run staging verification step.',
      commonMistakes:
        'Listing "remind engineers to be more careful" as an action item instead of adding automated validation guardrails.',
      interviewQuestion:
        'How do you foster an engineering culture of psychological safety while maintaining high delivery rigor?',
    },
    difficulty: 'intermediate',
    estimatedReadTime: 20,
    tags: ['interview', 'leadership', 'culture'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },

  // --- QUIZ CARDS ---
  {
    id: 'quiz-001',
    topic: 'quiz',
    type: 'quiz',
    title: 'Python append() vs extend()',
    content: 'What is the output of [1, 2].append([3, 4])?',
    quiz: {
      question: 'What is the output of [1, 2].append([3, 4])?',
      options: ['[1, 2, [3, 4]]', '[1, 2, 3, 4]', '[1, 2]', 'TypeError'],
      correctAnswer: 0,
      explanation:
        'append() nests the argument list as a single element: [1, 2, [3, 4]]. extend() unpacks and appends each element individually: [1, 2, 3, 4].',
    },
    difficulty: 'beginner',
    estimatedReadTime: 10,
    tags: ['quiz', 'python', 'lists'],
    isSaved: false,
    isRead: false,
    source: 'seed',
    createdAt: '2026-09-22T00:00:00Z',
  },
];
