export interface SDTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  scale: string;
  difficulty: 'Easy' | 'Easy-Medium' | 'Medium' | 'Medium-Hard' | 'Hard';
  isLLD?: boolean;
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
}
