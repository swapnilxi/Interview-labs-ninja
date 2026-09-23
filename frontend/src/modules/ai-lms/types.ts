export interface LmsClass {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  is_system: number;
  subject_count: number;
  lesson_count: number;
  subjects?: LmsSubject[];
  direct_lessons?: LmsLesson[];
  created_at: string;
  updated_at: string;
}

export interface LmsSubject {
  id: string;
  class_id: string;
  name: string;
  slug: string;
  description: string;
  order_index: number;
  lesson_count: number;
  lessons?: LmsLesson[];
  class?: LmsClass;
  created_at: string;
  updated_at: string;
}

export interface LmsLesson {
  id: string;
  class_id: string;
  subject_id: string | null;
  title: string;
  slug: string;
  order_index: number;
  source_type: 'topic' | 'text' | 'file' | 'manual';
  source_content?: string;
  generated_html?: string;
  summary: string;
  read_time_minutes: number;
  class_name?: string;
  class_slug?: string;
  subject_name?: string | null;
  subject_slug?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmsSiblingLesson {
  id: string;
  slug: string;
  title: string;
  order_index: number;
}

export interface LmsNavigation {
  current_index: number;
  total_lessons: number;
  previous: LmsSiblingLesson | null;
  next: LmsSiblingLesson | null;
}

export interface ContinueLearningItem {
  lesson_id: string;
  lesson_title: string;
  lesson_slug: string;
  class_id: string;
  class_name: string;
  class_slug: string;
  subject_id: string | null;
  subject_name: string | null;
  subject_slug: string | null;
  current_index: number;
  total_lessons: number;
}

export interface GenerateLessonRequest {
  class_id: string;
  subject_id?: string | null;
  input_type: 'topic' | 'text' | 'file';
  content: string;
  title?: string;
}

export interface LmsSearchResult {
  query: string;
  classes: LmsClass[];
  subjects: (LmsSubject & { class_name?: string; class_slug?: string })[];
  lessons: (LmsLesson & {
    class_name?: string;
    class_slug?: string;
    subject_name?: string | null;
    subject_slug?: string | null;
  })[];
}

export interface VisualExplanationResult {
  visual_type: string;
  title: string;
  explanation: string;
  visual_html: string;
}
