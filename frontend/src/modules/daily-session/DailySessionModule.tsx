'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';
import { sessionService, SessionAnswer } from '@/lib/services/sessionService';

const DEFAULT_QUESTIONS: Omit<Question, 'id'>[] = [
  {
    questionText: 'Implement a LRU Cache with O(1) time complexity for both get and put operations.',
    category: 'Interview',
    subType: 'Data Structures',
    difficulty: 'Hard',
    questionType: 'DSA',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Design a rate limiter backend service that limits requests per user ID to 100 requests per minute.',
    category: 'Interview',
    subType: 'System Design (Mid-Scale)',
    difficulty: 'Medium',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Your production ML model is suffering from covariate shift between training and client deployment. How would you debug and fix this?',
    category: 'Interview',
    subType: 'Scenario-Based Bug',
    difficulty: 'Medium',
    questionType: 'ML Scenario',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Design a distributed search indexing and ranking system like Elasticsearch that can handle 10,000 document additions per second.',
    category: 'Interview',
    subType: 'Large-Scale System Design',
    difficulty: 'Hard',
    questionType: 'Large-Scale Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Describe a situation where you had a significant disagreement with a product manager regarding technical debt. How did you resolve it?',
    category: 'Interview',
    subType: 'Leadership',
    difficulty: 'Easy',
    questionType: 'Behavioral',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Explain the mathematical difference between intrinsic and extrinsic camera matrices and how they are estimated.',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Hard',
    questionType: 'Camera Geometry',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'What is the role of Anchor Boxes in object detectors like Faster R-CNN? How do you optimize their sizes for custom datasets?',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Object Detection',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Describe the trade-offs of using post-training quantization vs quantization-aware training for mobile CNN inference.',
    category: 'CV Skill',
    subType: 'CV Training Strategy',
    difficulty: 'Medium',
    questionType: 'Quantization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'How do you detect and handle labeling bias in a semantic segmentation dataset of street scenes?',
    category: 'CV Skill',
    subType: 'Dataset Quality',
    difficulty: 'Easy',
    questionType: 'Dataset Bias',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'How would you optimize inference latency for a Transformer-based object detection model on edge devices like Jetson Nano?',
    category: 'CV Skill',
    subType: 'CV Optimization',
    difficulty: 'Hard',
    questionType: 'Edge Optimization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
];

const EXPLANATIONS: Record<number, { answer: string; detail: string }> = {
  0: {
    answer: "Use a Doubly Linked List coupled with a Hash Map. The Hash Map stores node references mapping from key, yielding O(1) search. The Doubly Linked List maintains usage frequency order, allowing node updates or evictions in O(1).",
    detail: "To code get(key): lookup node in hash map. If it exists, move it to the head of the DLL (most recently used) and return its value. Else, return -1.\nTo code put(key, value): if key exists, update value and move node to head. Else: create a node, insert to head, add to map. If capacity is exceeded, delete the tail node from DLL and delete its key entry from the map."
  },
  1: {
    answer: "Use Token Bucket or Leaky Bucket algorithm backed by Redis. For every request, parse user ID, fetch the active bucket key from Redis, evaluate the timestamp delta to credit tokens, and decrement token count if space permits.",
    detail: "Redis hash fields `last_updated` (float timestamp) and `tokens` (integer). Rate check pipeline:\n1. tokens_to_add = (current_timestamp - last_updated) * fill_rate\n2. current_tokens = min(bucket_capacity, tokens + tokens_to_add)\n3. If current_tokens >= 1, decrement by 1, save, and return True. Else, return False."
  },
  2: {
    answer: "Adversarial validation or statistical density evaluation. Train a classifier to distinguish training dataset features from production telemetry data. If accuracy is high, covariate shift exists.",
    detail: "Mitigate by:\n- Importance weighting: calculate the ratio of production-to-training sample density to weight the loss during model training.\n- Data acquisition: continuously sample production queries that have high adversarial validation score, label them, and update training baseline."
  },
  3: {
    answer: "Segment queries into ingestion pipeline (Kafka buffer + Elasticsearch nodes) and search pipeline (Coordination nodes + replica shards). Utilize segment merging and inverse document frequency indexing.",
    detail: "Document ingestion:\n- Kafka buffer stores incoming documents to absorb bursts.\n- Primary shards index records and build inverted index structures.\n- Segments are regularly merged in the background to minimize query lookups."
  },
  4: {
    answer: "Frame disagreements around metrics, user impact, and engineering velocity. Present structural issues as debt that slows down feature delivery times rather than aesthetic cleanups.",
    detail: "STAR method:\n- Situation: Technical debt in critical payments module threatened deadline velocity.\n- Task: Reach alignment with the PM who advocated for adding new conversion items instead.\n- Action: Plotted a metrics graph proving technical debt accounted for 40% of bug tickets. Proposed a compromise to dedicate 20% of every sprint for refactoring.\n- Result: Improved sprint delivery reliability by 25% and bugs dropped significantly."
  },
  5: {
    answer: "Intrinsic matrix (K) represents internal camera attributes (focal length, optical center, skew). Extrinsic matrix (R|T) translates camera Coordinates to world Coordinates. They are estimated via homography patterns.",
    detail: "Zhang's method uses a chessboard calibration pattern. Intrinsic parameters are estimated analytically using closed-form solutions by mapping chessboard corners in multiple images. Extrinsic parameters are optimized using Levenberg-Marquardt non-linear minimization."
  },
  6: {
    answer: "Anchor Boxes act as bounding box scale frameworks. YOLO/Faster R-CNN slide anchors over feature map coordinates. Optimize sizes using K-means clustering over dataset ground truth bounding boxes.",
    detail: "Run K-means clustering over all bounding box dimensions (width, height) in the training dataset using Intersection over Union (IoU) as the distance metric. Select the K centroids as the optimized anchor sizes to align with dataset target scales."
  },
  7: {
    answer: "Post-training quantization (PTQ) converts weights after training, yielding minor loss of accuracy but fast configuration. Quantization-aware training (QAT) simulates quantization errors during backpropagation, yielding optimal accuracy.",
    detail: "PTQ: Uses calibration datasets to find weight scale ranges. Highly effective for large models, but sometimes yields accuracy loss in smaller CV backbones.\nQAT: Backpropagates weights in floating point but performs simulated fake quantization on forward passes, forcing model weights to adapt to lower precision."
  },
  8: {
    answer: "Analyze performance per-class and run labeling validation checks. Intersect labeled masks from multiple annotators to evaluate Jaccard/IoU consistency.",
    detail: "Mitigate bias by:\n- Balance resampling: upsample under-represented environments (e.g. night-time street scenes).\n- Multi-annotator consensus: use voting or average thresholds to filter bad labels."
  },
  9: {
    answer: "Apply weight pruning, Layer fusion (fuse Conv + BatchNorm + ReLU), and TensorRT FP16 quantization compile targeting Jetson GPU hardware constraints.",
    detail: "Optimization steps:\n1. TensorRT compilation: compile PyTorch/ONNX model using FP16 quantization.\n2. Layer fusion: combine batch-normalization weights directly into Conv scale arrays to avoid auxiliary layer activations.\n3. KV-cache sizing: use optimized GPU static memory allocation for self-attention caches."
  }
};

type CategoryFilter = 'All' | 'Interview' | 'CV Skill';

export default function DailySessionInteractive() {
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState(false);
  const [practiceStarted, setPracticeStarted] = useState(false);
  const [sessionDate, setSessionDate] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [viewAll, setViewAll] = useState(false);

  // Setup form fields
  const [difficulty, setDifficulty] = useState('Mixed');
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  // AI Hint & Answer state
  const [isGeneratingHint, setIsGeneratingHint] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [dynamicAiAnswer, setDynamicAiAnswer] = useState<string | null>(null);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('http://localhost:8082/sessions/upload-resume', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to parse file');
      const data = await res.json();
      setCvText(data.extracted_text);
      setUploadedFileName(data.filename);
    } catch (err) {
      console.error(err);
      alert('Failed to extract resume text. Please ensure file format is PDF, DOCX, or TXT.');
    } finally {
      setUploadingResume(false);
    }
  };

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // DB question preview state
  const [dbQuestions, setDbQuestions] = useState<Question[]>([]);
  const [displayedDbQuestions, setDisplayedDbQuestions] = useState<Question[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [isLoadingDbQuestions, setIsLoadingDbQuestions] = useState(false);

  // Load active session from localStorage if user refreshes
  useEffect(() => {
    const activeDate = localStorage.getItem('ninja_active_session_date');
    if (activeDate) {
      loadSessionData(activeDate);
    }
    loadDbQuestions();
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (practiceStarted && !viewAll) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [practiceStarted, viewAll]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const loadSessionData = async (dateStr: string) => {
    setLoading(true);
    try {
      const qData = await questionsService.getAll();
      const todayQs = qData.filter((q) => q.dateEncountered === dateStr);
      if (todayQs.length > 0) {
        setQuestions(todayQs);
        setSessionDate(dateStr);
        setSessionActive(true);

        // Fetch saved answers
        const progress = await sessionService.getSessionByDate(dateStr);
        const ansMap: Record<string, string> = {};
        progress.forEach((p) => {
          ansMap[p.questionText] = p.answerText;
        });
        setAnswers(ansMap);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create session in backend SQLite
      const res = await fetch('http://localhost:8082/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          difficulty_hint: difficulty,
          cv_present: !!cvText,
          jd_present: !!jdText,
        }),
      });
      const data = await res.json();
      const newSessionId = data.session_id;
      const newSessionDate = data.session_date;
      const newSessionCode = data.session_code || `W${newSessionId}/${newSessionDate}`;
      setSessionCode(newSessionCode);
      localStorage.setItem('ninja_active_session_code', newSessionCode);

      // 2. Map default questions to backend payload
      const payloadQuestions = DEFAULT_QUESTIONS.map((q, idx) => ({
        section: idx < 5 ? 'A' : 'B',
        number: (idx % 5) + 1,
        category: q.category === 'Interview' ? 'interview' : 'cv_skill',
        sub_type: q.subType,
        difficulty: difficulty !== 'Mixed' ? difficulty.toLowerCase() : q.difficulty.toLowerCase(),
        topics: [q.questionType || q.subType],
        question_text: q.questionText,
      }));

      // 3. Save questions batch in backend SQLite
      await fetch('http://localhost:8082/sessions/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: newSessionId,
          questions: payloadQuestions,
        }),
      });

      // 4. Update local state
      localStorage.setItem('ninja_active_session_date', newSessionDate);
      await loadSessionData(newSessionDate);
    } catch (err) {
      console.error('Failed to initialize session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAnswer = async () => {
    if (questions.length === 0) return;
    const currentQ = questions[currentIndex];
    const answerText = answers[currentQ.questionText] || '';

    const payload: SessionAnswer = {
      questionId: currentQ.id,
      questionText: currentQ.questionText,
      answerText,
      category: currentQ.category === 'Interview' ? 'interview' : 'cv_skill',
      difficulty: currentQ.difficulty.toLowerCase(),
      questionType: currentQ.questionType || currentQ.subType,
      isCompleted: !!answerText.trim(),
      sessionDate,
    };

    setLoading(true);
    try {
      await sessionService.saveSessionAnswers([payload]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`http://localhost:8082/export?session_date=${sessionDate}`);
      if (!res.ok) throw new Error('No questions generated for this date');
      const text = await res.json();

      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview-ninja-session-${sessionDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to export questions. Ensure you have generated the session questions first.');
    }
  };

  const handleClearSession = () => {
    localStorage.removeItem('ninja_active_session_date');
    setSessionActive(false);
    setPracticeStarted(false);
    setElapsedSeconds(0);
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setViewAll(false);
  };

  const handleGenerateHint = async () => {
    if (!activeQuestion) return;
    setIsGeneratingHint(true);
    setDynamicAiAnswer(null);
    try {
      const res = await fetch('http://localhost:8082/sessions/generate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text: activeQuestion.questionText,
          category: activeQuestion.category,
          sub_type: activeQuestion.subType,
          action: 'answer',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDynamicAiAnswer(data.answer);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingHint(false);
      setShowHint(true);
    }
  };

  const resetHints = () => {
    setIsGeneratingHint(false);
    setShowHint(false);
    setShowExplain(false);
  };

  const loadDbQuestions = async () => {
    setIsLoadingDbQuestions(true);
    try {
      const all = await questionsService.getAll();
      setDbQuestions(all);
      const shuffled = [...all].sort(() => Math.random() - 0.5);
      setDisplayedDbQuestions(shuffled.slice(0, 10));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDbQuestions(false);
    }
  };

  const pickQuestionsForFilter = (filter: CategoryFilter, pool: Question[]) => {
    const filtered = filter === 'All' ? pool : pool.filter((q) => q.category === filter);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
  };

  const handleCategoryFilterChange = (filter: CategoryFilter) => {
    setCategoryFilter(filter);
    setDisplayedDbQuestions(pickQuestionsForFilter(filter, dbQuestions));
  };

  const handleRegenerateFromDb = () => {
    setDisplayedDbQuestions(pickQuestionsForFilter(categoryFilter, dbQuestions));
  };

  const handleExportCSV = () => {
    const header = ['#', 'Category', 'Sub-Type', 'Difficulty', 'Question Type', 'Question'];
    const rows = displayedDbQuestions.map((q, i) => [
      String(i + 1),
      q.category,
      q.subType,
      q.difficulty,
      q.questionType || q.subType,
      `"${q.questionText.replace(/"/g, '""')}"`,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-ninja-questions.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeQuestion = questions[currentIndex];
  const activeExplanation = EXPLANATIONS[currentIndex] || { answer: "Study the topic and write down your solution.", detail: "" };

  if (loading && !sessionActive) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="w-48 h-48 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Phase 1: Setup Form
  if (!sessionActive) {
    const difficultyColor: Record<string, string> = {
      Hard: 'bg-red-500/10 text-red-400 border-red-500/20',
      Medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      Easy: 'bg-green-500/10 text-green-400 border-green-500/20',
    };

    const difficultyOptions = [
      { label: 'Easy',   active: 'bg-gradient-to-br from-emerald-500/20 to-green-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-sm' },
      { label: 'Medium', active: 'bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm' },
      { label: 'Hard',   active: 'bg-gradient-to-br from-rose-500/20 to-red-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-sm' },
      { label: 'Mixed',  active: 'bg-gradient-to-br from-violet-500/20 to-blue-500/10 border-violet-500/40 text-violet-600 dark:text-violet-400 shadow-sm' },
    ];

    return (
      <div className="space-y-24">
        {/* ── Setup Card ── */}
        <div className="relative bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-violet-500/[0.03] pointer-events-none" />
          <div className="relative p-9">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-7 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-primary/20 flex items-center justify-center flex-shrink-0">
                <Icon name="AcademicCapIcon" size={17} className="text-primary" />
              </div>
              Configure Your Session
            </h2>
            <form onSubmit={handleStartSession} className="space-y-7">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Difficulty</label>
                <div className="grid grid-cols-4 gap-3">
                  {difficultyOptions.map(({ label, active }) => (
                    <button key={label} type="button" onClick={() => setDifficulty(label)}
                      className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                        difficulty === label ? active : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted hover:border-muted-foreground/40'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="cv-text" className="flex items-center gap-2 text-sm font-medium text-foreground">
                    Context / Resume
                    <span className="text-xs text-muted-foreground font-normal">Optional</span>
                  </label>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-smooth border border-primary/20">
                    <Icon name="DocumentArrowUpIcon" size={14} />
                    {uploadingResume ? 'Extracting...' : 'Upload Resume (.pdf/.docx/.txt)'}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={handleResumeUpload}
                      disabled={uploadingResume}
                    />
                  </label>
                </div>
                {uploadedFileName && (
                  <div className="mb-2 text-xs font-medium text-emerald-500 flex items-center gap-1">
                    <Icon name="CheckCircleIcon" size={14} variant="solid" />
                    Uploaded: {uploadedFileName}
                  </div>
                )}
                <textarea id="cv-text" rows={4} value={cvText} onChange={(e) => setCvText(e.target.value)}
                  placeholder="Paste your resume, project context, or upload a document using the button above..."
                  className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground/50 resize-none transition-all" />
              </div>

              <div>
                <label htmlFor="jd-text" className="flex items-center gap-3 text-sm font-medium text-foreground mb-2">
                  Job Description
                  <span className="text-xs text-muted-foreground font-normal">Optional — tailors focus</span>
                </label>
                <textarea id="jd-text" rows={4} value={jdText} onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste target job description to customise question focus areas..."
                  className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground/50 resize-none transition-all" />
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-violet-600 hover:opacity-90 text-primary-foreground font-semibold transition-smooth flex items-center justify-center gap-3 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:pointer-events-none focus-ring">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Icon name="PlayIcon" size={17} variant="solid" />
                )}
                Generate Daily Session (10 Questions)
              </button>
            </form>
          </div>
        </div>

        {/* ── Question Preview from DB ── */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-9">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h3 className="font-heading text-base font-semibold text-foreground flex items-center gap-3">
                <Icon name="CircleStackIcon" size={18} variant="outline" className="text-primary flex-shrink-0" />
                Questions from Database
                {dbQuestions.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({dbQuestions.length} total)</span>
                )}
              </h3>
              <div className="flex gap-3">
                <button onClick={handleRegenerateFromDb}
                  disabled={isLoadingDbQuestions || dbQuestions.length === 0}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none">
                  <Icon name="ArrowPathIcon" size={14} variant="outline" />
                  Regenerate
                </button>
                <button onClick={handleExportCSV}
                  disabled={displayedDbQuestions.length === 0}
                  className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 transition-smooth flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none">
                  <Icon name="ArrowDownTrayIcon" size={14} variant="outline" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap gap-3 mb-7">
              {(['All', 'Interview', 'CV Skill'] as CategoryFilter[]).map((cat) => (
                <button key={cat} onClick={() => handleCategoryFilterChange(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-smooth border ${
                    categoryFilter === cat
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-muted border-border text-muted-foreground hover:border-muted-foreground'
                  }`}>
                  {cat}
                  {cat !== 'All' && dbQuestions.length > 0 && (
                    <span className="ml-1.5 text-xs opacity-70">
                      ({dbQuestions.filter((q) => q.category === cat).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Question cards */}
            {isLoadingDbQuestions ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : displayedDbQuestions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Icon name="InboxIcon" size={36} variant="outline" className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">No questions in the database yet.</p>
                <p className="text-xs mt-2 opacity-60">Generate your first session above to populate the question bank.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedDbQuestions.map((q, idx) => (
                  <div key={q.id}
                    className="bg-background border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-smooth">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                          {q.category}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{q.subType}</span>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border shrink-0 ${
                        difficultyColor[q.difficulty] ?? 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {q.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      <span className="text-muted-foreground font-medium mr-2">Q{idx + 1}.</span>
                      {q.questionText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Phase 2: Ready / Interstitial
  if (sessionActive && !practiceStarted) {
    return (
      <div className="max-w-2xl mx-auto bg-card rounded-lg p-36 shadow-lg border border-border mt-36 text-center animate-fade-in">
        <Icon name="CheckBadgeIcon" size={64} className="text-success mx-auto mb-18" variant="outline" />
        <h2 className="font-heading text-3xl font-semibold text-foreground mb-12">Session Ready!</h2>
        <p className="text-muted-foreground mb-24 font-body">
          Your custom interview questions have been generated and securely saved. This quiz mode will record your session duration and track your completion.
        </p>
        <button
          onClick={() => setPracticeStarted(true)}
          className="py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-medium transition-smooth inline-flex items-center gap-12 focus-ring shadow-glow"
        >
          <Icon name="PlayCircleIcon" size={24} variant="solid" />
          Start Practicing
        </button>
      </div>
    );
  }

  // Phase 3: Active Session (Quiz Mode)
  return (
    <div className="space-y-24 mt-24 animate-fade-in">
      {/* Session Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-12 bg-muted/40 p-18 border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-12">
          <span className="px-12 py-6 rounded-md bg-primary/10 text-primary font-medium text-sm flex items-center gap-6">
            <Icon name="ClockIcon" size={16} />
            {formatTime(elapsedSeconds)}
          </span>
          <span className="px-12 py-6 rounded-md bg-card border border-border text-foreground font-semibold text-sm">
            Session ID: {sessionCode || localStorage.getItem('ninja_active_session_code') || sessionDate}
          </span>
          <span className="text-sm text-muted-foreground">
            {Object.keys(answers).length} of 10 answered
          </span>
        </div>
        <div className="flex gap-12">
          <button
            onClick={() => setViewAll(!viewAll)}
            className="px-12 py-6 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth flex items-center gap-6"
          >
            <Icon name={viewAll ? "BookOpenIcon" : "ListBulletIcon"} size={16} variant="outline" />
            {viewAll ? 'Back to Quiz' : 'View All Questions'}
          </button>
          <button
            onClick={handleExport}
            className="px-12 py-6 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 transition-smooth flex items-center gap-6"
          >
            <Icon name="ArrowDownTrayIcon" size={16} variant="outline" />
            Export Markdown
          </button>
          <button
            onClick={handleClearSession}
            className="px-12 py-6 rounded-md border border-error text-error text-sm font-medium hover:bg-error/10 transition-smooth"
          >
            Reset Session
          </button>
        </div>
      </div>

      {viewAll ? (
        // Grid View of All Questions
        <div className="space-y-18">
          <h3 className="text-xl font-semibold text-foreground font-heading">All Questions Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-18">
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-card border border-border rounded-lg p-18 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-12">
                    <span className="text-xs font-caption text-muted-foreground">
                      Q{idx + 1} • {q.category} ({q.subType})
                    </span>
                    <span className="text-xs font-semibold px-9 py-3 rounded-md bg-muted text-foreground">
                      {q.difficulty}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground leading-relaxed mb-18">
                    {q.questionText}
                  </p>
                </div>
                <div>
                  <textarea
                    rows={3}
                    placeholder="Type answer details..."
                    value={answers[q.questionText] || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setAnswers((prev) => ({ ...prev, [q.questionText]: text }));
                    }}
                    className="w-full rounded-md border border-border bg-input px-12 py-6 text-xs text-foreground focus-ring placeholder:text-muted-foreground mb-12"
                  />
                  <button
                    onClick={async () => {
                      const payload: SessionAnswer = {
                        questionId: q.id,
                        questionText: q.questionText,
                        answerText: answers[q.questionText] || '',
                        category: q.category === 'Interview' ? 'interview' : 'cv_skill',
                        difficulty: q.difficulty.toLowerCase(),
                        questionType: q.questionType || q.subType,
                        isCompleted: !!(answers[q.questionText] || '').trim(),
                        sessionDate,
                      };
                      await sessionService.saveSessionAnswers([payload]);
                    }}
                    className="py-6 px-12 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/95 transition-smooth"
                  >
                    Save Answer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Quiz Mode (Single Question Focus)
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
          
          {/* AI Helper Sidebar Panel (Now on the LEFT) */}
          <div className="space-y-24 order-2 lg:order-1">
            {!showHint ? (
              <div className="bg-card border border-border rounded-lg p-24 text-center shadow-md">
                <Icon name="SparklesIcon" size={32} variant="outline" className="text-warning mx-auto mb-12" />
                <h4 className="font-heading text-sm font-medium text-foreground mb-6">AI Copilot</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mb-18">
                  Stuck? You can summon the AI to provide a context-aware hint. This runs an on-demand inference to save LLM tokens.
                </p>
                <button
                  onClick={handleGenerateHint}
                  disabled={isGeneratingHint}
                  className="w-full py-9 px-12 rounded-md border border-warning text-warning font-medium hover:bg-warning/10 transition-smooth flex items-center justify-center gap-6 disabled:opacity-50"
                >
                  {isGeneratingHint ? (
                    <>
                      <span className="w-12 h-12 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Icon name="SparklesIcon" size={16} />
                      Generate Hint
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-card border border-warning/50 rounded-lg p-24 shadow-glow space-y-18 animate-fade-in">
                <div className="flex items-center justify-between pb-12 border-b border-border">
                  <div className="flex items-center gap-12">
                    <Icon name="SparklesIcon" size={20} variant="solid" className="text-warning" />
                    <h4 className="font-heading text-md font-semibold text-foreground">AI Reference Hint</h4>
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">
                  {dynamicAiAnswer || activeExplanation.answer}
                </p>
                <button
                  onClick={() => setShowExplain(!showExplain)}
                  className="w-full py-9 px-12 rounded-md bg-secondary/10 text-secondary border border-secondary/20 text-xs font-semibold hover:bg-secondary/20 transition-smooth"
                >
                  {showExplain ? 'Hide Technical Explanation' : 'Explain More with AI'}
                </button>
              </div>
            )}

            {showHint && showExplain && (
              <div className="bg-card border border-secondary/50 rounded-lg p-24 shadow-md space-y-12 animate-fade-in">
                <div className="flex items-center gap-6 pb-6 border-b border-border">
                  <Icon name="CpuChipIcon" size={18} variant="outline" className="text-secondary" />
                  <h5 className="font-heading text-sm font-semibold text-foreground">Technical Breakdown</h5>
                </div>
                <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap font-body bg-muted/30 p-12 rounded-md">
                  {activeExplanation.detail}
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-24 order-1 lg:order-2">
            {/* Question Card */}
            <div className="bg-card border border-border rounded-lg p-24 shadow-md">
              <div className="flex justify-between items-center mb-18 pb-12 border-b border-border">
                <span className="text-xs font-semibold px-12 py-6 rounded bg-primary/15 text-primary">
                  Question {currentIndex + 1} of 10 ({activeQuestion?.category})
                </span>
                <span className="text-sm font-caption text-muted-foreground">
                  Sub-Type: {activeQuestion?.subType}
                </span>
              </div>
              <h3 className="font-heading text-lg font-medium text-foreground mb-18">
                {activeQuestion?.questionText}
              </h3>
            </div>

            {/* Answer Editor */}
            <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
              <label htmlFor="answer-box" className="block font-heading text-base font-medium text-foreground">
                Your Response
              </label>
              <textarea
                id="answer-box"
                rows={10}
                value={answers[activeQuestion?.questionText] || ''}
                onChange={(e) => {
                  const text = e.target.value;
                  setAnswers((prev) => ({
                    ...prev,
                    [activeQuestion.questionText]: text,
                  }));
                }}
                placeholder="Formulate your technical answer details here..."
                className="w-full rounded-md border border-border bg-input px-12 py-12 text-sm text-foreground focus-ring placeholder:text-muted-foreground font-body"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveAnswer}
                  className="py-9 px-18 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-smooth flex items-center gap-6"
                >
                  <Icon name="CheckIcon" size={16} variant="outline" />
                  Save Answer
                </button>
              </div>
            </div>

            {/* Navigation Slider Controls */}
            <div className="flex justify-between items-center py-12 border-t border-border">
              <button
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex(currentIndex - 1);
                  resetHints();
                }}
                className="py-9 px-18 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-30 disabled:pointer-events-none flex items-center gap-6"
              >
                <Icon name="ArrowLeftIcon" size={16} variant="outline" />
                Previous Question
              </button>
              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => {
                  setCurrentIndex(currentIndex + 1);
                  resetHints();
                }}
                className="py-9 px-18 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-30 disabled:pointer-events-none flex items-center gap-6"
              >
                Next Question
                <Icon name="ArrowRightIcon" size={16} variant="outline" />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
