'use client';

import { useEffect, useRef, useState } from 'react';
import VideoLinks from '@/components/ui/VideoLinks';
import { putModuleVideos, type ModuleVideo } from '../services/lmsVideoService';
import type { LmsSubject } from '../types';

/**
 * The video links of one module (or one sub-step) of a project's outline. They are stored inside the outline entry
 * itself, so they travel with it when it is reordered; there are no rows of their own. Every change replaces the
 * entry's whole list (`PUT .../videos`) and the server answers with the project, which is handed to `onChanged` so
 * the page can update its copy of the outline.
 *
 * `videos` is the list as the page has it now (from the project's `project_plan`). Adding several links in a row
 * works because the latest list is kept in a ref, not read from a stale render.
 */
export default function ModuleVideos({
  projectId,
  moduleIndex,
  subIndex,
  videos,
  canEdit,
  onChanged,
  heading = 'Videos',
  compact = true,
}: {
  projectId: string;
  moduleIndex: number;
  /** Set for a sub-step of the module; leave out for the module itself. */
  subIndex?: number;
  videos: ModuleVideo[];
  canEdit: boolean;
  onChanged: (project: LmsSubject) => void;
  heading?: string;
  compact?: boolean;
}) {
  const [list, setList] = useState<ModuleVideo[]>(videos);
  const latest = useRef<ModuleVideo[]>(videos);
  const [saving, setSaving] = useState(false);

  // The page loaded another version of the outline (or another module): follow it.
  useEffect(() => {
    latest.current = videos;
    setList(videos);
  }, [videos]);

  const save = async (next: ModuleVideo[]) => {
    const before = latest.current;
    latest.current = next;
    setList(next);
    setSaving(true);
    try {
      const project = await putModuleVideos(projectId, moduleIndex, subIndex, next);
      const module = project.project_plan?.[moduleIndex];
      const entry = subIndex === undefined ? module : module?.sublessons?.[subIndex];
      // What the server stored (trimmed, cleaned) is what is shown from now on.
      if (entry?.videos) {
        latest.current = entry.videos;
        setList(entry.videos);
      }
      onChanged(project);
    } catch (err) {
      latest.current = before;
      setList(before);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return (
    <VideoLinks
      // A link is unique within its entry (the server refuses a repeat), so the url is its id.
      videos={list.map((video) => ({ id: video.url, url: video.url, title: video.title }))}
      canEdit={canEdit}
      heading={heading}
      compact={compact}
      audience="class"
      busy={saving}
      onAdd={(url, title) => save([...latest.current, { url, title }])}
      onRemove={(id) => save(latest.current.filter((video) => video.url !== id))}
    />
  );
}
