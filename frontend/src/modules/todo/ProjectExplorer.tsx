'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Project, ProjectNode, projectService } from '@/lib/services/projectService';

interface ProjectExplorerProps {
  project: Project;
  onClose: () => void;
  model: 'ollama' | 'gemini';
}

function NodeItem({ node, level, onAction }: { node: ProjectNode; level: number; onAction: (node: ProjectNode, action: 'dive' | 'chunk' | 'smart' | 'quick') => void }) {
  const [expanded, setExpanded] = useState(true);
  
  const hasChildren = node.children && node.children.length > 0;
  
  // Depth color coding (matching TaskTree)
  const depthColors = [
    'border-border', 
    'border-blue-500/30', 
    'border-purple-500/30', 
    'border-pink-500/30', 
    'border-amber-500/30'
  ];
  const borderClass = depthColors[Math.min(level, depthColors.length - 1)];

  return (
    <div className="flex flex-col">
      <div 
        className="group relative flex items-start gap-2 py-2 pr-2 rounded-lg hover:bg-muted/30 transition-smooth"
        style={{ paddingLeft: `${level * 24}px` }}
      >
        {/* Indent Guide Line */}
        {level > 0 && (
          <div 
            className={`absolute left-[11px] top-0 bottom-0 w-px ${borderClass}`} 
            style={{ left: `${(level * 24) - 13}px` }}
          />
        )}

        {/* Expand/Collapse Toggle */}
        <div className="w-4 flex items-center justify-center shrink-0 mt-0.5 z-10 bg-card">
          {hasChildren ? (
            <button 
              onClick={() => setExpanded(!expanded)} 
              className="text-muted-foreground hover:text-foreground transition-smooth"
            >
              <Icon name={expanded ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={12} />
            </button>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-border" />
          )}
        </div>

        {/* Node Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${node.exported_to_smart_todo || node.exported_to_quick ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {node.title}
            </span>
            
            {node.is_top_20 && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400">
                ⭐
              </span>
            )}

            {/* Badges */}
            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1 rounded-sm">
              {node.node_type}
            </span>
            {node.generation_type !== 'manual' && (
              <span className="text-[9px] uppercase tracking-wider font-semibold text-blue-500 bg-blue-500/10 px-1 rounded-sm">
                AI {node.generation_type.replace('_', ' ')}
              </span>
            )}
            
            {/* Exported Badges */}
            {node.exported_to_smart_todo && (
              <span className="text-[9px] font-bold text-emerald-500 flex items-center gap-0.5">
                <Icon name="CheckIcon" size={10} /> Smart To-Do
              </span>
            )}
            {node.exported_to_quick && (
              <span className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5">
                <Icon name="CheckIcon" size={10} /> Quick Daily
              </span>
            )}
          </div>

          {/* Action Buttons (visible on hover) */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 mt-1 transition-opacity">
            <button
              onClick={() => onAction(node, 'dive')}
              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-smooth"
            >
              🔍 Dive Deeper
            </button>
            <button
              onClick={() => onAction(node, 'chunk')}
              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-smooth"
            >
              ⚡ Chunk It
            </button>
            <div className="w-px h-3 bg-border mx-1" />
            <button
              onClick={() => onAction(node, 'smart')}
              disabled={node.exported_to_smart_todo}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border hover:bg-muted transition-smooth disabled:opacity-50 flex items-center gap-1"
            >
              <span>🧠</span> → Smart To-Do
            </button>
            <button
              onClick={() => onAction(node, 'quick')}
              disabled={node.exported_to_quick}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border hover:bg-muted transition-smooth disabled:opacity-50 flex items-center gap-1"
            >
              <span>⚡</span> → Quick Daily
            </button>
          </div>
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <NodeItem key={child.id} node={child} level={level + 1} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectExplorer({ project, onClose, model }: ProjectExplorerProps) {
  const [nodes, setNodes] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadTree = async () => {
    setLoading(true);
    const tree = await projectService.fetchProjectTree(project.id);
    setNodes(tree);
    setLoading(false);
  };

  useEffect(() => {
    loadTree();
  }, [project.id]);

  const handleAction = async (node: ProjectNode, action: 'dive' | 'chunk' | 'smart' | 'quick') => {
    setActionLoading(`${action}-${node.id}`);
    
    if (action === 'dive' || action === 'chunk') {
      if (node.depth_level >= 4) {
        if (!confirm('This node is quite deep. AI generation might lose context. Continue?')) {
          setActionLoading(null);
          return;
        }
      }
      
      if (action === 'dive') {
        await projectService.diveDeeper(node.id, model);
      } else {
        await projectService.chunkIt(node.id, model);
      }
      await loadTree();
    } else if (action === 'smart') {
      await projectService.moveToSmart(node.id);
      await loadTree();
    } else if (action === 'quick') {
      await projectService.moveToQuick(node.id);
      await loadTree();
    }
    
    setActionLoading(null);
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-smooth"
          >
            <Icon name="ArrowLeftIcon" size={14} />
          </button>
          
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-sm"
              style={{ backgroundColor: `${project.color || '#3b82f6'}20`, border: `1px solid ${project.color || '#3b82f6'}40` }}
            >
              {project.icon || '📁'}
            </div>
            <div>
              <h2 className="font-heading font-semibold text-foreground text-sm flex items-center gap-2">
                {project.title}
                {project.is_top_20 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 shadow-sm">
                    ⭐ Top 20%
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                <span className="uppercase">{project.status}</span>
                <span>•</span>
                <span>{project.priority.toUpperCase()}</span>
                {project.due_date && (
                  <>
                    <span>•</span>
                    <span>Due: {project.due_date}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const title = prompt('Enter new topic or task title:');
            if (title) {
              projectService.createNode(project.id, { title, node_type: 'topic' }).then(() => loadTree());
            }
          }}
          className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold rounded-lg transition-smooth flex items-center gap-1.5"
        >
          <Icon name="PlusIcon" size={14} /> Add Root Node
        </button>
      </div>

      {/* Breadcrumb / Description */}
      {project.description && (
        <div className="px-4 py-3 border-b border-border/50 bg-black/5 dark:bg-white/5">
          <p className="text-xs text-muted-foreground italic">
            "{project.description}"
          </p>
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-clean relative">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading project explorer...</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
            <span className="text-4xl">🌱</span>
            <div className="text-center">
              <p className="text-sm font-medium">This project is empty.</p>
              <p className="text-xs mt-1">Add a root node to start building your structure.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {nodes.map(node => (
              <NodeItem key={node.id} node={node} level={0} onAction={handleAction} />
            ))}
          </div>
        )}

        {/* Global Loading Overlay for Actions */}
        {actionLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-50">
            <div className="bg-card border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-xs font-bold text-foreground">Processing...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
