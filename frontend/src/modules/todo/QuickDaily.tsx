'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import EisenhowerMatrix, { QuadrantType, MatrixItem } from '@/components/ui/EisenhowerMatrix';
import QuickTaskCard from './QuickTaskCard';
import { QuickTask, ParsedBrainDumpTask, quickTaskService } from '@/lib/services/quickTaskService';
import { paretoService } from '@/lib/services/paretoService';

interface QuickDailyProps {
  model: 'ollama' | 'gemini';
}

const QUADRANT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  do_now:    { label: '🔥 Do Now',    color: 'text-red-500',    bg: 'bg-red-500/10 border-red-400/30' },
  schedule:  { label: '📅 Schedule',  color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-400/30' },
  delegate:  { label: '🤝 Delegate',  color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-400/30' },
  eliminate: { label: '🗑 Eliminate', color: 'text-muted-foreground', bg: 'bg-muted/30 border-border' },
};

export default function QuickDaily({ model }: QuickDailyProps) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [top20Only, setTop20Only] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  // ── Brain Dump state ──────────────────────────────────────────────────────
  const [showBrainDump, setShowBrainDump] = useState(false);
  // step: 'upload' | 'processing' | 'preview' | 'saving'
  const [brainDumpStep, setBrainDumpStep] = useState<'upload' | 'processing' | 'preview' | 'saving'>('upload');
  const [brainDumpError, setBrainDumpError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parsedTasks, setParsedTasks] = useState<ParsedBrainDumpTask[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [uploadPreview, setUploadPreview] = useState<string | null>(null); // data URL for image preview
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI Day Plan state ──────────────────────────────────────────────────────
  const [showDayPlan, setShowDayPlan] = useState(false);
  const [dayPlanStep, setDayPlanStep] = useState<'hours' | 'loading' | 'result'>('hours');
  const [dayPlanHours, setDayPlanHours] = useState(4);
  const [dayPlanData, setDayPlanData] = useState<any>(null);

  // ── End My Day state ─────────────────────────────────────────────────────
  const [showEndDay, setShowEndDay] = useState(false);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const fetched = await quickTaskService.fetchTodayTasks();
    setTasks(fetched);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const [addDueDate, setAddDueDate] = useState<string>('');
  const [addTimeEstimate, setAddTimeEstimate] = useState<string>('');

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    const newTask = await quickTaskService.createTask({
      title: inputValue.trim(),
      quadrant: 'do_now',
      source: 'manual',
      due_date: addDueDate || null,
      time_estimate: addTimeEstimate || null,
    });
    if (newTask) {
      setTasks(prev => [...prev, newTask]);
      setInputValue('');
      setAddDueDate('');
      setAddTimeEstimate('');
    }
  };

  const handleUpdateTask = useCallback((id: number, updates: Partial<QuickTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const handleDeleteTask = useCallback((id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleMoveToSmart = useCallback(async (id: number) => {
    const res = await quickTaskService.moveToSmart(id);
    if (res) {
      // Mark as exported (keep in list but dim it)
      handleUpdateTask(id, { is_exported: true });
      showToast('✅ Task moved to Smart To-Do!');
    }
  }, [handleUpdateTask, showToast]);

  const handleMoveToPlan = useCallback(async (id: number) => {
    const res = await quickTaskService.moveToPlan(id);
    if (res) {
      handleUpdateTask(id, { is_exported: true });
      showToast('🗺️ Task moved to Plan & Project!');
    }
  }, [handleUpdateTask, showToast]);

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: QuadrantType, newIndex?: number) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, quadrant: newQuadrant } : t));
    const updated = await quickTaskService.updateTask(id, { quadrant: newQuadrant, order_index: newIndex });
    if (!updated) loadTasks();
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    try {
      const result = await quickTaskService.autoSort(model);
      if (result?.assignments?.length > 0) {
        await loadTasks();
        showToast(`🤖 AI sorted ${result.assignments.length} tasks into quadrants!`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Auto-sort failed.', 'error');
    } finally {
      setAutoSortLoading(false);
    }
  };

  const handleGenerateDayPlan = async () => {
    setDayPlanStep('loading');
    try {
      const result = await quickTaskService.aiDayPlan(dayPlanHours, model);
      setDayPlanData(result);
      setDayPlanStep('result');
    } catch (err) {
      setDayPlanStep('hours');
      showToast(err instanceof Error ? err.message : 'Failed to generate day plan.', 'error');
    }
  };

  const handleAnalyze = async () => {
    if (paretoService.hasAnalyzedToday('quick')) {
      if (!confirm('You already ran analysis today. Results may be similar. Continue?')) return;
    }
    if (!confirm('AI will analyze today\'s tasks and identify the top 20% that will drive 80% of your results. This takes a few seconds.')) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('quick', model);
      paretoService.markAnalyzedToday('quick');
      await loadTasks();
      showToast(`⭐ Found ${result.top20_count ?? 0} high-leverage task${(result.top20_count ?? 0) === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Analysis failed.', 'error');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  // ── Brain Dump Handlers ───────────────────────────────────────────────────

  const openBrainDump = () => {
    setShowBrainDump(true);
    setBrainDumpStep('upload');
    setBrainDumpError(null);
    setExtractedText('');
    setParsedTasks([]);
    setSelectedTasks(new Set());
    setUploadPreview(null);
  };

  const closeBrainDump = () => {
    setShowBrainDump(false);
    setBrainDumpStep('upload');
    setBrainDumpError(null);
    setExtractedText('');
    setParsedTasks([]);
    setUploadPreview(null);
  };

  const handleFileSelect = async (file: File) => {
    setBrainDumpError(null);
    // Show image preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setUploadPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview(null);
    }
    await processBrainDump(file);
  };

  const processBrainDump = async (file: File) => {
    setBrainDumpStep('processing');
    setBrainDumpError(null);
    try {
      const result = await quickTaskService.brainDumpUpload(file, model);
      setExtractedText(result.extracted_text);
      setParsedTasks(result.parsed_tasks);
      // Auto-select all by default
      setSelectedTasks(new Set(result.parsed_tasks.map((_, i) => i)));
      if (result.warning) setBrainDumpError(result.warning);
      setBrainDumpStep('preview');
    } catch (err: any) {
      setBrainDumpError(err.message || 'Failed to process image. Please try a clearer photo.');
      setBrainDumpStep('upload');
    }
  };

  const handleConfirmBrainDump = async () => {
    const tasksToSave = parsedTasks.filter((_, i) => selectedTasks.has(i));
    if (tasksToSave.length === 0) { closeBrainDump(); return; }
    setBrainDumpStep('saving');
    const result = await quickTaskService.bulkCreate(tasksToSave);
    if (result) {
      setTasks(prev => [...prev, ...result.created]);
      showToast(`🧠 ${result.count} tasks added from brain dump!`);
    }
    closeBrainDump();
  };

  const toggleTaskSelection = (i: number) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const updateParsedTask = (i: number, field: keyof ParsedBrainDumpTask, value: string) => {
    setParsedTasks(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  // ── Matrix items ──────────────────────────────────────────────────────────
  const activeTasks = tasks.filter(t => !t.is_exported && (!top20Only || t.is_top_20));
  const matrixItems = activeTasks.map(t => ({ ...t, id: t.id.toString() })) as unknown as (MatrixItem & QuickTask)[];

  const completedCount = activeTasks.filter(t => t.done).length;
  const totalCount = activeTasks.length;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-[200] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2 whitespace-pre-line animate-slide-up ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header & Quick Add Bar */}
      <div className="bg-card border border-border/80 rounded-xl p-3 shadow-sm flex flex-col gap-2.5">
        <form onSubmit={handleCreateTask} className="flex flex-col gap-2">
          <div className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Add a task for today... (hit Enter)"
              className="w-full bg-input border-2 border-border/50 hover:border-border rounded-lg py-2.5 pl-4 pr-36 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth placeholder:text-muted-foreground/70"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {/* Brain Dump (Handwriting) Button */}
              <button
                type="button"
                onClick={openBrainDump}
                className="p-1.5 rounded-md transition-smooth text-muted-foreground hover:bg-purple-500/10 hover:text-purple-500"
                title="Brain Dump — upload handwriting photo"
              >
                <span className="text-sm">🧠</span>
              </button>
              {/* AI Day Plan — top-20 aware */}
              <button
                type="button"
                onClick={() => {
                  setDayPlanStep('hours');
                  setDayPlanData(null);
                  setShowDayPlan(true);
                }}
                className="p-1.5 rounded-md transition-smooth text-muted-foreground hover:bg-primary/10 hover:text-primary"
                title="AI Day Plan"
              >
                <span className="text-sm">🌅</span>
              </button>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-smooth disabled:opacity-50"
              >
                <Icon name="ArrowUpIcon" size={14} variant="solid" />
              </button>
            </div>
          </div>

          {/* Time Estimate & Due Date Options Strip */}
          <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border border-border/50">
              <Icon name="ClockIcon" size={12} className="text-amber-500" />
              <span className="text-[10px] font-semibold">Time:</span>
              <select
                value={addTimeEstimate}
                onChange={e => setAddTimeEstimate(e.target.value)}
                className="bg-transparent text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
              >
                <option value="">None</option>
                <option value="15m">15 mins</option>
                <option value="30m">30 mins</option>
                <option value="45m">45 mins</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-md border border-border/50">
              <Icon name="CalendarIcon" size={12} className="text-blue-500" />
              <span className="text-[10px] font-semibold">Due Date:</span>
              <input
                type="date"
                value={addDueDate}
                onChange={e => setAddDueDate(e.target.value)}
                className="bg-transparent text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
              />
              {addDueDate && (
                <button
                  type="button"
                  onClick={() => setAddDueDate('')}
                  className="text-[10px] hover:text-foreground text-muted-foreground ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* 80/20 Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTop20Only(!top20Only)}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-smooth flex items-center gap-1 font-semibold ${
            top20Only
              ? 'border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-400'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
          title="Show only Top 20% high-leverage tasks"
        >
          ⭐ Top 20%
        </button>
        <button
          onClick={handleAnalyze}
          disabled={analyzeLoading}
          className="text-[10px] px-2.5 py-1.5 rounded-lg border border-amber-400/50 bg-amber-400/5 text-amber-600 dark:text-amber-400 hover:bg-amber-400/10 transition-smooth flex items-center gap-1 font-semibold disabled:opacity-50"
          title="Run AI 80/20 analysis on today's tasks"
        >
          {analyzeLoading ? (
            <span className="w-3 h-3 border border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
          ) : '⭐'}
          {analyzeLoading ? 'Identifying your high-leverage tasks...' : '80/20 Analyze'}
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left: Eisenhower Matrix */}
        <div className="xl:col-span-2 flex flex-col min-h-[500px]">
          <EisenhowerMatrix
            items={matrixItems}
            onQuadrantChange={handleQuadrantChange}
            showAutoSort={true}
            onAutoSort={handleAutoSort}
            autoSortLoading={autoSortLoading}
            itemRenderer={(item) => (
              <QuickTaskCard
                task={item}
                model={model}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onMoveToSmart={handleMoveToSmart}
                onMoveToPlan={handleMoveToPlan}
                hideDragHandle={false}
              />
            )}
          />
        </div>

        {/* Right: Today's Flat List */}
        <div className="flex flex-col bg-card border border-border/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-black/5 dark:bg-white/5 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-semibold text-sm text-foreground">Today's List</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{completedCount} of {totalCount} done</p>
            </div>
            <button
              onClick={() => setShowEndDay(true)}
              className="px-3 py-1.5 text-[10px] font-bold bg-muted hover:bg-muted/80 text-foreground rounded-md transition-smooth flex items-center gap-1.5"
            >
              🌙 End My Day
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 scrollbar-clean space-y-2">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : activeTasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-60">
                <span className="text-4xl">🌵</span>
                <p className="text-xs font-medium">Your day is clear.</p>
                <button onClick={openBrainDump} className="text-[10px] text-primary hover:underline">
                  + Brain Dump to add tasks
                </button>
              </div>
            ) : (
              ['do_now', 'schedule', 'delegate', 'eliminate'].map(quadrant => {
                const quadTasks = activeTasks.filter(t => t.quadrant === quadrant);
                if (quadTasks.length === 0) return null;
                const conf = QUADRANT_CONFIG[quadrant];
                return (
                  <div key={quadrant} className="mb-4 last:mb-0">
                    <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-1 ${conf.color}`}>
                      {conf.label}
                    </h3>
                    <div className="space-y-1.5">
                      {quadTasks.map(task => (
                        <QuickTaskCard
                          key={`list-${task.id}`}
                          task={task}
                          model={model}
                          onUpdate={handleUpdateTask}
                          onDelete={handleDeleteTask}
                          onMoveToSmart={handleMoveToSmart}
                          onMoveToPlan={handleMoveToPlan}
                          hideDragHandle={true}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {/* Exported tasks (dimmed historical) */}
            {tasks.filter(t => t.is_exported).length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-2 px-1">Moved out</p>
                {tasks.filter(t => t.is_exported).map(task => (
                  <div key={`exp-${task.id}`} className="px-2 py-1.5 rounded text-[10px] text-muted-foreground/50 line-through italic">
                    {task.title}
                    {task.exported_task_id && <span className="ml-1 not-italic">→ Smart To-Do</span>}
                    {task.exported_project_id && <span className="ml-1 not-italic">→ Plan</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════ Brain Dump Modal ════════ */}
      {showBrainDump && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-lg">🧠</div>
                <div>
                  <h2 className="font-heading font-bold text-foreground text-base">Handwriting Brain Dump</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {brainDumpStep === 'upload' && 'Upload a photo of your handwritten notes'}
                    {brainDumpStep === 'processing' && 'Vision AI is reading your handwriting...'}
                    {brainDumpStep === 'preview' && `AI found ${parsedTasks.length} tasks — review before adding`}
                    {brainDumpStep === 'saving' && 'Adding tasks to your day...'}
                  </p>
                </div>
              </div>
              <button onClick={closeBrainDump} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto scrollbar-clean">

              {/* STEP: Upload */}
              {brainDumpStep === 'upload' && (
                <div className="p-6 flex flex-col gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.heic,.pdf"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                  />

                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="border-2 border-dashed border-purple-400/40 hover:border-purple-400/80 rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-smooth bg-purple-500/5 hover:bg-purple-500/10 group"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/10 group-hover:bg-purple-500/20 flex items-center justify-center transition-smooth">
                      <span className="text-3xl">📸</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Drop your handwriting photo here</p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-2">Supports: JPG, PNG, WEBP, HEIC, PDF scan</p>
                    </div>
                  </div>

                  {brainDumpError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 leading-relaxed">
                      ⚠️ {brainDumpError}
                    </div>
                  )}

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                    <span className="text-lg flex-shrink-0">💡</span>
                    <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
                      <p><strong className="text-foreground">Best results:</strong> Good lighting, flat surface, clear handwriting</p>
                      <p>AI will extract all text, then organize it into prioritized Eisenhower tasks</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP: Processing */}
              {brainDumpStep === 'processing' && (
                <div className="p-10 flex flex-col items-center gap-6">
                  {uploadPreview && (
                    <div className="w-40 h-40 rounded-xl overflow-hidden border border-border shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uploadPreview} alt="Your brain dump" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-14 h-14">
                      <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
                      <div className="absolute inset-3 rounded-full bg-purple-500/10 flex items-center justify-center text-lg">🔍</div>
                    </div>
                    <p className="text-sm font-semibold text-foreground animate-pulse">Reading your handwriting...</p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      Vision AI is transcribing your notes, then organizing them into tasks
                    </p>
                  </div>
                </div>
              )}

              {/* STEP: Preview */}
              {brainDumpStep === 'preview' && (
                <div className="flex flex-col gap-0 h-full">
                  {/* Extracted text accordion */}
                  {extractedText && (
                    <details className="border-b border-border">
                      <summary className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:bg-muted/30 transition-smooth flex items-center gap-2">
                        <span>📝 Raw Extracted Text</span>
                        <span className="text-[9px] normal-case font-normal">(click to expand)</span>
                      </summary>
                      <div className="px-6 py-3 bg-muted/20 max-h-40 overflow-y-auto">
                        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">{extractedText}</pre>
                      </div>
                    </details>
                  )}

                  {brainDumpError && (
                    <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
                      ⚠️ {brainDumpError}
                    </div>
                  )}

                  {/* Task cards */}
                  {parsedTasks.length > 0 ? (
                    <div className="px-6 py-4 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-foreground">Review tasks to add ({selectedTasks.size}/{parsedTasks.length} selected)</p>
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedTasks(new Set(parsedTasks.map((_, i) => i)))}
                            className="text-[10px] text-primary hover:underline">Select all</button>
                          <span className="text-muted-foreground">·</span>
                          <button onClick={() => setSelectedTasks(new Set())}
                            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">None</button>
                        </div>
                      </div>

                      {parsedTasks.map((task, i) => {
                        const isSelected = selectedTasks.has(i);
                        const conf = QUADRANT_CONFIG[task.quadrant] || QUADRANT_CONFIG.do_now;
                        return (
                          <div key={i} className={`relative rounded-xl border transition-smooth ${isSelected ? `${conf.bg} border-l-4` : 'border-border/50 bg-muted/10 opacity-60'}`}>
                            <div className="flex items-start gap-3 p-3">
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleTaskSelection(i)}
                                className="flex-shrink-0 mt-0.5"
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-smooth ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                                  {isSelected && <Icon name="CheckIcon" size={12} className="text-white" variant="solid" />}
                                </div>
                              </button>

                              <div className="flex-1 min-w-0 space-y-2">
                                {/* Title — inline editable */}
                                <input
                                  className="w-full text-sm font-semibold text-foreground bg-transparent border-0 border-b border-dashed border-border/50 focus:border-primary focus:outline-none pb-0.5"
                                  value={task.title}
                                  onChange={e => updateParsedTask(i, 'title', e.target.value)}
                                />

                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Quadrant selector */}
                                  <select
                                    value={task.quadrant}
                                    onChange={e => updateParsedTask(i, 'quadrant', e.target.value)}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border bg-transparent focus:outline-none cursor-pointer ${conf.color} ${conf.bg}`}
                                  >
                                    <option value="do_now">🔥 Do Now</option>
                                    <option value="schedule">📅 Schedule</option>
                                    <option value="delegate">🤝 Delegate</option>
                                    <option value="eliminate">🗑 Eliminate</option>
                                  </select>

                                  {/* Time estimate */}
                                  {task.time_estimate && (
                                    <span className="text-[10px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <Icon name="ClockIcon" size={10} />
                                      {task.time_estimate}
                                    </span>
                                  )}
                                </div>

                                {/* Context note */}
                                {task.context && (
                                  <p className="text-[10px] text-muted-foreground italic leading-relaxed">{task.context}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-6 py-10 text-center text-muted-foreground">
                      <p className="text-2xl mb-2">🤔</p>
                      <p className="text-sm font-medium">No tasks found in the image.</p>
                      <p className="text-xs mt-1">Check the extracted text above, or try a clearer photo.</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: Saving */}
              {brainDumpStep === 'saving' && (
                <div className="p-10 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-foreground">Adding {selectedTasks.size} tasks to your day...</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            {(brainDumpStep === 'upload' || brainDumpStep === 'preview') && (
              <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/10">
                {brainDumpStep === 'upload' ? (
                  <>
                    <p className="text-[10px] text-muted-foreground">Tip: Alt+D opens the distraction inbox</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-5 py-2.5 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded-xl transition-smooth flex items-center gap-2 shadow-lg shadow-purple-500/20"
                    >
                      <span>📸</span> Choose Photo
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setBrainDumpStep('upload'); setUploadPreview(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1">
                      <Icon name="ArrowLeftIcon" size={12} /> Upload different
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={closeBrainDump}
                        className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted transition-smooth">
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmBrainDump}
                        disabled={selectedTasks.size === 0}
                        className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-smooth disabled:opacity-50 flex items-center gap-2 shadow-lg"
                      >
                        <Icon name="PlusIcon" size={14} variant="solid" />
                        Add {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} to Today
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Day Plan Modal — top-20 aware */}
      {showDayPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌅</span>
                <h3 className="font-heading text-lg font-bold text-foreground">AI Day Plan</h3>
              </div>
              <button onClick={() => setShowDayPlan(false)} className="text-muted-foreground hover:text-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            {dayPlanStep === 'hours' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">How many hours do you have today?</p>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={dayPlanHours}
                  onChange={e => setDayPlanHours(parseFloat(e.target.value) || 0)}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring"
                />
                <button
                  onClick={handleGenerateDayPlan}
                  className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-smooth"
                >
                  Generate My Day Plan
                </button>
              </div>
            )}

            {dayPlanStep === 'loading' && (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">AI is planning your day...</p>
              </div>
            )}

            {dayPlanStep === 'result' && dayPlanData && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-clean">
                {(dayPlanData.plan || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No tasks available for planning.</p>
                ) : (
                  <>
                    {(dayPlanData.plan || []).some((t: any) => t.is_top_20) && (
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">⭐ High Leverage</h4>
                        <div className="space-y-2">
                          {(dayPlanData.plan || []).filter((t: any) => t.is_top_20).map((task: any, idx: number) => (
                            <PlanSlot key={idx} task={task} />
                          ))}
                        </div>
                      </div>
                    )}
                    {(dayPlanData.plan || []).some((t: any) => !t.is_top_20) && (
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Other Tasks</h4>
                        <div className="space-y-2">
                          {(dayPlanData.plan || []).filter((t: any) => !t.is_top_20).map((task: any, idx: number) => (
                            <PlanSlot key={idx} task={task} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button onClick={() => setShowDayPlan(false)}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-smooth">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End My Day Modal — lets the user choose what happens to incomplete tasks */}
      {showEndDay && (
        <QuickEndDayModal
          incompleteTasks={activeTasks.filter(t => !t.done)}
          completedCount={completedCount}
          model={model}
          onClose={() => setShowEndDay(false)}
          onDayEnded={(res) => {
            setShowEndDay(false);
            loadTasks();
            showToast(`🌙 ${res.summary}${res.top20_warning ? ` ${res.top20_warning}` : ''}`);
          }}
        />
      )}
    </div>
  );
}

interface QuickEndDayModalProps {
  incompleteTasks: QuickTask[];
  completedCount: number;
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onDayEnded: (res: any) => void;
}

function QuickEndDayModal({ incompleteTasks, completedCount, model, onClose, onDayEnded }: QuickEndDayModalProps) {
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<Record<number, 'tomorrow' | 'smart' | 'discard'>>(() => {
    const initial: Record<number, 'tomorrow' | 'smart' | 'discard'> = {};
    incompleteTasks.forEach(t => { initial[t.id] = 'tomorrow'; });
    return initial;
  });

  const handleChoice = (taskId: number, choice: 'tomorrow' | 'smart' | 'discard') => {
    setChoices(prev => ({ ...prev, [taskId]: choice }));
  };

  const handleConfirm = async () => {
    setLoading(true);
    const move_to_tomorrow: number[] = [];
    const move_to_smart: number[] = [];
    const discard: number[] = [];
    for (const t of incompleteTasks) {
      const choice = choices[t.id] || 'tomorrow';
      if (choice === 'tomorrow') move_to_tomorrow.push(t.id);
      else if (choice === 'smart') move_to_smart.push(t.id);
      else discard.push(t.id);
    }
    const res = await quickTaskService.endOfDay(model, { move_to_tomorrow, move_to_smart, discard });
    setLoading(false);
    if (res) onDayEnded(res);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌙</span>
            <span className="font-heading text-base font-bold text-foreground">End My Day</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse">Wrapping up your day...</p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-around text-center">
                <div>
                  <span className="block text-xl font-bold text-primary">{completedCount}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Completed</span>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <span className="block text-xl font-bold text-amber-500">{incompleteTasks.length}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Incomplete</span>
                </div>
              </div>

              {incompleteTasks.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-amber-500">📅 What should happen to incomplete tasks?</h4>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-clean pr-1">
                    {incompleteTasks.map(t => (
                      <div key={t.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                        <p className="text-xs font-semibold truncate text-foreground">{t.title}</p>
                        <div className="flex gap-2">
                          {(['tomorrow', 'smart', 'discard'] as const).map(act => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => handleChoice(t.id, act)}
                              className={`flex-1 py-1 rounded text-[10px] font-semibold transition-smooth border ${
                                choices[t.id] === act
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {act === 'tomorrow' ? '🌅 Tomorrow' : act === 'smart' ? '🧠 To Smart Todo' : '🗑️ Discard'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Everything's done. Nice work! 🎉</p>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="p-4 border-t border-border flex justify-end">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-smooth"
            >
              End Day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanSlot({ task }: { task: any }) {
  return (
    <div className={`p-2.5 rounded-lg border bg-card shadow-sm ${task.is_top_20 ? 'border-amber-400/50 ring-1 ring-amber-400/20' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          {task.is_top_20 && <span title="Top 20% Task">⭐</span>}
          {task.title}
        </span>
        {task.allocated_time && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 shrink-0">
            {task.allocated_time}
          </span>
        )}
      </div>
      {task.reason && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{task.reason}</p>}
    </div>
  );
}
