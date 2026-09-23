/**
 * fe-apis/lms/db.ts
 *
 * Full SQLite database operations for the AI LMS module in the Next.js frontend API layer.
 * Reuses the existing `lab_ninja.sqlite3` database via `getSQLiteDatabase('lab_ninja')`.
 */

import crypto from 'crypto';
import { getSQLiteDatabase } from '../_shared/db';
import { seedInitialLmsContent } from './seed';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ensureLmsTables(): void {
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return;
  const { db } = res;

  db.exec(`
    CREATE TABLE IF NOT EXISTS lms_classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'BookmarkIcon',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lms_subjects (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES lms_classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lms_lessons (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES lms_classes(id) ON DELETE CASCADE,
      subject_id TEXT REFERENCES lms_subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      source_type TEXT DEFAULT 'topic',
      source_content TEXT DEFAULT '',
      generated_html TEXT NOT NULL,
      summary TEXT DEFAULT '',
      read_time_minutes INTEGER DEFAULT 5,
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lms_user_progress (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      lesson_id TEXT NOT NULL REFERENCES lms_lessons(id) ON DELETE CASCADE,
      completed INTEGER DEFAULT 0,
      last_viewed_at TEXT NOT NULL
    );
  `);

  // Seed default 8 classes if empty
  const countRow = db.prepare('SELECT count(*) as count FROM lms_classes').get() as { count: number };
  if (countRow.count === 0) {
    const initialClasses = [
      { name: 'Computer Vision', slug: 'computer-vision', description: 'Deep learning, object detection, segmentation, and vision foundation models.', icon: 'CameraIcon' },
      { name: 'DSA Preparation', slug: 'dsa-preparation', description: 'Data structures, algorithmic patterns, LeetCode style problems, and complexity analysis.', icon: 'CodeBracketIcon' },
      { name: 'System Design', slug: 'system-design', description: 'Scalable distributed systems, databases, caching, message queues, and high-availability architecture.', icon: 'ServerStackIcon' },
      { name: 'Cloud Code Architect', slug: 'cloud-code-architect', description: 'Modern cloud infrastructure, AWS/GCP services, microservices, and DevOps patterns.', icon: 'CloudIcon' },
      { name: 'AI', slug: 'ai', description: 'Generative AI, Large Language Models, prompt engineering, RAG pipelines, and agent architectures.', icon: 'CpuChipIcon' },
      { name: 'Leadership', slug: 'leadership', description: 'Engineering management, technical strategy, communication, team scaling, and stakeholder alignment.', icon: 'UserGroupIcon' },
      { name: 'Interview Preparation', slug: 'interview-preparation', description: 'Behavioral answers, coding rounds, mock scenarios, and hiring bar criteria.', icon: 'AcademicCapIcon' },
      { name: 'Other', slug: 'other', description: 'Miscellaneous topics, exploratory tutorials, and standalone technical guides.', icon: 'FolderIcon' },
    ];

    const nowIso = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO lms_classes (id, name, slug, description, icon, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of initialClasses) {
      insert.run(`class-${c.slug}`, c.name, c.slug, c.description, c.icon, nowIso, nowIso);
    }
  }

  // Seed initial subjects & rich interactive lessons if lessons table is empty
  seedInitialLmsContent(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// Classes
// ─────────────────────────────────────────────────────────────────────────────

export function getAllClasses(): Record<string, unknown>[] {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return [];
  const { db } = res;

  const rows = db.prepare(`
    SELECT 
      c.id, c.name, c.slug, c.description, c.icon, c.created_at, c.updated_at,
      COUNT(DISTINCT s.id) AS subject_count,
      COUNT(DISTINCT l.id) AS lesson_count
    FROM lms_classes c
    LEFT JOIN lms_subjects s ON s.class_id = c.id
    LEFT JOIN lms_lessons l ON l.class_id = c.id
    GROUP BY c.id
    ORDER BY 
      CASE WHEN c.slug = 'other' THEN 1 ELSE 0 END ASC,
      c.name ASC
  `).all() as Record<string, unknown>[];

  return rows;
}

export function getClassByIdOrSlug(idOrSlug: string): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const cls = db.prepare(`
    SELECT 
      c.id, c.name, c.slug, c.description, c.icon, c.created_at, c.updated_at,
      COUNT(DISTINCT s.id) AS subject_count,
      COUNT(DISTINCT l.id) AS lesson_count
    FROM lms_classes c
    LEFT JOIN lms_subjects s ON s.class_id = c.id
    LEFT JOIN lms_lessons l ON l.class_id = c.id
    WHERE c.id = ? OR c.slug = ?
    GROUP BY c.id
  `).get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined;

  if (!cls) return null;

  // Subjects with their lesson counts
  const subjects = db.prepare(`
    SELECT 
      s.id, s.class_id, s.name, s.slug, s.description, s.order_index, s.created_at, s.updated_at,
      COUNT(l.id) AS lesson_count
    FROM lms_subjects s
    LEFT JOIN lms_lessons l ON l.subject_id = s.id
    WHERE s.class_id = ?
    GROUP BY s.id
    ORDER BY s.order_index ASC, s.name ASC
  `).all(cls.id) as Record<string, unknown>[];

  // Direct lessons (lessons with subject_id IS NULL)
  const directLessons = db.prepare(`
    SELECT 
      id, class_id, subject_id, title, slug, summary, read_time_minutes, order_index, created_at, updated_at
    FROM lms_lessons
    WHERE class_id = ? AND (subject_id IS NULL OR subject_id = '')
    ORDER BY order_index ASC, created_at ASC
  `).all(cls.id) as Record<string, unknown>[];

  return {
    ...cls,
    subjects,
    direct_lessons: directLessons,
  };
}

export function createClass(name: string, description: string = '', icon: string = 'BookmarkIcon'): Record<string, unknown> {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) throw new Error('Database unavailable');
  const { db } = res;

  const baseSlug = slugify(name) || 'class';
  let slug = baseSlug;
  let counter = 1;

  while (db.prepare('SELECT id FROM lms_classes WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const classId = `class-${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO lms_classes (id, name, slug, description, icon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(classId, name.trim(), slug, description.trim(), icon, nowIso, nowIso);

  return getClassByIdOrSlug(classId)!;
}

export function updateClass(idOrSlug: string, updates: { name?: string; description?: string; icon?: string }): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const current = db.prepare('SELECT * FROM lms_classes WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  if (!current) return null;

  const newName = updates.name !== undefined ? updates.name.trim() : (current.name as string);
  const newDesc = updates.description !== undefined ? updates.description.trim() : (current.description as string);
  const newIcon = updates.icon !== undefined ? updates.icon : (current.icon as string);
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE lms_classes
    SET name = ?, description = ?, icon = ?, updated_at = ?
    WHERE id = ?
  `).run(newName, newDesc, newIcon, nowIso, current.id);

  return getClassByIdOrSlug(current.id as string);
}

export function deleteClass(idOrSlug: string): boolean {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return false;
  const { db } = res;

  const current = db.prepare('SELECT id FROM lms_classes WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug) as { id: string } | undefined;
  if (!current) return false;

  db.prepare('DELETE FROM lms_lessons WHERE class_id = ?').run(current.id);
  db.prepare('DELETE FROM lms_subjects WHERE class_id = ?').run(current.id);
  db.prepare('DELETE FROM lms_classes WHERE id = ?').run(current.id);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subjects
// ─────────────────────────────────────────────────────────────────────────────

export function getSubjectsByClass(classIdOrSlug: string): Record<string, unknown>[] {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return [];
  const { db } = res;

  const cls = db.prepare('SELECT id FROM lms_classes WHERE id = ? OR slug = ?').get(classIdOrSlug, classIdOrSlug) as { id: string } | undefined;
  if (!cls) return [];

  return db.prepare(`
    SELECT 
      s.id, s.class_id, s.name, s.slug, s.description, s.order_index, s.created_at, s.updated_at,
      COUNT(l.id) AS lesson_count
    FROM lms_subjects s
    LEFT JOIN lms_lessons l ON l.subject_id = s.id
    WHERE s.class_id = ?
    GROUP BY s.id
    ORDER BY s.order_index ASC, s.name ASC
  `).all(cls.id) as Record<string, unknown>[];
}

export function getSubjectByIdOrSlug(classIdOrSlug: string, subjectIdOrSlug: string): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const cls = db.prepare('SELECT id, name, slug FROM lms_classes WHERE id = ? OR slug = ?').get(classIdOrSlug, classIdOrSlug) as { id: string; name: string; slug: string } | undefined;
  if (!cls) return null;

  const subj = db.prepare(`
    SELECT * FROM lms_subjects
    WHERE class_id = ? AND (id = ? OR slug = ?)
  `).get(cls.id, subjectIdOrSlug, subjectIdOrSlug) as Record<string, unknown> | undefined;

  if (!subj) return null;

  const lessons = db.prepare(`
    SELECT 
      id, class_id, subject_id, title, slug, summary, read_time_minutes, order_index, created_at, updated_at
    FROM lms_lessons
    WHERE subject_id = ?
    ORDER BY order_index ASC, created_at ASC
  `).all(subj.id) as Record<string, unknown>[];

  return {
    ...subj,
    class_name: cls.name,
    class_slug: cls.slug,
    lessons,
    lesson_count: lessons.length,
  };
}

export function createSubject(classIdOrSlug: string, name: string, description: string = ''): Record<string, unknown> {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) throw new Error('Database unavailable');
  const { db } = res;

  const cls = db.prepare('SELECT id FROM lms_classes WHERE id = ? OR slug = ?').get(classIdOrSlug, classIdOrSlug) as { id: string } | undefined;
  if (!cls) throw new Error('Class not found');

  const baseSlug = slugify(name) || 'subject';
  let slug = baseSlug;
  let counter = 1;

  while (db.prepare('SELECT id FROM lms_subjects WHERE class_id = ? AND slug = ?').get(cls.id, slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const countRow = db.prepare('SELECT count(*) as count FROM lms_subjects WHERE class_id = ?').get(cls.id) as { count: number };
  const orderIndex = countRow.count;
  const subjectId = `subj-${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO lms_subjects (id, class_id, name, slug, description, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(subjectId, cls.id, name.trim(), slug, description.trim(), orderIndex, nowIso, nowIso);

  return getSubjectByIdOrSlug(cls.id, subjectId)!;
}

export function updateSubject(subjectId: string, updates: { name?: string; description?: string }): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const current = db.prepare('SELECT * FROM lms_subjects WHERE id = ?').get(subjectId) as Record<string, unknown> | undefined;
  if (!current) return null;

  const newName = updates.name !== undefined ? updates.name.trim() : (current.name as string);
  const newDesc = updates.description !== undefined ? updates.description.trim() : (current.description as string);
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE lms_subjects
    SET name = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(newName, newDesc, nowIso, subjectId);

  return getSubjectByIdOrSlug(current.class_id as string, subjectId);
}

export function deleteSubject(subjectId: string): boolean {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return false;
  const { db } = res;

  const current = db.prepare('SELECT id FROM lms_subjects WHERE id = ?').get(subjectId);
  if (!current) return false;

  db.prepare('DELETE FROM lms_lessons WHERE subject_id = ?').run(subjectId);
  db.prepare('DELETE FROM lms_subjects WHERE id = ?').run(subjectId);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────────────

export function getLessonsBySubject(subjectId: string): Record<string, unknown>[] {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return [];
  const { db } = res;

  return db.prepare(`
    SELECT 
      l.id, l.class_id, l.subject_id, l.title, l.slug, l.source_type, l.summary,
      l.read_time_minutes, l.order_index, l.created_at, l.updated_at,
      c.name AS class_name, c.slug AS class_slug,
      s.name AS subject_name, s.slug AS subject_slug
    FROM lms_lessons l
    JOIN lms_classes c ON c.id = l.class_id
    LEFT JOIN lms_subjects s ON s.id = l.subject_id
    WHERE l.subject_id = ?
    ORDER BY l.order_index ASC, l.created_at ASC
  `).all(subjectId) as Record<string, unknown>[];
}

export function getDirectLessonsByClass(classIdOrSlug: string): Record<string, unknown>[] {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return [];
  const { db } = res;

  const cls = db.prepare('SELECT id FROM lms_classes WHERE id = ? OR slug = ?').get(classIdOrSlug, classIdOrSlug) as { id: string } | undefined;
  if (!cls) return [];

  return db.prepare(`
    SELECT 
      l.id, l.class_id, l.subject_id, l.title, l.slug, l.source_type, l.summary,
      l.read_time_minutes, l.order_index, l.created_at, l.updated_at,
      c.name AS class_name, c.slug AS class_slug
    FROM lms_lessons l
    JOIN lms_classes c ON c.id = l.class_id
    WHERE l.class_id = ? AND (l.subject_id IS NULL OR l.subject_id = '')
    ORDER BY l.order_index ASC, l.created_at ASC
  `).all(cls.id) as Record<string, unknown>[];
}

export function getLessonById(lessonId: string): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const lesson = db.prepare(`
    SELECT 
      l.*,
      c.name AS class_name, c.slug AS class_slug,
      s.name AS subject_name, s.slug AS subject_slug
    FROM lms_lessons l
    JOIN lms_classes c ON c.id = l.class_id
    LEFT JOIN lms_subjects s ON s.id = l.subject_id
    WHERE l.id = ? OR l.slug = ?
  `).get(lessonId, lessonId) as Record<string, unknown> | undefined;

  return lesson || null;
}

export function createLesson(data: {
  class_id: string;
  subject_id?: string | null;
  title: string;
  source_type?: string;
  source_content?: string;
  generated_html: string;
  summary?: string;
  read_time_minutes?: number;
}): Record<string, unknown> {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) throw new Error('Database unavailable');
  const { db } = res;

  const baseSlug = slugify(data.title) || 'lesson';
  let slug = baseSlug;
  let counter = 1;

  while (db.prepare('SELECT id FROM lms_lessons WHERE class_id = ? AND slug = ?').get(data.class_id, slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Compute order index
  let orderIndex = 0;
  if (data.subject_id) {
    const row = db.prepare('SELECT count(*) as count FROM lms_lessons WHERE subject_id = ?').get(data.subject_id) as { count: number };
    orderIndex = row.count;
  } else {
    const row = db.prepare("SELECT count(*) as count FROM lms_lessons WHERE class_id = ? AND (subject_id IS NULL OR subject_id = '')").get(data.class_id) as { count: number };
    orderIndex = row.count;
  }

  const lessonId = `lesson-${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO lms_lessons (
      id, class_id, subject_id, title, slug, source_type, source_content,
      generated_html, summary, read_time_minutes, order_index, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lessonId,
    data.class_id,
    data.subject_id || null,
    data.title.trim(),
    slug,
    data.source_type || 'topic',
    data.source_content || '',
    data.generated_html,
    data.summary || '',
    data.read_time_minutes || 5,
    orderIndex,
    nowIso,
    nowIso
  );

  return getLessonById(lessonId)!;
}

export function updateLesson(
  lessonId: string,
  updates: {
    title?: string;
    generated_html?: string;
    summary?: string;
    order_index?: number;
  }
): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  const current = db.prepare('SELECT * FROM lms_lessons WHERE id = ?').get(lessonId) as Record<string, unknown> | undefined;
  if (!current) return null;

  const newTitle = updates.title !== undefined ? updates.title.trim() : (current.title as string);
  const newHtml = updates.generated_html !== undefined ? updates.generated_html : (current.generated_html as string);
  const newSummary = updates.summary !== undefined ? updates.summary : (current.summary as string);
  const newOrder = updates.order_index !== undefined ? updates.order_index : (current.order_index as number);
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE lms_lessons
    SET title = ?, generated_html = ?, summary = ?, order_index = ?, updated_at = ?
    WHERE id = ?
  `).run(newTitle, newHtml, newSummary, newOrder, nowIso, current.id);

  return getLessonById(current.id as string);
}

export function deleteLesson(lessonId: string): boolean {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return false;
  const { db } = res;

  const current = db.prepare('SELECT id FROM lms_lessons WHERE id = ?').get(lessonId);
  if (!current) return false;

  db.prepare('DELETE FROM lms_user_progress WHERE lesson_id = ?').run(lessonId);
  db.prepare('DELETE FROM lms_lessons WHERE id = ?').run(lessonId);
  return true;
}

export function reorderLessons(lessonIds: string[]): boolean {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return false;
  const { db } = res;

  const nowIso = new Date().toISOString();
  const update = db.prepare('UPDATE lms_lessons SET order_index = ?, updated_at = ? WHERE id = ?');

  for (let i = 0; i < lessonIds.length; i++) {
    update.run(i, nowIso, lessonIds[i]);
  }
  return true;
}

export function getLessonNavigation(lessonId: string): Record<string, unknown> {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return { current_index: 0, total_lessons: 0, previous: null, next: null };
  const { db } = res;

  const lesson = db.prepare('SELECT id, class_id, subject_id, order_index FROM lms_lessons WHERE id = ?').get(lessonId) as { id: string; class_id: string; subject_id: string | null; order_index: number } | undefined;
  if (!lesson) return { current_index: 0, total_lessons: 0, previous: null, next: null };

  let siblings: { id: string; title: string; slug: string; order_index: number }[];
  if (lesson.subject_id) {
    siblings = db.prepare('SELECT id, title, slug, order_index FROM lms_lessons WHERE subject_id = ? ORDER BY order_index ASC, created_at ASC').all(lesson.subject_id) as any;
  } else {
    siblings = db.prepare("SELECT id, title, slug, order_index FROM lms_lessons WHERE class_id = ? AND (subject_id IS NULL OR subject_id = '') ORDER BY order_index ASC, created_at ASC").all(lesson.class_id) as any;
  }

  const idx = siblings.findIndex((s) => s.id === lesson.id);
  const previous = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return {
    current_index: idx + 1,
    total_lessons: siblings.length,
    previous: previous ? { id: previous.id, title: previous.title, slug: previous.slug } : null,
    next: next ? { id: next.id, title: next.title, slug: next.slug } : null,
  };
}

export function recordLessonView(lessonId: string, userId?: number | null): void {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return;
  const { db } = res;

  const nowIso = new Date().toISOString();
  const progressId = `prog-${crypto.randomBytes(4).toString('hex')}`;

  db.prepare(`
    INSERT INTO lms_user_progress (id, user_id, lesson_id, completed, last_viewed_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(progressId, userId || null, lessonId, nowIso);
}

export function getContinueLearning(userId?: number | null): Record<string, unknown> | null {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  const { db } = res;

  let lastProg: { lesson_id: string } | undefined;
  if (userId) {
    lastProg = db.prepare('SELECT lesson_id FROM lms_user_progress WHERE user_id = ? ORDER BY last_viewed_at DESC LIMIT 1').get(userId) as any;
  }
  if (!lastProg) {
    lastProg = db.prepare('SELECT lesson_id FROM lms_user_progress ORDER BY last_viewed_at DESC LIMIT 1').get() as any;
  }
  if (!lastProg) {
    const firstLesson = db.prepare('SELECT id as lesson_id FROM lms_lessons ORDER BY created_at DESC LIMIT 1').get() as any;
    if (!firstLesson) return null;
    lastProg = firstLesson;
  }

  const lesson = getLessonById(lastProg!.lesson_id);
  if (!lesson) return null;

  const nav = getLessonNavigation(lesson.id as string) as any;

  return {
    lesson_id: lesson.id,
    lesson_title: lesson.title,
    lesson_slug: lesson.slug,
    class_id: lesson.class_id,
    class_name: lesson.class_name,
    class_slug: lesson.class_slug,
    subject_id: lesson.subject_id,
    subject_name: lesson.subject_name,
    subject_slug: lesson.subject_slug,
    current_index: nav.current_index,
    total_lessons: nav.total_lessons,
  };
}

export function searchLms(query: string): Record<string, unknown> {
  ensureLmsTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return { query, classes: [], subjects: [], lessons: [] };
  const { db } = res;

  const q = `%${query.trim()}%`;

  const classes = db.prepare(`
    SELECT c.*, COUNT(DISTINCT s.id) as subject_count, COUNT(DISTINCT l.id) as lesson_count
    FROM lms_classes c
    LEFT JOIN lms_subjects s ON s.class_id = c.id
    LEFT JOIN lms_lessons l ON l.class_id = c.id
    WHERE c.name LIKE ? OR c.description LIKE ?
    GROUP BY c.id
    LIMIT 5
  `).all(q, q) as Record<string, unknown>[];

  const subjects = db.prepare(`
    SELECT s.*, c.name as class_name, c.slug as class_slug, COUNT(l.id) as lesson_count
    FROM lms_subjects s
    JOIN lms_classes c ON c.id = s.class_id
    LEFT JOIN lms_lessons l ON l.subject_id = s.id
    WHERE s.name LIKE ? OR s.description LIKE ?
    GROUP BY s.id
    LIMIT 8
  `).all(q, q) as Record<string, unknown>[];

  const lessons = db.prepare(`
    SELECT 
      l.id, l.class_id, l.subject_id, l.title, l.slug, l.summary, l.read_time_minutes,
      c.name as class_name, c.slug as class_slug,
      s.name as subject_name, s.slug as subject_slug
    FROM lms_lessons l
    JOIN lms_classes c ON c.id = l.class_id
    LEFT JOIN lms_subjects s ON s.id = l.subject_id
    WHERE l.title LIKE ? OR l.summary LIKE ?
    LIMIT 10
  `).all(q, q) as Record<string, unknown>[];

  return { query, classes, subjects, lessons };
}
