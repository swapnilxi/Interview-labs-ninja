export interface DSATopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  prerequisites: string[];
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
  isCustom?: boolean;
  /** Everyone sees it (seed topics, or one an admin shared); false = only its owner. */
  isShared?: boolean;
  /** A shared topic this user changed: they see their own version. */
  isModified?: boolean;
}
